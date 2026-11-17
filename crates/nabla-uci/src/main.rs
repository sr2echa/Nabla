//! UCI front end of Nabla (05 §4).
//!
//! Standard UCI plus four analysis commands: `eval`, `explain [n]`, `fields`,
//! and `bench`. Running `nabla bench` from the shell prints the bench result
//! and exits.

use std::io::{self, BufRead};
use std::time::Instant;

use nabla_core::board::{self, COLORS};
use nabla_core::select::{mate_in, static_eval};
use nabla_core::{Decision, Level, Params, SearchConfig, Term, decide, transport};
use shakmaty::fen::Fen;
use shakmaty::uci::UciMove;
use shakmaty::{CastlingMode, Chess, EnPassantMode, Position, Square};

const NAME: &str = concat!("Nabla ", env!("CARGO_PKG_VERSION"));
const AUTHOR: &str = "Sreecharan S.";

/// Remaining clock time below which Level 2 falls back to Level 1 (03 §7).
const LOW_TIME_MS: u64 = 100;
/// Conservative search speed used to turn a time budget into a node budget
/// (03 §7); measured speed is about 140 nodes/ms on a 2017 laptop CPU.
const NODES_PER_MS: u64 = 8;
/// Default time reserved for process and protocol overhead per move; the
/// `Move Overhead` option overrides it.
const DEFAULT_OVERHEAD_MS: u64 = 50;

/// Fixed bench suite: opening, middlegame, tactical, and endgame positions.
const BENCH: &[&str] = &[
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5",
    "2r3k1/pp3ppp/2n5/3p4/3P4/2N5/PP3PPP/2R3K1 w - - 0 1",
    "1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1",
    "1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1",
    "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
    "8/8/8/8/8/2k5/8/1K1Q4 w - - 0 1",
    "8/8/8/8/4k3/8/8/R3K3 w - - 0 1",
    "8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1",
];

struct Engine {
    pos: Chess,
    history: Vec<u64>,
    params: Params,
    cfg: SearchConfig,
    multipv: usize,
    overhead_ms: u64,
    pending: Option<String>,
}

impl Engine {
    fn new() -> Engine {
        let pos = Chess::default();
        Engine {
            history: vec![board::hash(&pos)],
            pos,
            params: Params::default(),
            cfg: SearchConfig::default(),
            multipv: 1,
            overhead_ms: DEFAULT_OVERHEAD_MS,
            pending: None,
        }
    }

    /// Handle one input line; returns `false` on `quit`.
    fn handle(&mut self, line: &str) -> bool {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let Some((&cmd, args)) = tokens.split_first() else {
            return true;
        };
        match cmd {
            "uci" => self.uci(),
            "isready" => println!("readyok"),
            "ucinewgame" => {
                self.pos = Chess::default();
                self.history = vec![board::hash(&self.pos)];
                self.pending = None;
                self.cfg.game += 1;
            }
            "setoption" => self.setoption(args),
            "position" => self.position(args),
            "go" => self.go(args),
            "stop" | "ponderhit" => {
                if let Some(best) = self.pending.take() {
                    println!("{best}");
                }
            }
            "quit" => return false,
            "eval" => self.eval(),
            "explain" => self.explain(args.first().and_then(|n| n.parse().ok()).unwrap_or(5)),
            "fields" => self.fields(),
            "bench" => bench(&self.params, bench_level(args)),
            "d" => println!("{}", Fen::from_position(&self.pos, EnPassantMode::Legal)),
            _ => println!("info string unknown command: {cmd}"),
        }
        true
    }

    fn uci(&self) {
        println!("id name {NAME}");
        println!("id author {AUTHOR}");
        println!("option name Level type spin default 2 min 0 max 2");
        println!("option name Temperature type spin default 0 min 0 max 500");
        println!("option name Contempt type spin default 15 min -100 max 100");
        println!("option name Seed type spin default 0 min 0 max 2147483647");
        println!("option name MultiPV type spin default 1 min 1 max 256");
        println!(
            "option name Move Overhead type spin default {DEFAULT_OVERHEAD_MS} min 0 max 5000"
        );
        println!("uciok");
    }

