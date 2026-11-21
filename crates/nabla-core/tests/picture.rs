//! The picture the lab draws.

mod common;

use nabla_core::{Params, is_quiet, picture};

#[test]
fn the_opening_has_no_hanging_piece() {
    let pos = common::parse("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    let pic = picture(&pos, &Params::default());
    assert!(pic.threats.iter().all(|t| *t == 0.0));
    assert_eq!(pic.control.len(), 64);
    assert!(is_quiet(&pos));
}

#[test]
fn a_free_queen_is_marked_as_a_threat() {
    // The rook on d1 attacks the queen on d4, and nothing defends it.
    let pos = common::parse("4k3/8/8/8/3q4/8/8/3RK3 w - - 0 1");
    let pic = picture(&pos, &Params::default());
    let queen = shakmaty::Square::D4.to_usize();
    assert!(pic.threats[queen] >= 9.0, "{}", pic.threats[queen]);

    // A checked king must never appear in `threats`.
    let check = common::parse("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1");
    let pic_check = picture(&check, &Params::default());
    assert_eq!(pic_check.threats[shakmaty::Square::E8.to_usize()], 0.0);
}

#[test]
fn the_lab_names_the_reason_a_game_stopped() {
    use nabla_core::outcome;

    let mate = common::parse("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    assert_eq!(outcome(&mate, &[]).detail, "checkmate");

    let stale = common::parse("k7/2Q5/2K5/8/8/8/8/8 b - - 0 1");
    assert_eq!(outcome(&stale, &[]).detail, "stalemate");

    let bare = common::parse("8/8/8/8/8/8/8/K1k5 w - - 0 1");
    assert_eq!(outcome(&bare, &[]).detail, "material");

    let fifty = common::parse("8/8/4k3/8/8/8/4P3/4K3 w - - 100 60");
    assert_eq!(outcome(&fifty, &[]).detail, "fifty");

    let open = common::parse("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    let hash = nabla_core::board::hash(&open);
    assert_eq!(outcome(&open, &[hash, hash]).detail, "play");
    assert_eq!(outcome(&open, &[hash, hash, hash]).detail, "repetition");
}
