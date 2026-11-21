//! Fit energy coefficients by coordinate descent against Texel MSE (Brier score).
//!
//! Either loads labelled positions from `--epd <path>` (`<fen>; <result>`) or
//! plays Level 0 self-play games up to 300 plies (skipping unfinished games).
//! Quiet positions are filtered by matching Level 1 static evaluation to Level 1
//! quiescence (`|E_static - E_qsearch| < 1e-4` and not in check), split 90/10
//! into train/validation sets, scaled by a once-fitted logistic factor `k`, and
//! printed without altering engine defaults (protocol §6.1).

use std::env;
use std::fs;
use std::process;

use nabla_core::board::hash;
use nabla_core::select::qsearch_eval;
use nabla_core::{EvalConfig, Level, Params, SearchConfig, decide, evaluate, outcome};
use shakmaty::fen::Fen;
use shakmaty::{CastlingMode, Chess, Position};

const DEFAULT_GAMES: u64 = 60;
const MAX_PLIES: usize = 300;
const DEFAULT_PASSES: usize = 2;
const EVAL_L1: EvalConfig = EvalConfig {
    realisable_capture: false,
    disabled: 0,
};

/// Texel-tunable coefficients (marked T in 02 §9) touched by this run, with step size.
const KNOBS: &[(&str, f32)] = &[
    ("w_c", 0.01),
    ("mu_n", 0.005),
    ("g_0", 0.1),
    ("psi_i", 0.03),
    ("h_max_eg", 0.2),
];

struct Sample {
    pos: Chess,
    result: f32,
}

fn main() {
    let mut games = DEFAULT_GAMES;
    let mut passes = DEFAULT_PASSES;
    let mut epd_path: Option<String> = None;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--games" => {
                games = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| usage("--games requires a positive integer"));
            }
            "--passes" => {
                passes = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| usage("--passes requires a positive integer"));
            }
            "--epd" => {
                epd_path = Some(
                    args.next()
                        .unwrap_or_else(|| usage("--epd requires a file path")),
                );
            }
            "--help" | "-h" => {
                println!("Usage: nabla-tune [--epd <path>] [--games <N>] [--passes <N>]");
                return;
            }
            other => usage(&format!("unknown argument: {other}")),
        }
    }

    let mut params = Params::default();
    let samples = if let Some(path) = &epd_path {
        println!("loading quiet labelled positions from {path}");
        load_epd(path, &params)
    } else {
        println!(
            "playing up to {games} level-0 games (max {MAX_PLIES} plies) to label quiet positions"
        );
        collect(games, &params)
    };

    if samples.len() < 10 {
        eprintln!(
            "too few quiet labelled samples ({}) to split 90/10",
            samples.len()
        );
        process::exit(1);
    }

    let mut train = Vec::new();
    let mut val = Vec::new();
    for (i, sample) in samples.into_iter().enumerate() {
        if i % 10 == 9 {
            val.push(sample);
        } else {
            train.push(sample);
        }
    }
    println!(
        "quiet samples: {} train, {} validation",
        train.len(),
        val.len()
    );

    let k = fit_scale(&train, &params);
    println!("fitted logistic scale k = {k:.4} (frozen)");

    let train_before = mse(&train, &params, k);
    let val_before = mse(&val, &params, k);
    println!("MSE (Brier score) before: train {train_before:.6}, val {val_before:.6}");

    for _ in 0..passes {
        for &(name, step) in KNOBS {
            let Some((min, max)) = Params::range(name) else {
                continue;
            };
            let current = params.get(name).unwrap_or(0.0);
            let mut best = current;
            let mut best_mse = mse(&train, &params, k);
            for candidate in [current - step, current + step] {
                if !(min..=max).contains(&candidate) {
                    continue;
                }
                let mut trial = params.clone();
                trial.set(name, candidate);
                let value = mse(&train, &trial, k);
                if value < best_mse {
                    best = candidate;
                    best_mse = value;
                }
            }
            params.set(name, best);
        }
    }

    let train_after = mse(&train, &params, k);
    let val_after = mse(&val, &params, k);
    println!("MSE (Brier score) after:  train {train_after:.6}, val {val_after:.6}");
    println!("coefficient changes (not installed):");
    let defaults = Params::default();
    for &(name, _) in KNOBS {
        println!(
            "  {name:<10} {:+.3} -> {:+.3}",
            defaults.get(name).unwrap_or(0.0),
            params.get(name).unwrap_or(0.0)
        );
    }
    if val_after < val_before {
        println!(
            "validation MSE fell. Defaults remain unchanged until a gauntlet confirms Elo gain."
        );
    } else {
        println!("validation MSE did not fall. Defaults remain unchanged.");
    }
}

