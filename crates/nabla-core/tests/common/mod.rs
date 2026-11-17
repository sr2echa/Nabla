//! Shared test helpers: deterministic random positions.
#![allow(dead_code)]

use shakmaty::fen::Fen;
use shakmaty::{CastlingMode, Chess, Position};

pub const SEEDS: &[&str] = &[
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
];

/// SplitMix64, local to the tests so they do not depend on the policy module.
fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

pub fn parse(fen: &str) -> Chess {
    Fen::from_ascii(fen.as_bytes())
        .expect("valid FEN")
        .into_position(CastlingMode::Standard)
        .expect("legal position")
}

/// Every position along deterministic random playouts from the seed FENs.
pub fn random_positions(playouts: u64, max_plies: usize) -> Vec<Chess> {
    let mut out = Vec::new();
    for (s, fen) in SEEDS.iter().enumerate() {
        for game in 0..playouts {
            let mut rng = splitmix64((s as u64) << 32 | game);
            let mut pos = parse(fen);
            for _ in 0..max_plies {
                out.push(pos.clone());
                let moves = pos.legal_moves();
                if moves.is_empty() {
                    break;
                }
                rng = splitmix64(rng);
                let m = moves[(rng % moves.len() as u64) as usize];
                pos.play_unchecked(m);
            }
        }
    }
    out
}
