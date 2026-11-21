//! Classical UCI baseline engines for Nabla's anchored benchmark pool:
//!   --mode random
//!   --mode material
//!   --mode pesto --depth <0|1|2|...>
//!
//! `depth 0` = 1-ply leaf evaluation (matched to Nabla Level 0)
//! `depth 1` = 1-ply + capture quiescence (matched to Nabla Level 1)
//! `depth 2` = 2-ply alpha-beta + capture quiescence (matched to Nabla Level 2)

use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::process;

use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::zobrist::Zobrist64;
use shakmaty::{
    CastlingMode, Chess, Color, EnPassantMode, Move, Piece, Position, Role, Setup, Square,
};

const MATE: i32 = 30_000;
const INF: i32 = 100_000;
const Q_MAX_PLY: i32 = 12;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Random,
    Material,
    Pesto,
}

#[derive(Clone, Copy)]
struct Config {
    mode: Mode,
    depth: u32,
    seed: u64,
}

fn main() {
    let mut cfg = Config {
        mode: Mode::Pesto,
        depth: 2,
        seed: 1,
    };

    let mut tool: Option<String> = None;
    let mut pgn_path: Option<String> = None;
    let mut min_ply: usize = 12;
    let mut max_per_game: usize = 0;
    let mut kind: String = "kqk".to_string();
    let mut count: usize = 200;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--tool" => {
                tool = Some(args.next().expect("--tool requires a name"));
            }
            "--pgn" => {
                pgn_path = Some(args.next().expect("--pgn requires a path"));
            }
            "--min-ply" => {
                min_ply = args
                    .next()
                    .and_then(|s| s.parse().ok())
                    .expect("--min-ply requires an integer");
            }
            "--max-per-game" => {
                max_per_game = args
                    .next()
                    .and_then(|s| s.parse().ok())
                    .expect("--max-per-game requires an integer");
            }
            "--kind" => {
                kind = args.next().expect("--kind requires kqk|krk|kpk");
            }
            "--count" => {
                count = args
                    .next()
                    .and_then(|s| s.parse().ok())
                    .expect("--count requires an integer");
            }
            "--mode" => match args.next().as_deref() {
                Some("random") => cfg.mode = Mode::Random,
                Some("material") => cfg.mode = Mode::Material,
                Some("pesto") => cfg.mode = Mode::Pesto,
                _ => {
                    eprintln!("--mode must be random, material, or pesto");
                    process::exit(2);
                }
            },
            "--depth" => {
                cfg.depth = args
                    .next()
                    .and_then(|s| s.parse().ok())
                    .expect("--depth requires an integer");
            }
            "--seed" => {
                cfg.seed = args
                    .next()
                    .and_then(|s| s.parse().ok())
                    .expect("--seed requires an integer");
            }
            other => {
                eprintln!("unknown argument: {other}");
                process::exit(2);
            }
        }
    }

    if let Some(t) = tool.as_deref() {
        match t {
            "san-to-uci" => tool_san_to_uci(),
            "pgn-extract" => {
                let path = pgn_path.expect("--pgn <path> required for pgn-extract");
                tool_pgn_extract(&path, min_ply, max_per_game);
            }
            "gen-endgames" => tool_gen_endgames(&kind, count, cfg.seed),
            "referee" => tool_referee(),
            other => {
                eprintln!("unknown --tool {other}");
                process::exit(2);
            }
        }
        return;
    }

    let mut pos = Chess::default();
    let mut history = vec![hash(&pos)];
    let mut rng_counter = 0u64;

    let stdin = io::stdin();
    let mut out = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let tokens: Vec<&str> = line.split_whitespace().collect();
        match tokens[0] {
            "uci" => {
                let name = match cfg.mode {
                    Mode::Random => "Baseline-Random".to_string(),
                    Mode::Material => "Baseline-Material-1ply".to_string(),
                    Mode::Pesto => format!("Baseline-PeSTO-d{}", cfg.depth),
                };
                let _ = writeln!(out, "id name {name}");
                let _ = writeln!(out, "id author Nabla Benchmarks");
                let _ = writeln!(
                    out,
                    "option name Seed type spin default 1 min 0 max 2147483647"
                );
                let _ = writeln!(out, "uciok");
                let _ = out.flush();
            }
            "isready" => {
                let _ = writeln!(out, "readyok");
                let _ = out.flush();
            }
            "ucinewgame" => {
                pos = Chess::default();
                history = vec![hash(&pos)];
            }
            "setoption" => {
                if let (Some(ni), Some(vi)) = (
                    tokens.iter().position(|&t| t == "name"),
                    tokens.iter().position(|&t| t == "value"),
                ) && tokens[ni + 1..vi].join(" ").eq_ignore_ascii_case("Seed")
                    && let Ok(v) = tokens[vi + 1].parse::<u64>()
                {
                    cfg.seed = v;
                }
            }
            "position" => {
                if let Some((next_pos, next_hist)) = parse_position(&tokens[1..]) {
                    pos = next_pos;
                    history = next_hist;
                }
            }
            "go" => {
                let mut moves: Vec<Move> = pos.legal_moves().into_iter().collect();
                moves.sort_by_key(|m| m.to_uci(CastlingMode::Standard).to_string());
                if moves.is_empty() {
                    let _ = writeln!(out, "bestmove 0000");
                    let _ = out.flush();
                    continue;
                }
                let (best, score_cp, nodes) = match cfg.mode {
                    Mode::Random => {
                        rng_counter = rng_counter.wrapping_add(1);
                        let h = splitmix64(cfg.seed ^ hash(&pos) ^ rng_counter);
                        let chosen = moves[(h as usize) % moves.len()];
                        (chosen, 0, 1)
                    }
                    Mode::Material => search_root(&pos, &history, &moves, 0, true),
                    Mode::Pesto => search_root(&pos, &history, &moves, cfg.depth, false),
                };
                let depth_reported = match cfg.mode {
                    Mode::Random => 0,
                    Mode::Material => 1,
                    Mode::Pesto => cfg.depth.max(1),
                };
                let _ = writeln!(
                    out,
                    "info depth {depth_reported} nodes {nodes} score cp {score_cp}"
                );
                let _ = writeln!(out, "bestmove {}", best.to_uci(CastlingMode::Standard));
                let _ = out.flush();
            }
            "quit" => break,
            _ => {}
        }
    }
}

