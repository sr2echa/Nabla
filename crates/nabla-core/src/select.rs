//! Move selection (03): boundary conditions, selection levels 0–2, and the
//! root policy of 04.

use shakmaty::{CastlingMode, Chess, Color, Move, MoveList, Position, Role};

use crate::board::{self, sign};
use crate::energy::{EvalConfig, Terms, evaluate};
use crate::params::Params;
use crate::policy;
use crate::see;

/// Mate value $M_\text{mate}$ in pawn units (03 §8).
pub const M_MATE: f32 = 1000.0;
/// Quiescence ply cap $q_\text{max}$ for captures, counted from the root (03 §8).
pub const Q_MAX_PLY: u32 = 16;
/// Hard ply cap that also stops check evasions in quiescence (03 §8).
pub const Q_HARD_PLY: u32 = 32;
/// Delta-pruning margin $\delta_\text{margin}$ in pawn units (03 §8).
pub const DELTA_MARGIN: f32 = 2.0;
/// Scores within this distance of $M_\text{mate}$ are mate scores (03 §6).
pub const MATE_BAND: f32 = 256.0;

const INF: f32 = 1.0e9;

/// Selection level (03 §4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    /// Level 0: no lookahead beyond the move, except forced check evasions.
    Field = 0,
    /// Level 1: capture-only quiescent relaxation.
    Quiescent = 1,
    /// Level 2: one full-width reply plus quiescence.
    Reply = 2,
}

impl Level {
    pub fn from_index(i: i64) -> Option<Level> {
        match i {
            0 => Some(Level::Field),
            1 => Some(Level::Quiescent),
            2 => Some(Level::Reply),
            _ => None,
        }
    }

    pub fn index(self) -> u32 {
        self as u32
    }
}

/// Selection and policy settings.
#[derive(Clone, Debug, PartialEq)]
pub struct SearchConfig {
    pub level: Level,
    /// Policy temperature $\tau$ in pawn units; 0 selects the argmax.
    pub temperature: f32,
    /// Contempt $\delta_\text{draw}$ in pawn units (03 §3).
    pub contempt: f32,
    /// Random seed for the policy (04 §2).
    pub seed: u64,
    /// Game counter mixed into the policy's random key (04 §2).
    pub game: u64,
    /// Node budget (03 §7). When it runs out, root moves not yet searched
    /// keep their Level 0 score. `None` searches every root move fully.
    pub node_limit: Option<u64>,
    /// Ablation switches; the realisable-capture flag is set from `level`.
    pub eval: EvalConfig,
}

impl Default for SearchConfig {
    fn default() -> Self {
        SearchConfig {
            level: Level::Reply,
            temperature: 0.0,
            contempt: 0.15,
            seed: 0,
            game: 0,
            node_limit: None,
            eval: EvalConfig::default(),
        }
    }
}

/// A principal variation and whether it ended in a terminal state.
#[derive(Clone, Debug, Default)]
struct Line {
    moves: Vec<Move>,
    terminal: bool,
}

impl Line {
    fn terminal() -> Line {
        Line {
            moves: Vec::new(),
            terminal: true,
        }
    }

    fn prepend(m: Move, rest: Line) -> Line {
        let mut moves = Vec::with_capacity(rest.moves.len() + 1);
        moves.push(m);
        moves.extend(rest.moves);
        Line {
            moves,
            terminal: rest.terminal,
        }
    }
}

/// One scored root move.
#[derive(Clone, Debug)]
pub struct Candidate {
    pub mv: Move,
    /// The move in UCI notation.
    pub uci: String,
    /// Root score $Q_L(m)$, pawn units, mover's perspective.
    pub q: f32,
    /// Policy probability $\pi_\tau(m)$.
    pub prob: f64,
    /// Principal variation starting with `mv`.
    pub pv: Vec<Move>,
    /// Per-term explanation (03 §6); `None` when the line ends in a terminal
    /// state, whose value is a boundary condition rather than an energy.
    pub explain: Option<Terms>,
}