    fn setoption(&mut self, args: &[&str]) {
        let name_at = args.iter().position(|t| t.eq_ignore_ascii_case("name"));
        let value_at = args.iter().position(|t| t.eq_ignore_ascii_case("value"));
        let Some(n) = name_at else { return };
        let name = args[n + 1..value_at.unwrap_or(args.len())].join(" ");
        let value = value_at
            .map(|v| args[v + 1..].join(" "))
            .unwrap_or_default();
        let int = value.parse::<i64>().ok();
        let lower = name.to_ascii_lowercase();
        let ok = match (lower.as_str(), int) {
            ("level", Some(v)) => Level::from_index(v).map(|l| self.cfg.level = l).is_some(),
            ("temperature", Some(v)) if (0..=500).contains(&v) => {
                self.cfg.temperature = v as f32 / 100.0;
                true
            }
            ("contempt", Some(v)) if (-100..=100).contains(&v) => {
                self.cfg.contempt = v as f32 / 100.0;
                true
            }
            ("seed", Some(v)) if v >= 0 => {
                self.cfg.seed = v as u64;
                true
            }
            ("multipv", Some(v)) if (1..=256).contains(&v) => {
                self.multipv = v as usize;
                true
            }
            ("move overhead", Some(v)) if (0..=5000).contains(&v) => {
                self.overhead_ms = v as u64;
                true
            }
            ("uci_limitstrength" | "uci_elo", _) => {
                println!("info string strength limiting needs a calibration table (Milestone 5)");
                true
            }
            (other, _) if other.starts_with("param_") => {
                let symbol = &name["param_".len()..];
                int.is_some_and(|v| self.params.set(symbol, v as f32 / 1000.0))
            }
            (other, _) if other.starts_with("ablate_") => {
                match (Term::from_name(&name["ablate_".len()..]), value.as_str()) {
                    (Some(t), "true") => {
                        self.cfg.eval.set_enabled(t, false);
                        true
                    }
                    (Some(t), "false") => {
                        self.cfg.eval.set_enabled(t, true);
                        true
                    }
                    _ => false,
                }
            }
            _ => false,
        };
        if !ok {
            println!("info string error: invalid option '{name}' or value '{value}'");
        }
    }

    fn position(&mut self, args: &[&str]) {
        match parse_position(args) {
            Ok((pos, history)) => {
                self.pos = pos;
                self.history = history;
            }
            Err(e) => println!("info string error: {e}"),
        }
    }

    fn go(&mut self, args: &[&str]) {
        let value = |key: &str| {
            args.iter()
                .position(|t| *t == key)
                .and_then(|i| args.get(i + 1))
                .and_then(|v| v.parse::<i64>().ok())
        };
        let deferred = args.contains(&"infinite") || args.contains(&"ponder");
        let my_time = if self.pos.turn().is_white() {
            value("wtime")
        } else {
            value("btime")
        };
        let my_inc = if self.pos.turn().is_white() {
            value("winc")
        } else {
            value("binc")
        };
        let mut cfg = self.cfg.clone();
        if cfg.level == Level::Reply && my_time.is_some_and(|t| t < LOW_TIME_MS as i64) {
            cfg.level = Level::Quiescent;
        }
        cfg.node_limit = if deferred {
            None
        } else if let Some(nodes) = value("nodes") {
            Some(nodes.max(1) as u64)
        } else {
            let budget_ms = match (value("movetime"), my_time) {
                (Some(movetime), _) => Some(movetime),
                (None, Some(time)) => {
                    let inc = my_inc.unwrap_or(0);
                    Some((time / 40 + inc * 3 / 4).min(time / 8))
                }
                (None, None) => None,
            };
            budget_ms
                .map(|ms| (ms.max(0) as u64).saturating_sub(self.overhead_ms).max(1) * NODES_PER_MS)
        };

        let start = Instant::now();
        let decision = decide(&self.pos, &self.history, &self.params, &cfg);
        let ms = start.elapsed().as_millis() as u64;
        report(&decision, cfg.level, self.multipv, ms, cfg.temperature);
        if decision.budget_exhausted {
            println!("info string node budget reached: some root moves kept their Level 0 score");
        }

        let best = match decision.best {
            Some(m) => format!("bestmove {}", m.to_uci(CastlingMode::Standard)),
            None => "bestmove 0000".to_string(),
        };
        if deferred {
            self.pending = Some(best)
        } else {
            println!("{best}")
        }
    }