fn hash(pos: &Chess) -> u64 {
    pos.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0
}

fn splitmix64(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9e37_79b9_7f4a_7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

fn parse_position(tokens: &[&str]) -> Option<(Chess, Vec<u64>)> {
    if tokens.is_empty() {
        return None;
    }
    let moves_idx = tokens.iter().position(|&t| t == "moves");
    let head = moves_idx.map_or(tokens, |i| &tokens[..i]);
    let mut pos = if head[0] == "startpos" {
        Chess::default()
    } else if head[0] == "fen" && head.len() >= 2 {
        let fen_str = head[1..].join(" ");
        fen_str
            .parse::<shakmaty::fen::Fen>()
            .ok()?
            .into_position::<Chess>(CastlingMode::Standard)
            .ok()?
    } else {
        return None;
    };
    let mut hist = vec![hash(&pos)];
    if let Some(i) = moves_idx {
        for &uci in &tokens[i + 1..] {
            let m = uci
                .parse::<shakmaty::uci::UciMove>()
                .ok()?
                .to_move(&pos)
                .ok()?;
            pos.play_unchecked(m);
            hist.push(hash(&pos));
        }
    }
    Some((pos, hist))
}

fn search_root(
    pos: &Chess,
    history: &[u64],
    moves: &[Move],
    depth: u32,
    material_only: bool,
) -> (Move, i32, u64) {
    let mut nodes = 0u64;
    let mut path = history.to_vec();
    let mut best_mv = moves[0];
    let mut best_score = -INF;
    let mut alpha = -INF;

    // Order captures first for alpha-beta efficiency.
    let mut ordered = moves.to_vec();
    ordered.sort_by(|a, b| {
        order_key(*b).cmp(&order_key(*a)).then_with(|| {
            a.to_uci(CastlingMode::Standard)
                .to_string()
                .cmp(&b.to_uci(CastlingMode::Standard).to_string())
        })
    });

    for m in ordered {
        let mut child = pos.clone();
        child.play_unchecked(m);
        let score = if depth == 0 {
            nodes += 1;
            -leaf_no_q(&child, &path, 1, material_only)
        } else {
            -negamax(&child, &mut path, depth - 1, 1, -INF, -alpha, &mut nodes)
        };
        if score > best_score {
            best_score = score;
            best_mv = m;
        }
        alpha = alpha.max(best_score);
    }
    (best_mv, best_score, nodes)
}

fn leaf_no_q(pos: &Chess, path: &[u64], ply: i32, material_only: bool) -> i32 {
    let h = hash(pos);
    let moves = pos.legal_moves();
    if moves.is_empty() {
        return if pos.is_check() { -(MATE - ply) } else { 0 };
    }
    if pos.halfmoves() >= 100 || pos.is_insufficient_material() || path.contains(&h) {
        return 0;
    }
    if material_only {
        eval_material(pos)
    } else {
        eval_pesto(pos)
    }
}

fn negamax(
    pos: &Chess,
    path: &mut Vec<u64>,
    depth: u32,
    ply: i32,
    mut alpha: i32,
    beta: i32,
    nodes: &mut u64,
) -> i32 {
    *nodes += 1;
    let h = hash(pos);
    let moves = pos.legal_moves();
    if moves.is_empty() {
        return if pos.is_check() { -(MATE - ply) } else { 0 };
    }
    if pos.halfmoves() >= 100 || pos.is_insufficient_material() || path.contains(&h) {
        return 0;
    }
    if depth == 0 {
        return qsearch(pos, ply, alpha, beta, nodes);
    }

    let mut ordered: Vec<Move> = moves.into_iter().collect();
    ordered.sort_by_key(|m| std::cmp::Reverse(order_key(*m)));

    path.push(h);
    let mut best = -INF;
    for m in ordered {
        let mut child = pos.clone();
        child.play_unchecked(m);
        let score = -negamax(&child, path, depth - 1, ply + 1, -beta, -alpha, nodes);
        if score > best {
            best = score;
            alpha = alpha.max(best);
            if alpha >= beta {
                break;
            }
        }
    }
    path.pop();
    best
}

fn qsearch(pos: &Chess, ply: i32, mut alpha: i32, beta: i32, nodes: &mut u64) -> i32 {
    *nodes += 1;
    let moves = pos.legal_moves();
    if moves.is_empty() {
        return if pos.is_check() { -(MATE - ply) } else { 0 };
    }
    if pos.halfmoves() >= 100 || pos.is_insufficient_material() {
        return 0;
    }
    let stand = eval_pesto(pos);
    if ply >= Q_MAX_PLY {
        return stand;
    }
    if !pos.is_check() {
        if stand >= beta {
            return stand;
        }
        alpha = alpha.max(stand);
    }

    let in_check = pos.is_check();
    let mut caps: Vec<Move> = moves
        .into_iter()
        .filter(|m| in_check || m.is_capture() || m.promotion() == Some(Role::Queen))
        .collect();
    caps.sort_by_key(|m| std::cmp::Reverse(order_key(*m)));

    let mut best = if in_check { -INF } else { stand };
    for m in caps {
        let mut child = pos.clone();
        child.play_unchecked(m);
        if !in_check
            && !child.is_check()
            && !m.is_promotion()
            && stand + m.capture().map_or(0, role_cp) + 200 < alpha
        {
            continue;
        }
        let score = -qsearch(&child, ply + 1, -beta, -alpha, nodes);
        if score > best {
            best = score;
            alpha = alpha.max(best);
            if alpha >= beta {
                break;
            }
        }
    }
    best
}

fn order_key(m: Move) -> i32 {
    let promo = m.promotion().map_or(0, |r| 10 * role_cp(r));
    let cap = m
        .capture()
        .map_or(0, |v| 16 * role_cp(v) - role_cp(m.role()));
    promo + cap
}

fn role_cp(r: Role) -> i32 {
    match r {
        Role::Pawn => 100,
        Role::Knight => 320,
        Role::Bishop => 330,
        Role::Rook => 500,
        Role::Queen => 900,
        Role::King => 0,
    }
}

fn eval_material(pos: &Chess) -> i32 {
    let b = pos.board();
    let mut mg_w = 0i32;
    let mut mg_b = 0i32;
    for r in [
        Role::Pawn,
        Role::Knight,
        Role::Bishop,
        Role::Rook,
        Role::Queen,
    ] {
        mg_w += b
            .by_piece(Piece {
                color: Color::White,
                role: r,
            })
            .count() as i32
            * role_cp(r);
        mg_b += b
            .by_piece(Piece {
                color: Color::Black,
                role: r,
            })
            .count() as i32
            * role_cp(r);
    }
    let white = mg_w - mg_b;
    if pos.turn() == Color::White {
        white
    } else {
        -white
    }
}

// PeSTO (Ronald Friederich / Chess Programming Wiki) tapered piece-square tables.
const MG_VALUE: [i32; 6] = [82, 337, 365, 477, 1025, 0];
const EG_VALUE: [i32; 6] = [94, 281, 297, 512, 936, 0];
const PHASE_INC: [i32; 6] = [0, 1, 1, 2, 4, 0];

#[rustfmt::skip]
const MG_PST: [[i32; 64]; 6] = [
    // Pawn
    [
          0,   0,   0,   0,   0,   0,  0,   0,
         98, 134,  61,  95,  68, 126, 34, -11,
         -6,   7,  26,  31,  65,  56, 25, -20,
        -14,  13,   6,  21,  23,  12, 17, -23,
        -27,  -2,  -5,  12,  17,   6, 10, -25,
        -26,  -4,  -4, -10,   3,   3, 33, -12,
        -35,  -1, -20, -23, -15,  24, 38, -22,
          0,   0,   0,   0,   0,   0,  0,   0,
    ],
    // Knight
    [
        -167, -89, -34, -49,  61, -97, -15, -107,
         -73, -41,  72,  36,  23,  62,   7,  -17,
         -47,  60,  37,  65,  84, 129,  73,   44,
          -9,  17,  19,  53,  37,  69,  18,   22,
         -13,   4,  16,  13,  28,  19,  21,   -8,
         -23,  -9,  12,  10,  19,  17,  25,  -16,
         -29, -53, -12,  -3,  -1,  18, -14,  -19,
        -105, -21, -58, -33, -17, -28, -19,  -23,
    ],
    // Bishop
    [
        -29,   4, -82, -37, -25, -42,   7,  -8,
        -26,  16, -18, -13,  30,  59,  18, -47,
        -16,  37,  43,  40,  35,  50,  37,  -2,
         -4,   5,  19,  50,  37,  37,   7,  -2,
         -6,  13,  13,  26,  34,  12,  10,   4,
          0,  15,  15,  15,  14,  27,  18,  10,
          4,  15,  16,   0,   7,  21,  33,   1,
        -33,  -3, -14, -21, -13, -12, -39, -21,
    ],
    // Rook
    [
         32,  42,  32,  51, 63,  9,  31,  43,
         27,  32,  58,  62, 80, 67,  26,  44,
         -5,  19,  26,  36, 17, 45,  61,  16,
        -24, -11,   7,  26, 24, 35,  -8, -20,
        -36, -26, -12,  -1,  9, -7,   6, -23,
        -45, -25, -16, -17,  3,  0,  -5, -33,
        -44, -16, -20,  -9, -1, 11,  -6, -71,
        -19, -13,   1,  17, 16,  7, -37, -26,
    ],
    // Queen
    [
        -28,   0,  29,  12,  59,  44,  43,  45,
        -24, -39,  -5,   1, -16,  57,  28,  54,
        -13, -17,   7,   8,  29,  56,  47,  57,
        -27, -27, -16, -16,  -1,  17,  -2,   1,
         -9, -26,  -9, -10,  -2,  -4,   3,  -3,
        -14,   2, -11,  -2,  -5,   2,  14,   5,
        -35,  -8,  11,   2,   8,  15,  -3,   1,
         -1, -18,  -9,  10, -15, -25, -31, -50,
    ],
    // King
    [
        -65,  23,  16, -15, -56, -34,   2,  13,
         29,  -1, -20,  -7,  -8,  -4, -38, -29,
         -9,  24,   2, -16, -20,   6,  22, -22,
        -17, -20, -12, -27, -30, -25, -14, -36,
        -49,  -1, -27, -39, -46, -44, -33, -51,
        -14, -14, -22, -46, -44, -30, -15, -27,
          1,   7,  -8, -64, -43, -16,   9,   8,
        -15,  36,  12, -54,   8, -28,  24,  14,
    ],
];

#[rustfmt::skip]
const EG_PST: [[i32; 64]; 6] = [
    // Pawn
    [
          0,   0,   0,   0,   0,   0,   0,   0,
        178, 173, 158, 134, 147, 132, 165, 187,
         94, 100,  85,  67,  56,  53,  82,  84,
         32,  24,  13,   5,  -2,   4,  17,  17,
         13,   9,  -3,  -7,  -7,  -8,   3,  -1,
          4,   7,  -6,   1,   0,  -5,  -1,  -8,
         13,   8,   8,  10,  13,   0,   2,  -7,
          0,   0,   0,   0,   0,   0,   0,   0,
    ],
    // Knight
    [
        -58, -38, -13, -28, -31, -27, -63, -99,
        -25,  -8, -25,  -2,  -9, -25, -24, -52,
        -24, -20,  10,   9,  -1,  -9, -19, -41,
        -17,   3,  22,  22,  22,  11,   8, -18,
        -18,  -6,  16,  25,  16,  17,   4, -18,
        -23,  -3,  -1,  15,  10,  -3, -20, -22,
        -42, -20, -10,  -5,  -2, -20, -23, -44,
        -29, -51, -23, -15, -22, -18, -50, -64,
    ],
    // Bishop
    [
        -14, -21, -11,  -8, -7,  -9, -17, -24,
         -8,  -4,   7, -12, -3, -13,  -4, -14,
          2,  -8,   0,  -1, -2,   6,   0,   4,
         -3,   9,  12,   9, 14,  10,   3,   2,
         -6,   3,  13,  19,  7,  10,  -3,  -9,
        -12,  -3,   8,  10, 13,   3,  -7, -15,
        -14, -18,  -7,  -1,  4,  -9, -15, -27,
        -23,  -9, -23,  -5, -9, -16,  -5, -17,
    ],
    // Rook
    [
         13, 10, 18, 15, 12,  12,   8,   5,
         11, 13, 13, 11, -3,   3,   8,   3,
          7,  7,  7,  5,  4,  -3,  -5,  -3,
          4,  3, 13,  1,  2,   1,  -1,   2,
          3,  5,  8,  4, -5,  -6,  -8, -11,
         -4,  0, -5, -1, -7, -12,  -8, -16,
         -6, -6,  0,  2, -9,  -9, -11,  -3,
         -9,  2,  3, -1, -5, -13,   4, -20,
    ],
    // Queen
    [
         -9,  22,  22,  27,  27,  19,  10,  20,
        -17,  20,  32,  41,  58,  25,  30,   0,
        -20,   6,   9,  49,  47,  35,  19,   9,
          3,  22,  24,  45,  57,  40,  57,  36,
        -18,  28,  19,  47,  31,  34,  39,  23,
        -16, -27,  15,   6,   9,  17,  10,   5,
        -22, -23, -30, -16, -16, -23, -36, -32,
        -33, -28, -22, -43,  -5, -32, -20, -41,
    ],
    // King
    [
        -74, -35, -18, -18, -11,  15,   4, -17,
        -12,  17,  14,  17,  17,  38,  23,  11,
         10,  17,  23,  15,  20,  45,  44,  13,
         -8,  22,  24,  27,  26,  33,  26,   3,
        -18,  -4,  21,  24,  27,  23,   9, -11,
        -19,  -3,  11,  21,  23,  16,   7,  -9,
        -27, -11,   4,  13,  14,   4,  -5, -17,
        -53, -34, -21, -11, -28, -14, -24, -43,
    ],
];

fn role_idx(role: Role) -> usize {
    match role {
        Role::Pawn => 0,
        Role::Knight => 1,
        Role::Bishop => 2,
        Role::Rook => 3,
        Role::Queen => 4,
        Role::King => 5,
    }
}

fn eval_pesto(pos: &Chess) -> i32 {
    let b = pos.board();
    let mut mg = [0i32; 2];
    let mut eg = [0i32; 2];
    let mut phase = 0i32;
    for (ci, color) in [Color::White, Color::Black].iter().enumerate() {
        for role in Role::ALL {
            let ri = role_idx(role);
            for sq in b.by_piece(Piece {
                color: *color,
                role,
            }) {
                let pst_idx = if *color == Color::White {
                    sq.to_usize() ^ 56
                } else {
                    sq.to_usize()
                };
                mg[ci] += MG_VALUE[ri] + MG_PST[ri][pst_idx];
                eg[ci] += EG_VALUE[ri] + EG_PST[ri][pst_idx];
                phase += PHASE_INC[ri];
            }
        }
    }
    let mg_phase = phase.min(24);
    let eg_phase = 24 - mg_phase;
    let mg_score = mg[0] - mg[1];
    let eg_score = eg[0] - eg[1];
    let white = (mg_score * mg_phase + eg_score * eg_phase) / 24;
    if pos.turn() == Color::White {
        white
    } else {
        -white
    }
}

fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn npm_and_phase(pos: &Chess) -> (u32, f32) {
    let b = pos.board();
    let npm: u32 = [
        (Role::Knight, 3),
        (Role::Bishop, 3),
        (Role::Rook, 5),
        (Role::Queen, 9),
    ]
    .iter()
    .map(|&(r, w)| (b.by_role(r).count() as u32) * w)
    .sum();
    let phase = (npm as f32 / 32.0).min(1.0);
    (npm, phase)
}

/// Convert `FEN\tSAN1 SAN2 ...` lines on stdin to space-separated UCI moves.
fn tool_san_to_uci() {
    let stdin = io::stdin();
    let mut out = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim_end_matches(&['\r', '\n', '\0'][..]);
        if line.is_empty() {
            let _ = writeln!(out);
            continue;
        }
        let Some((fen_s, sans_s)) = line.split_once('\t') else {
            let _ = writeln!(out, "ERR");
            continue;
        };
        let Ok(fen) = Fen::from_ascii(fen_s.trim().as_bytes()) else {
            let _ = writeln!(out, "ERR");
            continue;
        };
        let Ok(pos) = fen.into_position::<Chess>(CastlingMode::Standard) else {
            let _ = writeln!(out, "ERR");
            continue;
        };
        let mut ucis = Vec::new();
        for tok in sans_s.split_whitespace() {
            let clean = tok.trim_end_matches(&['+', '#', '!', '?'][..]);
            if let Ok(san) = San::from_ascii(clean.as_bytes())
                && let Ok(mv) = san.to_move(&pos)
            {
                ucis.push(mv.to_uci(CastlingMode::Standard).to_string());
            } else {
                ucis.push("ERR".to_string());
            }
        }
        let _ = writeln!(out, "{}", ucis.join(" "));
    }
    let _ = out.flush();
}