/// The result of one decision.
#[derive(Clone, Debug)]
pub struct Decision {
    pub best: Option<Move>,
    /// Candidates sorted by score (descending), ties by UCI string.
    pub candidates: Vec<Candidate>,
    /// Positions visited below the root, each counted once.
    pub nodes: u64,
    /// Static evaluations performed.
    pub evaluations: u64,
    /// Deepest ply reached.
    pub seldepth: u32,
    /// Policy entropy in nats.
    pub entropy: f64,
    /// Whether the node budget ran out, so some root moves kept Level 0 scores.
    pub budget_exhausted: bool,
}

struct Searcher<'a> {
    p: &'a Params,
    eval: EvalConfig,
    contempt: f32,
    engine: Color,
    path: Vec<u64>,
    nodes: u64,
    evaluations: u64,
    seldepth: u32,
    node_limit: Option<u64>,
    aborted: bool,
}

impl Searcher<'_> {
    /// Count a visited position and check the node budget.
    fn enter(&mut self, ply: u32) {
        self.nodes += 1;
        self.seldepth = self.seldepth.max(ply);
        if self.node_limit.is_some_and(|limit| self.nodes > limit) {
            self.aborted = true;
        }
    }

    /// Side-to-move value $e(S)$ (03 Eq. (1)).
    fn static_value(&mut self, pos: &Chess) -> f32 {
        self.evaluations += 1;
        sign(pos.turn()) * evaluate(pos, self.p, &self.eval).total()
    }

    /// Draw value $d(S)$ with contempt; the engine is the side to move at the
    /// root (03 §3).
    fn draw_value(&self, pos: &Chess) -> f32 {
        if pos.turn() == self.engine {
            -self.contempt
        } else {
            self.contempt
        }
    }

    /// Boundary conditions of 03 §3, checked before evaluation. Checkmate
    /// takes precedence over the fifty-move rule.
    fn terminal(&self, pos: &Chess, moves: &MoveList, hash: u64, ply: u32) -> Option<f32> {
        if moves.is_empty() {
            return Some(if pos.is_check() {
                -(M_MATE - ply as f32)
            } else {
                self.draw_value(pos)
            });
        }
        let drawn =
            pos.halfmoves() >= 100 || pos.is_insufficient_material() || self.path.contains(&hash);
        drawn.then(|| self.draw_value(pos))
    }

    /// Children of `pos` in MVV-LVA order (stable, so ties keep generation order).
    fn ordered(moves: &MoveList, keep: impl Fn(Move) -> bool) -> Vec<Move> {
        let mut v: Vec<(i32, Move)> = moves
            .iter()
            .filter(|&&m| keep(m))
            .map(|&m| (order_key(m), m))
            .collect();
        v.sort_by_key(|entry| std::cmp::Reverse(entry.0));
        v.into_iter().map(|(_, m)| m).collect()
    }

    /// Level 0 leaf (03 §4.1). A position in check is replaced by the best of
    /// its forced evasions (check extension); other positions are evaluated.
    fn field_leaf(&mut self, pos: &Chess, ply: u32, extend_checks: bool) -> (f32, Line) {
        self.enter(ply);
        let hash = board::hash(pos);
        let moves = pos.legal_moves();
        if let Some(t) = self.terminal(pos, &moves, hash, ply) {
            return (t, Line::terminal());
        }
        if !(extend_checks && pos.is_check()) {
            return (self.static_value(pos), Line::default());
        }
        let mut best = -INF;
        let mut best_line = Line::default();
        self.path.push(hash);
        for m in Self::ordered(&moves, |_| true) {
            let mut child = pos.clone();
            child.play_unchecked(m);
            let (v, line) = self.field_leaf(&child, ply + 1, false);
            if -v > best {
                best = -v;
                best_line = Line::prepend(m, line);
            }
        }
        self.path.pop();
        (best, best_line)
    }

    /// Capture-only quiescence search, fail-soft (03 §4.2).
    fn qsearch(&mut self, pos: &Chess, ply: u32, mut alpha: f32, beta: f32) -> (f32, Line) {
        self.enter(ply);
        let hash = board::hash(pos);
        let moves = pos.legal_moves();
        if let Some(t) = self.terminal(pos, &moves, hash, ply) {
            return (t, Line::terminal());
        }
        let in_check = pos.is_check();
        if self.aborted || ply >= Q_HARD_PLY || (ply >= Q_MAX_PLY && !in_check) {
            return (self.static_value(pos), Line::default());
        }
        let mut best = -INF;
        let mut stand = -INF;
        if !in_check {
            stand = self.static_value(pos);
            if stand >= beta {
                return (stand, Line::default());
            }
            best = stand;
            alpha = alpha.max(stand);
        }

        let mut best_line = Line::default();
        self.path.push(hash);
        for m in Self::ordered(&moves, |m| in_check || is_quiescent_candidate(pos, m)) {
            if !in_check && prunable(pos, m) && stand + gain(m) as f32 + DELTA_MARGIN < alpha {
                continue;
            }
            let mut child = pos.clone();
            child.play_unchecked(m);
            let (v, line) = self.qsearch(&child, ply + 1, -beta, -alpha);
            let v = -v;
            if v > best {
                best = v;
                best_line = Line::prepend(m, line);
                if v >= beta {
                    break;
                }
                alpha = alpha.max(v);
            }
        }
        self.path.pop();
        (best, best_line)
    }

    /// Level 2 node: exact maximum over all replies, each relaxed by
    /// quiescence (03 §4.3).
    fn reply_node(&mut self, pos: &Chess, ply: u32) -> (f32, Line) {
        self.enter(ply);
        let hash = board::hash(pos);
        let moves = pos.legal_moves();
        if let Some(t) = self.terminal(pos, &moves, hash, ply) {
            return (t, Line::terminal());
        }
        let mut best = -INF;
        let mut best_line = Line::default();
        self.path.push(hash);
        for m in Self::ordered(&moves, |_| true) {
            if self.aborted {
                break;
            }
            let mut child = pos.clone();
            child.play_unchecked(m);
            let (v, line) = self.qsearch(&child, ply + 1, -INF, -best);
            if -v > best {
                best = -v;
                best_line = Line::prepend(m, line);
            }
        }
        self.path.pop();
        (best, best_line)
    }
}

