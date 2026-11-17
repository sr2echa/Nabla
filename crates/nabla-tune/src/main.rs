//! Fit a few energy coefficients to the results of Nabla's own games.
//!
//! The positions are dealt at random, then both sides play at Level 0. Each
//! quiet position keeps the result of that game. Coordinate descent then moves
//! one coefficient at a time to reduce the logistic loss. The fitted values are
//! printed. They are not written into the engine: a self-play label is not an
//! anchored rating, so the hand-set defaults stay in charge until a gauntlet
//! says otherwise.

use nabla_core::board::hash;
use nabla_core::{Level, Params, SearchConfig, decide, is_quiet, white_energy};
use shakmaty::fen::Fen;
use shakmaty::{CastlingMode, Chess, EnPassantMode, Position};

const GAMES: u64 = 40;
const MAX_PLIES: usize = 80;
const PASSES: usize = 2;

/// Coefficients touched by this run, with the step size.
const KNOBS: &[(&str, f32)] = &[
    ("w_c", 0.01),
    ("mu_n", 0.005),
    ("g_0", 0.1),
    ("beta_2", 0.1),
    ("psi_i", 0.03),
    ("h_max_eg", 0.2),
];

struct Sample {
    fen: String,
    result: f32,
}

fn main() {
    let mut params = Params::default();
    println!("playing {GAMES} games at level 0 to label quiet positions");
    let samples = collect(&params);
    println!("quiet positions: {}", samples.len());
    let before = loss(&samples, &params);
    println!("loss before: {before:.6}");
    for _ in 0..PASSES {
        for &(name, step) in KNOBS {
            let current = params.get(name).unwrap_or(0.0);
            let mut best = current;
            let mut best_loss = loss(&samples, &params);
            for candidate in [current - step, current + step] {
                if !(0.0..=4.0).contains(&candidate) {
                    continue;
                }
                let mut trial = params.clone();
                trial.set(name, candidate);
                let value = loss(&samples, &trial);
                if value < best_loss {
                    best = candidate;
                    best_loss = value;
                }
            }
            params.set(name, best);
        }
    }
    let after = loss(&samples, &params);
    println!("loss after:  {after:.6}");
    println!("coefficient changes (not installed):");
    let defaults = Params::default();
    for &(name, _) in KNOBS {
        println!(
            "  {name:<10} {:+.3} -> {:+.3}",
            defaults.get(name).unwrap_or(0.0),
            params.get(name).unwrap_or(0.0)
        );
    }
    if after < before {
        println!("the sample loss fell. Defaults are unchanged until a gauntlet confirms it.");
    } else {
        println!("the sample loss did not fall. Defaults are unchanged.");
    }
}

fn collect(params: &Params) -> Vec<Sample> {
    let mut out = Vec::new();
    for game in 0..GAMES {
        let mut pos = Chess::default();
        let mut history = vec![hash(&pos)];
        let mut quiet = Vec::new();
        for _ply in 0..MAX_PLIES {
            if pos.is_game_over() {
                break;
            }
            if is_quiet(&pos) {
                quiet.push(Fen::from_position(&pos, EnPassantMode::Legal).to_string());
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
        let result = game_result(&pos);
        for fen in quiet {
            out.push(Sample { fen, result });
        }
    }
    out
}

fn game_result(pos: &Chess) -> f32 {
    if pos.is_checkmate() {
        // The side to move is mated, so the other side won.
        if pos.turn().is_white() { 0.0 } else { 1.0 }
    } else {
        0.5
    }
}

fn loss(samples: &[Sample], params: &Params) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let mut total = 0.0;
    for sample in samples {
        let pos = Fen::from_ascii(sample.fen.as_bytes())
            .unwrap()
            .into_position::<Chess>(CastlingMode::Standard)
            .unwrap();
        let prediction = 1.0 / (1.0 + (-0.4 * white_energy(&pos, params)).exp());
        let err = sample.result - prediction;
        total += err * err;
    }
    total / samples.len() as f32
}