/// Parse a PGN file and emit sampled positions as JSONL.
fn tool_pgn_extract(path: &str, min_ply: usize, max_per_game: usize) {
    let raw = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let mut out = io::BufWriter::new(io::stdout());

    let mut white = String::new();
    let mut black = String::new();
    let mut result = String::from("*");
    let mut start_fen: Option<String> = None;
    let mut body = String::new();
    let mut in_body = false;

    let flush_game = |white: &str,
                      black: &str,
                      result: &str,
                      start_fen: &Option<String>,
                      body: &str,
                      out: &mut io::BufWriter<io::Stdout>| {
        if !matches!(result, "1-0" | "0-1" | "1/2-1/2") || body.trim().is_empty() {
            return;
        }
        let mut pos = match start_fen {
            Some(f) => match Fen::from_ascii(f.as_bytes())
                .ok()
                .and_then(|parsed| parsed.into_position::<Chess>(CastlingMode::Standard).ok())
            {
                Some(p) => p,
                None => return,
            },
            None => Chess::default(),
        };
        let tokens = strip_pgn_tokens(body);
        let mut collected = Vec::new();
        for (ply, tok) in tokens.iter().enumerate() {
            let clean = tok.trim_end_matches(&['!', '?'][..]);
            let Ok(san) = San::from_ascii(clean.as_bytes()) else {
                break;
            };
            let Ok(mv) = san.to_move(&pos) else {
                break;
            };
            if ply >= min_ply {
                let fen_s = Fen::from_position(&pos, EnPassantMode::Legal).to_string();
                let uci_s = mv.to_uci(CastlingMode::Standard).to_string();
                let is_cap = mv.is_capture();
                let is_chk = pos.is_check();
                let is_promo = mv.is_promotion();
                let (npm, phase) = npm_and_phase(&pos);
                let mut child = pos.clone();
                child.play_unchecked(mv);
                let gives_chk = child.is_check();
                let turn_s = if pos.turn() == Color::White {
                    "white"
                } else {
                    "black"
                };
                collected.push(format!(
                    "{{\"white\":\"{}\",\"black\":\"{}\",\"result\":\"{}\",\"ply\":{},\"turn\":\"{}\",\"fen\":\"{}\",\"move_uci\":\"{}\",\"is_capture\":{},\"is_check\":{},\"gives_check\":{},\"is_promotion\":{},\"npm\":{},\"phase\":{:.4}}}",
                    json_escape(white),
                    json_escape(black),
                    result,
                    ply,
                    turn_s,
                    json_escape(&fen_s),
                    uci_s,
                    is_cap,
                    is_chk,
                    gives_chk,
                    is_promo,
                    npm,
                    phase
                ));
                pos = child;
                continue;
            }
            pos.play_unchecked(mv);
        }
        if max_per_game == 0 || collected.len() <= max_per_game {
            for line in collected {
                let _ = writeln!(out, "{line}");
            }
        } else {
            let n = collected.len();
            for i in 0..max_per_game {
                let idx = (i * n) / max_per_game;
                let _ = writeln!(out, "{}", collected[idx]);
            }
        }
    };

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_body {
                flush_game(&white, &black, &result, &start_fen, &body, &mut out);
                white.clear();
                black.clear();
                result = String::from("*");
                start_fen = None;
                body.clear();
                in_body = false;
            }
            if let Some(inner) = trimmed.strip_prefix('[').and_then(|s| s.strip_suffix(']'))
                && let Some((tag, val)) = inner.split_once(' ')
            {
                let v = val.trim().trim_matches('"');
                match tag {
                    "White" => white = v.to_string(),
                    "Black" => black = v.to_string(),
                    "Result" => result = v.to_string(),
                    "FEN" => start_fen = Some(v.to_string()),
                    _ => {}
                }
            }
        } else if !trimmed.is_empty() {
            in_body = true;
            body.push_str(trimmed);
            body.push(' ');
        }
    }
    if in_body {
        flush_game(&white, &black, &result, &start_fen, &body, &mut out);
    }
    let _ = out.flush();
}