/// Captures with SEE ≥ 0 and queen promotions; underpromotions are excluded
/// (03 §4.2).
fn is_quiescent_candidate(pos: &Chess, m: Move) -> bool {
    match m.promotion() {
        Some(Role::Queen) => !m.is_capture() || see::see_move(pos.board(), m) >= 0,
        Some(_) => false,
        None => m.is_capture() && see::see_move(pos.board(), m) >= 0,
    }
}

/// Delta pruning may skip a capture unless it promotes or removes the
/// opponent's last non-pawn piece, which switches on large endgame terms.
fn prunable(pos: &Chess, m: Move) -> bool {
    if m.is_promotion() {
        return false;
    }
    let victim_is_piece = matches!(
        m.capture(),
        Some(Role::Knight | Role::Bishop | Role::Rook | Role::Queen)
    );
    let their_pieces = pos.them() & !pos.board().pawns() & !pos.board().kings();
    !(victim_is_piece && their_pieces.count() == 1)
}

/// Material gained by a tactical move, for delta pruning.
fn gain(m: Move) -> i32 {
    let promotion = if m.promotion() == Some(Role::Queen) {
        8
    } else {
        0
    };
    m.capture().map_or(0, see::value) + promotion
}

/// MVV-LVA ordering key; quiet moves score 0 and every capture scores > 0.
fn order_key(m: Move) -> i32 {
    let promotion = if m.promotion() == Some(Role::Queen) {
        8 * 16
    } else {
        0
    };
    let attacker = see::value(m.role()).min(10);
    let capture = m
        .capture()
        .map_or(0, |victim| 16 * see::value(victim) - attacker);
    promotion + capture
}

