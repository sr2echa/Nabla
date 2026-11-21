//! Static exchange evaluation, ray transport, and pawn passage (02 §4, §5.4, §5.7).

mod common;

use nabla_core::Params;
use nabla_core::board::{COLORS, idx};
use nabla_core::see::{see_move, see_square};
use nabla_core::transport;
use shakmaty::{Bitboard, Color, Move, Position, Role, Square, attacks};

#[test]
fn see_reference_positions() {
    // Rook takes an undefended pawn.
    let pos = common::parse("1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1");
    let rxe5 = Move::Normal {
        role: Role::Rook,
        from: Square::E1,
        capture: Some(Role::Pawn),
        to: Square::E5,
        promotion: None,
    };
    assert_eq!(see_move(pos.board(), rxe5), 1);

    // Knight takes a defended pawn; X-ray recaptures make it lose 2.
    let pos = common::parse("1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1");
    let nxe5 = Move::Normal {
        role: Role::Knight,
        from: Square::D3,
        capture: Some(Role::Pawn),
        to: Square::E5,
        promotion: None,
    };
    assert_eq!(see_move(pos.board(), nxe5), -2);

    // Defended low-takes-high captures must account for the recapture.
    // White Rd1 attacks Black Qd4 defended by Black Pc5: 9 - 5 = +4 (not +9).
    let pos = common::parse("4k3/8/8/2p5/3q4/8/8/3RK3 w - - 0 1");
    assert_eq!(see_square(pos.board(), Square::D4, Color::White), 4);

    // White Pe4 attacks Black Nd5 defended by Black Pc6: 3 - 1 = +2 (not +3).
    let pos = common::parse("4k3/8/2p5/3n4/4P3/8/8/4K3 w - - 0 1");
    assert_eq!(see_square(pos.board(), Square::D5, Color::White), 2);

    // White Bd2 attacks Black Re3 defended by Black Pf4: 5 - 3 = +2 (not +5).
    let pos = common::parse("4k3/8/8/8/5p2/4r3/3B4/4K3 w - - 0 1");
    assert_eq!(see_square(pos.board(), Square::E3, Color::White), 2);

    // Three-ply capture chain: QxP (+1), RxQ (-8), PxR (-3).
    let pos = common::parse("3rk3/8/8/3p4/4P3/8/3Q4/4K3 w - - 0 1");
    let qxd5 = Move::Normal {
        role: Role::Queen,
        from: Square::D2,
        capture: Some(Role::Pawn),
        to: Square::D5,
        promotion: None,
    };
    assert_eq!(see_move(pos.board(), qxd5), -3);

    // En passant removes the captured pawn from its square, revealing X-ray defenders.
    // White Pe5 takes Black Pd5 e.p. on d6; Black Rd8 and White Rd1 are aligned on the d-file.
    // Removing d5 lets Black Rd8 recapture d6 (-1+1=0) and White Rd1 take back (+1), net +1.
    let pos = common::parse("3rk3/8/8/3pP3/8/8/8/3RK3 w - d6 0 1");
    let ep = Move::EnPassant {
        from: Square::E5,
        to: Square::D6,
    };
    assert_eq!(see_move(pos.board(), ep), 1);

    // Without White Rd1, removing d5 lets Black Rd8 capture the e.p. pawn for free (+1 - 1 = 0).
    let pos = common::parse("3rk3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    assert_eq!(see_move(pos.board(), ep), 0);

    // Promotion capture: g7xh8=Q defended by Black Ra8 scores 5 + 8 - 9 = +4.
    let pos = common::parse("r6r/6P1/4k3/8/8/8/8/4K3 w - - 0 1");
    let gxh8q = Move::Normal {
        role: Role::Pawn,
        from: Square::G7,
        capture: Some(Role::Rook),
        to: Square::H8,
        promotion: Some(Role::Queen),
    };
    assert_eq!(see_move(pos.board(), gxh8q), 4);
}

#[test]
fn king_cannot_capture_a_defended_piece() {
    // White king next to a black knight defended by a pawn.
    let pos = common::parse("4k3/8/8/2p5/3n4/3K4/8/8 w - - 0 1");
    assert_eq!(see_square(pos.board(), Square::D4, Color::White), 0);
    // Undefended: the king wins the knight.
    let pos = common::parse("4k3/8/8/8/3n4/3K4/8/8 w - - 0 1");
    assert_eq!(see_square(pos.board(), Square::D4, Color::White), 3);
}

#[test]
fn direct_support_is_within_the_attack_sets() {
    let p = Params::default();
    for pos in common::random_positions(10, 60) {
        let board = pos.board();
        let f = transport::compute(board, &p);
        for c in COLORS {
            let without_enemy_king = board.occupied() & !board.by_piece(Role::King.of(!c));
            let mut union = Bitboard::EMPTY;
            let mut union_through_king = Bitboard::EMPTY;
            for sq in board.by_color(c) {
                let piece = board.piece_at(sq).expect("occupied");
                union |= attacks::attacks(sq, piece, board.occupied());
                union_through_king |= attacks::attacks(sq, piece, without_enemy_king);
            }
            let support: Bitboard = Square::ALL
                .into_iter()
                .filter(|s| f.direct[idx(c)][s.to_usize()] > 0.0)
                .collect();
            // Set predicates use the exact attack bitboard. Direct ray transport
            // treats the enemy king as transparent, so its support lies inside
            // `attacked_through_king` and can differ only by a tapered-zero king.
            assert_eq!(f.attacked[idx(c)], union);
            assert_eq!(f.attacked_through_king[idx(c)], union_through_king);
            assert!(support.is_subset(union_through_king));
            let king_reach = board
                .king_of(c)
                .map_or(Bitboard::EMPTY, attacks::king_attacks);
            assert!((union_through_king & !support).is_subset(king_reach));
        }
    }
}

#[test]
fn battery_and_blocker_transmission() {
    // White rooks a1 and a2 (battery), knight on h2 in front of rook h1.
    let pos = common::parse("4k3/8/8/8/8/8/R6N/R3K2R w - - 0 1");
    let p = Params::default();
    let f = transport::compute(pos.board(), &p);
    let w = idx(Color::White);
    let a = |k: f32| 1.0 / (1.0 + p.lambda * (k - 1.0));
    // a3 is two steps from a1: X-ray through the battery partner a2,
    // plus the direct ray of a2 itself one step away.
    assert_eq!(
        f.xray[w][Square::A3.to_usize()],
        p.alpha_r * a(2.0) * p.theta_bat
    );
    assert_eq!(f.direct[w][Square::A3.to_usize()], p.alpha_r * a(1.0));
    // h3 behind the knight: only the weak non-battery X-ray of the h1 rook.
    assert_eq!(
        f.xray[w][Square::H3.to_usize()],
        p.alpha_r * a(2.0) * p.theta_fr
    );

    // Friendly pawn in front of a bishop is a non-battery blocker (theta_fr),
    // and an enemy king on a ray leaves squares behind it in the direct channel.
    let pos = common::parse("8/8/8/8/4k3/3P4/2B1R3/4K3 b - - 0 1");
    let f = transport::compute(pos.board(), &p);
    assert_eq!(
        f.xray[w][Square::E4.to_usize()],
        p.alpha_b * a(2.0) * p.theta_fr
    );
    // White Re2 shoots through Black Ke4 onto e5 in the direct channel.
    assert_eq!(f.direct[w][Square::E5.to_usize()], p.alpha_r * a(3.0));
    assert_eq!(f.xray[w][Square::E5.to_usize()], 0.0);
}

#[test]
fn safe_checks_include_supported_contact_checks() {
    use nabla_core::{EvalConfig, evaluate};

    // White Qf3 and Bh5 both attack f7, which is defended only by Black Kg8;
    // Black Re8, Pb7, Pe6 block all other checking squares for Qf3.
    let supported = common::parse("4r1k1/1p4pp/4p3/7B/8/5Q2/8/6K1 w - - 0 1");
    // Without Bh5, Qf3 alone on f7 is undefended against Kxf7.
    let solo = common::parse("4r1k1/1p4pp/4p3/8/8/5Q2/8/6K1 w - - 0 1");
    let def = Params::default();
    let p0 = Params {
        x_0: 0.0, // ensure breakdown is active so omega_chk visibly affects E_king
        omega_chk: 0.0,
        ..def.clone()
    };
    let p1 = Params {
        omega_chk: 1.0,
        ..p0.clone()
    };

    let cfg = EvalConfig::default();
    let d_supported = evaluate(&supported, &p1, &cfg).king - evaluate(&supported, &p0, &cfg).king;
    let d_solo = evaluate(&solo, &p1, &cfg).king - evaluate(&solo, &p0, &cfg).king;
    assert!(
        d_supported > 0.05,
        "supported contact check must count: {d_supported}"
    );
    assert_eq!(d_solo, 0.0, "unsupported check must not count: {d_solo}");
}

/// Classical passed-pawn predicate: no enemy pawn ahead on the same or
/// adjacent files.
fn classically_passed(pos: &shakmaty::Chess, sq: Square, c: Color) -> bool {
    let f = sq.file().to_u32() as i32;
    let r = sq.rank().to_u32() as i32;
    let enemy = pos.board().by_piece(Role::Pawn.of(!c));
    enemy.into_iter().all(|e| {
        let (ef, er) = (e.file().to_u32() as i32, e.rank().to_u32() as i32);
        let ahead = if c.is_white() { er > r } else { er < r };
        !((ef - f).abs() <= 1 && ahead)
    })
}

#[test]
fn passage_transmittance_matches_classical_predicate_at_unit_opacity() {
    use nabla_core::{EvalConfig, evaluate};

    let p = Params {
        theta_pp: 1.0,
        h_max_mg: 1.0,
        h_max_eg: 1.0,
        b_rho: 0.6,
        eps_blk: 0.0,
        u_bonus: 0.0,
        eps_k: 0.0,
        psi_b: 0.0,
        psi_i: 0.0,
        psi_d: 0.0,
        ..Params::default()
    };
    let cfg = EvalConfig::default();
    let denom = libm::expm1f(6.0 * p.b_rho);
    for pos in common::random_positions(10, 80) {
        let actual = evaluate(&pos, &p, &cfg).pawn;
        let mut expected = 0.0f32;
        for c in COLORS {
            let mut side = 0.0f32;
            for sq in nabla_core::board::rel_squares(c, pos.board().by_piece(Role::Pawn.of(c))) {
                if classically_passed(&pos, sq, c) {
                    let rho = nabla_core::board::rank_of(nabla_core::board::rel(c, sq)) as f32;
                    side += libm::expm1f(p.b_rho * rho) / denom;
                }
            }
            expected += nabla_core::board::sign(c) * side;
        }
        assert!(
            (actual - expected).abs() < 1e-4,
            "actual {actual} vs expected {expected} in {:?}",
            pos.board()
        );
    }

    // Soft passage opacity (theta_pp < 1) must not award U to a non-passed pawn.
    let blocked_non_passer = common::parse("7k/p7/8/8/P7/8/8/4K3 w - - 0 1");
    let soft = Params {
        theta_pp: 0.7,
        ..Params::default()
    };
    let e_soft = evaluate(&blocked_non_passer, &soft, &cfg).pawn;
    assert!(
        e_soft < 0.5,
        "non-passed pawn leaked unstoppable bonus: {e_soft}"
    );

    // b_rho = 0 uses the continuous linear rank limit without NaN.
    let linear = Params {
        b_rho: 0.0,
        u_bonus: 0.0,
        psi_b: 0.0,
        psi_i: 0.0,
        psi_d: 0.0,
        eps_k: 0.0,
        h_max_mg: 1.2,
        h_max_eg: 1.2,
        ..Params::default()
    };
    let single = common::parse("7k/8/8/8/4P3/8/8/4K3 w - - 0 1");
    let e_lin = evaluate(&single, &linear, &cfg).pawn;
    assert!((e_lin - 1.2 * 3.0 / 6.0).abs() < 1e-5, "{e_lin}");
}
