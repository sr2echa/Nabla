//! Classical limits of 02 §10: each term recovers a standard chess heuristic
//! in its stated limit.

mod common;

use nabla_core::board::{COLORS, PIECES, idx, rel_squares, sign};
use nabla_core::see::see_square;
use nabla_core::{EvalConfig, Params, evaluate, transport};
use shakmaty::{Color, Piece, Position, Role, Square, attacks};

#[test]
fn attack_field_limit_recovers_attack_counts() {
    // chi = 0, lambda = 0, alpha_t = 1 in a king+pawn ending (phase = 0 => alpha_K = 1).
    let p = Params {
        chi: 0.0,
        lambda: 0.0,
        alpha_p: 1.0,
        alpha_n: 1.0,
        alpha_b: 1.0,
        alpha_r: 1.0,
        alpha_q: 1.0,
        alpha_k: 1.0,
        ..Params::default()
    };
    let pos = common::parse("4k3/2p5/8/8/8/8/2P5/4K3 w - - 0 1");
    let board = pos.board();
    let f = transport::compute(board, &p);
    for c in COLORS {
        let occ = board.occupied() & !board.by_piece(Role::King.of(!c));
        for sq in Square::ALL {
            let mut count = 0u32;
            for from in board.by_color(c) {
                let piece = board.piece_at(from).expect("occupied");
                if attacks::attacks(from, piece, occ).contains(sq) {
                    count += 1;
                }
            }
            assert_eq!(f.influence(c, sq), count as f32);
        }
    }
}

#[test]
fn territory_limit_recovers_weighted_square_ownership() {
    // Scaling all alpha_t by a large factor K is equivalent to Phi_0 -> 0
    // while preserving the relative piece control weights.
    let def = Params::default();
    let scale = 10_000.0;
    let p = Params {
        alpha_p: scale * def.alpha_p,
        alpha_n: scale * def.alpha_n,
        alpha_b: scale * def.alpha_b,
        alpha_r: scale * def.alpha_r,
        alpha_q: scale * def.alpha_q,
        alpha_k: scale * def.alpha_k,
        ..def.clone()
    };
    let pos = common::parse("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
    let f_unit = transport::compute(pos.board(), &def);
    let actual = evaluate(&pos, &p, &EvalConfig::default()).terr;
    let mut expected = 0.0f32;
    for sq in Square::ALL {
        let diff = f_unit.influence(Color::White, sq) - f_unit.influence(Color::Black, sq);
        if diff.abs() > 1e-4 {
            let w = p.w_0 + p.w_c * (3 - nabla_core::board::centre_distance(sq)) as f32 / 3.0;
            expected += diff.signum() * w;
        }
    }
    assert!((actual - expected).abs() < 1e-3, "{actual} vs {expected}");
}

#[test]
fn exchange_limit_without_captures_recovers_fork_term() {
    let p = Params::default();
    let cfg = EvalConfig {
        realisable_capture: false,
        disabled: 0,
    };
    // White Nd6 forks Black Qb5 and Black Rf7 with Black to move.
    let fork = common::parse("7k/5r2/3N4/1q6/8/8/8/4K3 b - - 0 1");
    let ex = evaluate(&fork, &p, &cfg).ex;
    let g_b5 = see_square(fork.board(), Square::B5, Color::White);
    let g_f7 = see_square(fork.board(), Square::F7, Color::White);
    assert_eq!(g_b5, 9);
    assert_eq!(g_f7, 5);
    assert!((ex - p.beta_2 * 5.0).abs() < 1e-5, "{ex}");
}

#[test]
fn king_limits_recover_thresholded_relu_and_linear_pressure() {
    // Black has no pawn shelter and heavy pressure in its zone; White is safe.
    let pos = common::parse("7k/8/8/8/2B5/4QR2/PPP2PPP/6K1 w - - 0 1");
    let cfg = EvalConfig::default();

    // Limit 1: D_max -> inf, sigma_b -> 0, x_0 >= 0 => thresholded ReLU.
    let relu_above = Params {
        d_max: 1.0e5,
        sigma_b: 1.0e-3,
        x_0: 1.0,
        g_0: 1.0,
        gamma_q: 0.0,
        xi: 0.8,
        ..Params::default()
    };
    let e_relu = evaluate(&pos, &relu_above, &cfg).king;
    assert!(
        e_relu > 0.5,
        "expected positive king danger on Black: {e_relu}"
    );
    let relu_below = Params {
        x_0: 50.0,
        ..relu_above
    };
    assert!(evaluate(&pos, &relu_below, &cfg).king.abs() < 1e-4);

    // Limit 2: D_max -> inf, x_0 -> -inf => linear pressure (converges, no divergence).
    let lin_1 = Params {
        d_max: 1.0e5,
        sigma_b: 1.0,
        x_0: -50.0,
        g_0: 1.0,
        gamma_q: 0.5,
        ..Params::default()
    };
    let lin_2 = Params {
        x_0: -150.0,
        ..lin_1.clone()
    };
    let e_lin1 = evaluate(&pos, &lin_1, &cfg).king;
    let e_lin2 = evaluate(&pos, &lin_2, &cfg).king;
    assert!(
        (e_lin1 - e_lin2).abs() < 1e-3,
        "x_0 -> -inf must converge, not diverge: {e_lin1} vs {e_lin2}"
    );
}

#[test]
fn flux_and_tropism_match_closed_forms() {
    let pos = common::parse("r3k2r/pppq1ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 1");
    let p = Params::default();
    let cfg = EvalConfig::default();
    let board = pos.board();
    let f = transport::compute(board, &p);
    let e = evaluate(&pos, &p, &cfg);

    let mut flux_exp = 0.0f32;
    for c in COLORS {
        let unsafe_sq = board.by_color(c) | f.pawn_attacks[idx(!c)];
        let mut s = 0.0f32;
        for role in PIECES {
            let mu = match role {
                Role::Knight => p.mu_n,
                Role::Bishop => p.mu_b,
                Role::Rook => p.mu_r,
                _ => p.mu_q,
            };
            for sq in rel_squares(c, board.by_piece(Piece { color: c, role })) {
                let att = attacks::attacks(sq, Piece { color: c, role }, board.occupied());
                s += mu * (att & !unsafe_sq).count() as f32;
            }
        }
        flux_exp += sign(c) * s;
    }
    assert!((e.flux - flux_exp).abs() < 1e-4, "{} vs {flux_exp}", e.flux);
}

#[test]
fn confinement_mop_up_limit_and_rule_of_square_sharpness() {
    let p = Params {
        zeta_1: 0.0,
        zeta_2: 1.0,
        delta_0: 0.0,
        delta_s: 0.1,
        ..Params::default()
    };
    let closer = common::parse("7k/8/8/8/8/6K1/8/1Q6 w - - 0 1");
    let farther = common::parse("7k/8/8/8/8/8/8/1Q1K4 w - - 0 1");
    let cfg = EvalConfig::default();
    assert!(evaluate(&closer, &p, &cfg).conf > evaluate(&farther, &p, &cfg).conf);

    // Rule of the square boundary sharpness (sigma_u = 0.1).
    let outside = common::parse("8/8/8/8/4P3/8/k7/7K w - - 0 1");
    let inside = common::parse("8/8/8/8/2k1P3/8/8/7K w - - 0 1");
    let base = Params::default();
    let diff = evaluate(&outside, &base, &cfg).pawn - evaluate(&inside, &base, &cfg).pawn;
    assert!(diff > 4.5, "rule of the square jump expected > 4.5: {diff}");
}