    fn eval(&self) {
        let (terms, e) = static_eval(&self.pos, &self.params, &self.cfg.eval);
        println!("term     energy (pawns, White-positive)");
        for t in Term::ALL {
            println!("{:<8} {:+.3}", t.name(), terms.get(t));
        }
        println!("{:<8} {:+.3}", "total", terms.total());
        println!("side to move value e(S) = {e:+.3}");
    }

    fn explain(&self, n: usize) {
        let decision = decide(&self.pos, &self.history, &self.params, &self.cfg);
        let header: Vec<&str> = Term::ALL.iter().map(|t| t.name()).collect();
        println!(
            "{:<7} {:>8} {:>6}  {}",
            "move",
            "Q",
            "prob",
            header.join("  ")
        );
        for c in decision.candidates.iter().take(n) {
            let terms = match &c.explain {
                Some(t) => t
                    .as_array()
                    .iter()
                    .map(|v| format!("{v:+.2}"))
                    .collect::<Vec<_>>()
                    .join(" "),
                None => "(terminal line)".to_string(),
            };
            println!("{:<7} {:>+8.3} {:>6.3}  {terms}", c.uci, c.q, c.prob);
        }
    }

    fn fields(&self) {
        let f = transport::compute(self.pos.board(), &self.params);
        for c in COLORS {
            println!(
                "Influence field Phi_{} (A + chi X):",
                if c.is_white() { 'W' } else { 'B' }
            );
            print_grid(|sq| f.influence(c, sq));
        }
        println!("Control Omega = tanh((Phi_W - Phi_B) / phi_0):");
        print_grid(|sq| f.control(sq));
    }
}

fn print_grid(value: impl Fn(Square) -> f32) {
    for rank in (0..8).rev() {
        let row: Vec<String> = (0..8)
            .map(|file| {
                format!(
                    "{:6.2}",
                    value(board::square_at(file, rank).expect("on board"))
                )
            })
            .collect();
        println!("{} {}", rank + 1, row.join(" "));
    }
    println!(
        "  {}",
        ["a", "b", "c", "d", "e", "f", "g", "h"]
            .map(|f| format!("{f:>6}"))
            .join(" ")
    );
}

fn parse_position(args: &[&str]) -> Result<(Chess, Vec<u64>), String> {
    let moves_at = args
        .iter()
        .position(|t| *t == "moves")
        .unwrap_or(args.len());
    let mut pos: Chess = match args.first() {
        Some(&"startpos") => Chess::default(),
        Some(&"fen") => {
            let fen = args[1..moves_at].join(" ");
            Fen::from_ascii(fen.as_bytes())
                .map_err(|e| format!("invalid FEN '{fen}': {e}"))?
                .into_position(CastlingMode::Standard)
                .map_err(|e| format!("illegal position '{fen}': {e}"))?
        }
        _ => return Err("position requires 'startpos' or 'fen'".to_string()),
    };
    let mut history = vec![board::hash(&pos)];
    for text in args.iter().skip(moves_at + 1) {
        let m = UciMove::from_ascii(text.as_bytes())
            .map_err(|e| format!("invalid move '{text}': {e}"))?
            .to_move(&pos)
            .map_err(|e| format!("illegal move '{text}': {e}"))?;
        pos.play_unchecked(m);
        history.push(board::hash(&pos));
    }
    Ok((pos, history))
}