fn usage(msg: &str) -> ! {
    eprintln!("error: {msg}");
    process::exit(2);
}

fn is_truly_quiet(pos: &Chess, params: &Params) -> bool {
    if pos.is_check() {
        return false;
    }
    let static_w = evaluate(pos, params, &EVAL_L1).total();
    let q_w = qsearch_eval(pos, params);
    (static_w - q_w).abs() < 1e-4
}

fn load_epd(path: &str, params: &Params) -> Vec<Sample> {
    let text = fs::read_to_string(path).unwrap_or_else(|e| usage(&format!("read {path}: {e}")));
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((fen_part, res_part)) = trimmed.split_once(';') else {
            continue;
        };
        let Some(result) = parse_result(res_part) else {
            continue;
        };
        let Ok(fen) = Fen::from_ascii(fen_part.trim().as_bytes()) else {
            continue;
        };
        let Ok(pos) = fen.into_position::<Chess>(CastlingMode::Standard) else {
            continue;
        };
        if is_truly_quiet(&pos, params) {
            out.push(Sample { pos, result });
        }
    }
    out
}

fn parse_result(raw: &str) -> Option<f32> {
    let token = raw.trim().trim_matches('"');
    match token {
        "1.0" | "1" | "1-0" => Some(1.0),
        "0.5" | "1/2-1/2" => Some(0.5),
        "0.0" | "0" | "0-1" => Some(0.0),
        _ => token
            .parse::<f32>()
            .ok()
            .filter(|v| (0.0..=1.0).contains(v)),
    }
}

fn collect(games: u64, params: &Params) -> Vec<Sample> {
    let mut out = Vec::new();
    let mut skipped = 0u64;
    for game in 0..games {
        let mut pos = Chess::default();
        let mut history = vec![hash(&pos)];
        let mut quiet = Vec::new();
        let mut finished = None;

        for _ply in 0..MAX_PLIES {
            let status = outcome(&pos, &history);
            if status.state == "checkmate" {
                finished = Some(if pos.turn().is_white() { 0.0 } else { 1.0 });
                break;
            }
            if status.state == "draw" {
                finished = Some(0.5);
                break;
            }
            if is_truly_quiet(&pos, params) {
                quiet.push(pos.clone());
            }
            let cfg = SearchConfig {
                level: Level::Field,
                temperature: 0.4,
                seed: 7,
                game,
                ..SearchConfig::default()
            };
            let decision = decide(&pos, &history, params, &cfg);
            let Some(mv) = decision.best else { break };
            pos.play_unchecked(mv);
            history.push(hash(&pos));
        }

        let Some(result) = finished else {
            skipped += 1;
            continue;
        };
        if quiet.is_empty() {
            continue;
        }
        // Sample at most 2 quiet positions per game to limit autocorrelation.
        let i1 = quiet.len() / 3;
        out.push(Sample {
            pos: quiet[i1].clone(),
            result,
        });
        if quiet.len() >= 2 {
            let i2 = (2 * quiet.len()) / 3;
            if i2 != i1 {
                out.push(Sample {
                    pos: quiet[i2].clone(),
                    result,
                });
            }
        }
    }
    if skipped > 0 {
        println!("skipped {skipped} unfinished games exceeding {MAX_PLIES} plies");
    }
    out
}

/// Golden-section search on `k in [0.05, 2.0]` to minimise MSE on `samples`.
fn fit_scale(samples: &[Sample], params: &Params) -> f32 {
    let evals: Vec<(f32, f32)> = samples
        .iter()
        .map(|s| (evaluate(&s.pos, params, &EVAL_L1).total(), s.result))
        .collect();
    let score = |k: f32| -> f32 {
        let mut sum = 0.0;
        for &(e, r) in &evals {
            let pred = 1.0 / (1.0 + libm::expf(-k * e));
            let err = r - pred;
            sum += err * err;
        }
        sum / evals.len() as f32
    };

    let phi = 0.618_034_f32;
    let mut a = 0.05_f32;
    let mut b = 2.0_f32;
    let mut c = b - phi * (b - a);
    let mut d = a + phi * (b - a);
    let mut fc = score(c);
    let mut fd = score(d);
    for _ in 0..40 {
        if fc < fd {
            b = d;
            d = c;
            fd = fc;
            c = b - phi * (b - a);
            fc = score(c);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + phi * (b - a);
            fd = score(d);
        }
    }
    0.5 * (a + b)
}

fn mse(samples: &[Sample], params: &Params, k: f32) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let mut total = 0.0;
    for sample in samples {
        let e = evaluate(&sample.pos, params, &EVAL_L1).total();
        let prediction = 1.0 / (1.0 + libm::expf(-k * e));
        let err = sample.result - prediction;
        total += err * err;
    }
    total / samples.len() as f32
}