/// Choose a move for `root` (03, 04).
///
/// `history` holds the Zobrist keys of every position of the game so far,
/// including `root`; it drives repetition detection (03 §3). Every root move
/// is searched with a full window, so all root scores are exact.
pub fn decide(root: &Chess, history: &[u64], p: &Params, cfg: &SearchConfig) -> Decision {
    let mut eval = cfg.eval;
    eval.realisable_capture = cfg.level == Level::Field;
    let root_hash = board::hash(root);
    let mut path = history.to_vec();
    if path.last() != Some(&root_hash) {
        path.push(root_hash);
    }
    let mut s = Searcher {
        p,
        eval,
        contempt: cfg.contempt,
        engine: root.turn(),
        path,
        nodes: 0,
        evaluations: 0,
        seldepth: 0,
        node_limit: cfg.node_limit,
        aborted: false,
    };

    let root_terms = evaluate(root, p, &eval);
    let mover = sign(root.turn());
    let mut root_moves: Vec<Move> = root.legal_moves().into_iter().collect();
    if cfg.node_limit.is_some() && cfg.level != Level::Field {
        // Under a budget, search the most promising moves first (Level 0 order),
        // so an exhausted budget leaves only weak moves at their Level 0 score.
        let mut keyed: Vec<(f32, Move)> = root_moves
            .iter()
            .map(|&m| {
                let mut child = root.clone();
                child.play_unchecked(m);
                (-s.field_leaf(&child, 1, true).0, m)
            })
            .collect();
        keyed.sort_by(|a, b| b.0.total_cmp(&a.0));
        root_moves = keyed.into_iter().map(|(_, m)| m).collect();
    }
    let mut budget_exhausted = false;
    let mut candidates: Vec<Candidate> = root_moves
        .into_iter()
        .map(|m| {
            let mut child = root.clone();
            child.play_unchecked(m);
            let searched = if s.aborted {
                None
            } else {
                let result = match cfg.level {
                    Level::Field => s.field_leaf(&child, 1, true),
                    Level::Quiescent => s.qsearch(&child, 1, -INF, INF),
                    Level::Reply => s.reply_node(&child, 1),
                };
                (!s.aborted).then_some(result)
            };
            let (v, line) = searched.unwrap_or_else(|| {
                budget_exhausted = true;
                s.field_leaf(&child, 1, true)
            });
            let line = Line::prepend(m, line);
            let explain = (!line.terminal).then(|| {
                let mut leaf = root.clone();
                for &step in &line.moves {
                    leaf.play_unchecked(step);
                }
                evaluate(&leaf, p, &eval).diff_scaled(&root_terms, mover)
            });
            Candidate {
                mv: m,
                uci: m.to_uci(CastlingMode::Standard).to_string(),
                q: -v,
                prob: 0.0,
                pv: line.moves,
                explain,
            }
        })
        .collect();

    candidates.sort_by(|a, b| b.q.total_cmp(&a.q).then_with(|| a.uci.cmp(&b.uci)));
    let qs: Vec<f32> = candidates.iter().map(|c| c.q).collect();
    let probs = policy::probabilities(&qs, cfg.temperature);
    for (c, &pr) in candidates.iter_mut().zip(&probs) {
        c.prob = pr;
    }
    let best = if candidates.is_empty() {
        None
    } else if cfg.temperature <= 0.0 {
        Some(candidates[0].mv)
    } else {
        let u = policy::uniform(cfg.seed, cfg.game, root_hash, board::game_ply(root));
        Some(candidates[policy::sample(&probs, u)].mv)
    };
    Decision {
        best,
        entropy: policy::entropy(&probs),
        candidates,
        nodes: s.nodes,
        evaluations: s.evaluations,
        seldepth: s.seldepth,
        budget_exhausted,
    }
}

/// Root value $e(S)$ of a position, for analysis output.
pub fn static_eval(pos: &Chess, p: &Params, cfg: &EvalConfig) -> (Terms, f32) {
    let terms = evaluate(pos, p, cfg);
    let e = sign(pos.turn()) * terms.total();
    (terms, e)
}

/// Mate distance in moves for a mate score (positive: the mover mates).
pub fn mate_in(q: f32) -> Option<i32> {
    if q.abs() < M_MATE - MATE_BAND {
        return None;
    }
    let plies = (M_MATE - q.abs()).round() as i32;
    let moves = (plies + 1) / 2;
    Some(if q > 0.0 { moves } else { -moves })
}