/// UCI `info` lines for the top `multipv` candidates (03 §6).
fn report(d: &Decision, level: Level, multipv: usize, ms: u64, tau: f32) {
    let depth = if level == Level::Reply { 2 } else { 1 };
    let nps = d.nodes * 1000 / ms.max(1);
    for (k, c) in d.candidates.iter().take(multipv).enumerate() {
        let score = match mate_in(c.q) {
            Some(n) => format!("mate {n}"),
            None => format!("cp {}", (c.q * 100.0).round() as i64),
        };
        let pv: Vec<String> = pv_uci(c);
        println!(
            "info depth {depth} seldepth {} multipv {} score {score} nodes {} nps {nps} time {ms} pv {}",
            d.seldepth.max(1),
            k + 1,
            d.nodes,
            pv.join(" ")
        );
    }
    if let (true, Some(chosen)) = (tau > 0.0, d.best) {
        if let Some(c) = d.candidates.iter().find(|c| c.mv == chosen) {
            println!(
                "info string chosen {} q {:.3} prob {:.3}",
                c.uci, c.q, c.prob
            );
        }
        println!(
            "info string level {} temperature {tau:.2} entropy {:.3}",
            level.index(),
            d.entropy
        );
    }
}

fn pv_uci(c: &nabla_core::Candidate) -> Vec<String> {
    c.pv.iter()
        .map(|m| m.to_uci(CastlingMode::Standard).to_string())
        .collect()
}

/// Level for `bench [level]`; the default (and the checksum reference) is 2.
fn bench_level<S: AsRef<str>>(args: &[S]) -> Level {
    args.first()
        .and_then(|a| a.as_ref().parse().ok())
        .and_then(Level::from_index)
        .unwrap_or(Level::Reply)
}

/// Deterministic bench: decisions on the fixed suite at `level` (05 §4).
fn bench(params: &Params, level: Level) {
    let cfg = SearchConfig {
        level,
        ..SearchConfig::default()
    };
    let mut nodes = 0u64;
    let mut evaluations = 0u64;
    let mut checksum: u64 = 0xcbf2_9ce4_8422_2325;
    let start = Instant::now();
    for fen in BENCH {
        let (pos, history) = parse_position(&["fen", fen]).expect("bench FEN is legal");
        let d = decide(&pos, &history, params, &cfg);
        nodes += d.nodes;
        evaluations += d.evaluations;
        let best = d.candidates.first();
        let bytes = best.map(|c| c.uci.clone()).unwrap_or_default();
        let q_bits = best.map_or(0, |c| c.q.to_bits());
        for b in bytes.bytes().chain(q_bits.to_le_bytes()) {
            checksum ^= u64::from(b);
            checksum = checksum.wrapping_mul(0x0100_0000_01b3);
        }
    }
    let micros = start.elapsed().as_micros() as u64;
    let ms = micros / 1000;
    println!("Level           : {}", level.index());
    println!("Positions       : {}", BENCH.len());
    println!("Nodes searched  : {nodes}");
    println!("Evaluations     : {evaluations}");
    println!("Time (ms)       : {ms}");
    println!("Nodes/second    : {}", nodes * 1_000_000 / micros.max(1));
    println!(
        "Decision (ms)   : {:.2}",
        micros as f64 / 1000.0 / BENCH.len() as f64
    );
    println!("Checksum        : {checksum:016x}");
    println!("Parameter hash  : {}", params.hash_hex());
}

fn main() {
    let mut engine = Engine::new();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|a| a == "bench") {
        bench(&engine.params, bench_level(&args[1..]));
        return;
    }
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if !engine.handle(line.trim()) {
            break;
        }
    }
}
