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
            let mut union = Bitboard::EMPTY;
            for sq in board.by_color(c) {
                let piece = board.piece_at(sq).expect("occupied");
                union |= attacks::attacks(sq, piece, board.occupied());
            }
            let support: Bitboard = Square::ALL
                .into_iter()
                .filter(|s| f.direct[idx(c)][s.to_usize()] > 0.0)
                .collect();
            // Set predicates use the exact attack bitboard. The field's support
            // can only be smaller, and only by squares of a zero-weight king
            // (the king's weight is tapered to 0 in the middlegame).
            assert_eq!(f.attacked[idx(c)], union);
            assert!(support.is_subset(union));
            let king_reach = board
                .king_of(c)
                .map_or(Bitboard::EMPTY, attacks::king_attacks);
            assert!((union & !support).is_subset(king_reach));
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
    let p = Params::default();
    assert_eq!(p.theta_pp, 1.0);
    for pos in common::random_positions(10, 80) {
        let f = transport::compute(pos.board(), &p);
        for c in COLORS {
            for sq in pos.board().by_piece(Role::Pawn.of(c)) {
                let file_ahead = {
                    let mut bb = Bitboard::EMPTY;
                    let mut s = sq;
                    while let Some(next) = s.offset(if c.is_white() { 8 } else { -8 }) {
                        bb = bb.with(next);
                        s = next;
                    }
                    bb
                };
                let enemy_pawns = pos.board().by_piece(Role::Pawn.of(!c));
                let opaque = (file_ahead & enemy_pawns).count()
                    + ((file_ahead.with(sq)) & f.pawn_attacks[idx(!c)]).count();
                assert_eq!(
                    opaque == 0,
                    classically_passed(&pos, sq, c),
                    "{sq} in {:?}",
                    pos.board()
                );
            }
        }
    }
}
