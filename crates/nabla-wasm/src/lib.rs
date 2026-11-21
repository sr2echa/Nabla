//! The lab's view of one game. Rules, fields, and move choice all stay in
//! `nabla-core`; this file only turns them into JSON for the page.

use nabla_core::select::decide;
use nabla_core::{EvalConfig, Level, Params, SearchConfig, board, picture_with_config, transport};
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, Color, EnPassantMode, Move, Position, Role, Square};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Lab {
    pos: Chess,
    history: Vec<u64>,
    params: Params,
    level: Level,
    temperature: f32,
    seed: u64,
    game: u64,
}

impl Default for Lab {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Lab {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Lab {
        let pos = Chess::default();
        Lab {
            history: vec![board::hash(&pos)],
            pos,
            params: Params::default(),
            level: Level::Reply,
            temperature: 0.0,
            seed: 1,
            game: 1,
        }
    }

    pub fn set_level(&mut self, level: u8) {
        if let Some(level) = Level::from_index(i64::from(level)) {
            self.level = level;
        }
    }

    /// Temperature in pawn units. Zero plays the best move.
    pub fn set_temperature(&mut self, pawns: f32) {
        self.temperature = pawns.clamp(0.0, 5.0);
    }

    pub fn fen(&self) -> String {
        Fen::from_position(&self.pos, EnPassantMode::Legal).to_string()
    }

    pub fn turn(&self) -> String {
        nabla_core::turn_name(&self.pos).to_string()
    }

    pub fn reset(&mut self) {
        self.pos = Chess::default();
        self.history = vec![board::hash(&self.pos)];
        self.game += 1;
    }

    pub fn load(&mut self, fen: &str) -> Result<(), JsError> {
        let pos = Fen::from_ascii(fen.as_bytes())
            .map_err(|e| JsError::new(&e.to_string()))?
            .into_position(CastlingMode::Standard)
            .map_err(|e| JsError::new(&e.to_string()))?;
        self.history = vec![board::hash(&pos)];
        self.pos = pos;
        self.game += 1;
        Ok(())
    }

    /// Rebuild position and repetition history from a starting FEN and UCI
    /// move sequence without advancing the game counter (used for undo/scrub).
    pub fn replay(&mut self, start_fen: &str, uci_moves: &str) -> Result<(), JsError> {
        let mut pos = Fen::from_ascii(start_fen.as_bytes())
            .map_err(|e| JsError::new(&e.to_string()))?
            .into_position::<Chess>(CastlingMode::Standard)
            .map_err(|e| JsError::new(&e.to_string()))?;
        let mut history = vec![board::hash(&pos)];
        for token in uci_moves.split_whitespace() {
            let m = UciMove::from_ascii(token.as_bytes())
                .map_err(|e| JsError::new(&e.to_string()))?
                .to_move(&pos)
                .map_err(|e| JsError::new(&e.to_string()))?;
            pos.play_unchecked(m);
            history.push(board::hash(&pos));
        }
        self.pos = pos;
        self.history = history;
        Ok(())
    }

    /// Legal moves as a JSON array of `{uci, san, from, to}`.
    pub fn moves(&self) -> String {
        let mut out = String::from("[");
        for (n, m) in self.pos.legal_moves().into_iter().enumerate() {
            if n > 0 {
                out.push(',');
            }
            push_move(&mut out, &self.pos, m);
        }
        out.push(']');
        out
    }

    pub fn push(&mut self, uci: &str) -> Result<(), JsError> {
        let m = UciMove::from_ascii(uci.as_bytes())
            .map_err(|e| JsError::new(&e.to_string()))?
            .to_move(&self.pos)
            .map_err(|e| JsError::new(&e.to_string()))?;
        self.pos.play_unchecked(m);
        self.history.push(board::hash(&self.pos));
        Ok(())
    }

    /// The current position's fields and energy. This does not choose a move.
    pub fn view(&self) -> String {
        let cfg = EvalConfig {
            realisable_capture: self.level == Level::Field,
            disabled: 0,
        };
        let pic = picture_with_config(&self.pos, &self.params, &cfg);
        let mut out = String::from("{");
        push_status(&mut out, &self.pos, &self.history);
        out.push_str(",\"energy\":");
        push_terms(&mut out, &pic.energy);
        out.push_str(",\"control\":");
        push_floats(&mut out, &pic.control);
        out.push_str(",\"tension\":");
        push_floats(&mut out, &pic.tension);
        out.push_str(",\"threats\":");
        push_floats(&mut out, &pic.threats);
        out.push('}');
        out
    }