fn strip_pgn_tokens(body: &str) -> Vec<String> {
    let mut clean = String::with_capacity(body.len());
    let mut brace_depth = 0u32;
    let mut paren_depth = 0u32;
    for ch in body.chars() {
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '(' if brace_depth == 0 => paren_depth += 1,
            ')' if brace_depth == 0 => paren_depth = paren_depth.saturating_sub(1),
            _ if brace_depth == 0 && paren_depth == 0 => clean.push(ch),
            _ => {}
        }
    }
    let mut out = Vec::new();
    for raw in clean.split_whitespace() {
        if raw.starts_with('$') || matches!(raw, "1-0" | "0-1" | "1/2-1/2" | "*") {
            continue;
        }
        // Strip leading move numbers like "1.", "12...", "1.e4"
        let tok = if let Some(dot) = raw.rfind('.') {
            let prefix = &raw[..dot];
            if !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit() || c == '.') {
                &raw[dot + 1..]
            } else {
                raw
            }
        } else {
            raw
        };
        if !tok.is_empty() && !matches!(tok, "1-0" | "0-1" | "1/2-1/2" | "*") {
            out.push(tok.to_string());
        }
    }
    out
}

/// Generate candidate legal White-to-move endgame FENs (`kqk`, `krk`, `kpk`).
fn tool_gen_endgames(kind: &str, count: usize, seed: u64) {
    let mut rng = seed.max(1);
    let mut emitted = 0usize;
    let role = match kind {
        "kqk" => Role::Queen,
        "krk" => Role::Rook,
        "kpk" => Role::Pawn,
        other => panic!("unknown endgame kind: {other}"),
    };
    while emitted < count {
        rng = splitmix64(rng);
        let wk = Square::new((rng & 63) as u32);
        rng = splitmix64(rng);
        let bk = Square::new((rng & 63) as u32);
        rng = splitmix64(rng);
        let wp = if role == Role::Pawn {
            let f = (rng & 7) as u32;
            let r = 1 + ((rng >> 3) % 5) as u32; // rank 2..=6
            Square::new(r * 8 + f)
        } else {
            Square::new((rng & 63) as u32)
        };
        if wk == bk || wk == wp || bk == wp {
            continue;
        }
        let mut setup = Setup::empty();
        setup.board.set_piece_at(
            wk,
            Piece {
                color: Color::White,
                role: Role::King,
            },
        );
        setup.board.set_piece_at(
            bk,
            Piece {
                color: Color::Black,
                role: Role::King,
            },
        );
        setup.board.set_piece_at(
            wp,
            Piece {
                color: Color::White,
                role,
            },
        );
        setup.turn = Color::White;
        if let Ok(pos) = setup.position::<Chess>(CastlingMode::Standard)
            && !pos.legal_moves().is_empty()
        {
            println!("{}", Fen::from_position(&pos, EnPassantMode::Legal));
            emitted += 1;
        }
    }
}

/// Stateful game referee over stdin/stdout with exact FIDE rules & repetition tracking.
fn tool_referee() {
    let stdin = io::stdin();
    let mut out = io::BufWriter::new(io::stdout());
    let mut pos = Chess::default();
    let mut history = vec![hash(&pos)];
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(fen_s) = line.strip_prefix("init ") {
            let fen: Fen = fen_s.trim().parse().expect("valid FEN");
            pos = fen
                .into_position::<Chess>(CastlingMode::Standard)
                .expect("legal FEN");
            history = vec![hash(&pos)];
            let (st, det) = referee_status(&pos, &history);
            let _ = writeln!(out, "ok {st} {det}");
            let _ = out.flush();
        } else if let Some(uci_s) = line.strip_prefix("play ") {
            let mv = uci_s
                .trim()
                .parse::<UciMove>()
                .expect("valid uci")
                .to_move(&pos)
                .expect("legal move");
            pos.play_unchecked(mv);
            history.push(hash(&pos));
            let (st, det) = referee_status(&pos, &history);
            let fen_s = Fen::from_position(&pos, EnPassantMode::Legal);
            let _ = writeln!(out, "ok {st} {det} {fen_s}");
            let _ = out.flush();
        } else if line == "quit" {
            break;
        }
    }
}