    /// Direct and X-ray contributors bearing on LERF square `sq` (0..64).
    pub fn explain_square(&self, sq: u8) -> Result<String, JsError> {
        let square =
            Square::try_from(sq).map_err(|_| JsError::new("square index must be in 0..64"))?;
        let sources = transport::square_sources(self.pos.board(), &self.params, square);
        let mut out = String::from("{\"square\":");
        push_str(&mut out, &square.to_string());
        for (label, want_xray) in [("direct", false), ("xray", true)] {
            out.push_str(",\"");
            out.push_str(label);
            out.push_str("\":{");
            for (ci, (cname, color)) in [("white", Color::White), ("black", Color::Black)]
                .iter()
                .enumerate()
            {
                if ci > 0 {
                    out.push(',');
                }
                out.push('"');
                out.push_str(cname);
                out.push_str("\":[");
                let mut first = true;
                for s in sources
                    .iter()
                    .filter(|s| s.xray == want_xray && s.color == *color)
                {
                    if !first {
                        out.push(',');
                    }
                    first = false;
                    out.push_str("{\"role\":");
                    push_str(&mut out, role_name(s.role));
                    out.push_str(",\"square\":");
                    push_str(&mut out, &s.from.to_string());
                    out.push_str(",\"weight\":");
                    push_num(&mut out, s.weight);
                    out.push('}');
                }
                out.push(']');
            }
            out.push('}');
        }
        out.push('}');
        Ok(out)
    }

    /// Choose a move and explain the candidates.
    pub fn analyze(&self) -> String {
        let cfg = SearchConfig {
            level: self.level,
            temperature: self.temperature,
            seed: self.seed,
            game: self.game,
            ..SearchConfig::default()
        };
        let decision = decide(&self.pos, &self.history, &self.params, &cfg);
        let mut out = String::from("{\"best\":");
        match decision.best {
            Some(m) => {
                out.push('"');
                out.push_str(&m.to_uci(CastlingMode::Standard).to_string());
                out.push('"');
            }
            None => out.push_str("null"),
        }
        out.push_str(",\"level\":");
        out.push_str(&self.level.index().to_string());
        out.push_str(",\"nodes\":");
        out.push_str(&decision.nodes.to_string());
        out.push_str(",\"candidates\":[");
        for (n, c) in decision.candidates.iter().take(8).enumerate() {
            if n > 0 {
                out.push(',');
            }
            out.push_str("{\"uci\":");
            push_str(&mut out, &c.uci);
            out.push_str(",\"san\":");
            push_str(&mut out, &San::from_move(&self.pos, c.mv).to_string());
            out.push_str(",\"q\":");
            push_num(&mut out, c.q);
            out.push_str(",\"prob\":");
            push_num(&mut out, c.prob as f32);
            out.push_str(",\"terms\":");
            match &c.explain {
                Some(t) => push_terms(&mut out, t),
                None => out.push_str("null"),
            }
            out.push('}');
        }
        out.push_str("]}");
        out
    }
}

fn push_move(out: &mut String, pos: &Chess, m: Move) {
    let uci = m.to_uci(CastlingMode::Standard).to_string();
    out.push_str("{\"uci\":");
    push_str(out, &uci);
    out.push_str(",\"san\":");
    push_str(out, &San::from_move(pos, m).to_string());
    out.push_str(",\"from\":");
    push_str(out, &uci[..2]);
    out.push_str(",\"to\":");
    push_str(out, &uci[2..4]);
    out.push('}');
}

fn push_status(out: &mut String, pos: &Chess, history: &[u64]) {
    let end = nabla_core::outcome(pos, history);
    out.push_str("\"turn\":");
    push_str(out, nabla_core::turn_name(pos));
    out.push_str(",\"state\":");
    push_str(out, end.state);
    out.push_str(",\"detail\":");
    push_str(out, end.detail);
}

fn push_terms(out: &mut String, t: &nabla_core::Terms) {
    out.push('{');
    for (n, term) in nabla_core::Term::ALL.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        push_str(out, term.name());
        out.push(':');
        push_num(out, t.get(*term));
    }
    out.push_str(",\"total\":");
    push_num(out, t.total());
    out.push('}');
}

fn push_floats(out: &mut String, values: &[f32; 64]) {
    out.push('[');
    for (n, v) in values.iter().enumerate() {
        if n > 0 {
            out.push(',');
        }
        push_num(out, *v);
    }
    out.push(']');
}

fn push_str(out: &mut String, text: &str) {
    out.push('"');
    for ch in text.chars() {
        if ch == '"' || ch == '\\' {
            out.push('\\');
        }
        out.push(ch);
    }
    out.push('"');
}

fn push_num(out: &mut String, value: f32) {
    if value.is_finite() {
        out.push_str(&format!("{value:.4}"));
    } else {
        out.push('0');
    }
}

fn role_name(role: Role) -> &'static str {
    match role {
        Role::Pawn => "pawn",
        Role::Knight => "knight",
        Role::Bishop => "bishop",
        Role::Rook => "rook",
        Role::Queen => "queen",
        Role::King => "king",
    }
}