fn referee_status(pos: &Chess, history: &[u64]) -> (&'static str, &'static str) {
    if pos.is_checkmate() {
        return ("checkmate", "checkmate");
    }
    if pos.is_stalemate() {
        return ("draw", "stalemate");
    }
    if pos.is_insufficient_material() {
        return ("draw", "material");
    }
    if pos.halfmoves() >= 100 {
        return ("draw", "fifty");
    }
    let h = hash(pos);
    if history.iter().filter(|&&k| k == h).count() >= 3 {
        return ("draw", "repetition");
    }
    ("play", "ongoing")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pesto_is_colour_antisymmetric_and_prefers_e4_over_a3() {
        let mut s = Chess::default();
        assert_eq!(eval_pesto(&s), 0);

        let e4 = "e2e4"
            .parse::<shakmaty::uci::UciMove>()
            .unwrap()
            .to_move(&s)
            .unwrap();
        let a3 = "a2a3"
            .parse::<shakmaty::uci::UciMove>()
            .unwrap()
            .to_move(&s)
            .unwrap();
        let mut s_e4 = s.clone();
        s_e4.play_unchecked(e4);
        let mut s_a3 = s.clone();
        s_a3.play_unchecked(a3);
        assert!(-eval_pesto(&s_e4) > -eval_pesto(&s_a3));

        // Flip any asymmetrical position vertically & swap colours -> opposite score.
        let fen: shakmaty::fen::Fen =
            "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 2 6"
                .parse()
                .unwrap();
        s = fen.into_position(CastlingMode::Standard).unwrap();
        let flipped: Chess = s
            .to_setup(EnPassantMode::Legal)
            .into_mirrored()
            .position(CastlingMode::Standard)
            .unwrap();
        assert_eq!(eval_pesto(&s), -eval_pesto(&flipped));
    }
}
