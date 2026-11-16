//! Colour antisymmetry (02 §6): $E(\mathcal{F}S) = -E(S)$ exactly, per term.

mod common;

use nabla_core::board::flip_colors;
use nabla_core::{EvalConfig, Params, Term, evaluate};
use shakmaty::{CastlingMode, Chess, EnPassantMode, Position};

#[test]
fn energy_is_exactly_antisymmetric_under_colour_flip() {
    let p = Params::default();
    let positions = common::random_positions(40, 80);
    assert!(positions.len() > 10_000);
    for realisable_capture in [true, false] {
        let cfg = EvalConfig {
            realisable_capture,
            disabled: 0,
        };
        for pos in &positions {
            let a = evaluate(pos, &p, &cfg);
            let b = evaluate(&flip_colors(pos), &p, &cfg);
            for t in Term::ALL {
                assert_eq!(
                    a.get(t),
                    -b.get(t),
                    "term {} in {:?}",
                    t.name(),
                    pos.board()
                );
            }
            assert_eq!(a.total(), -b.total());
        }
    }
}

#[test]
fn energy_is_file_mirror_invariant_without_castling_rights() {
    let p = Params::default();
    let cfg = EvalConfig::default();
    let mut checked = 0;
    for pos in common::random_positions(20, 80) {
        if pos.castles().any() {
            continue;
        }
        let mut setup = pos.to_setup(EnPassantMode::Legal);
        setup.board.flip_horizontal();
        setup.ep_square = setup.ep_square.map(|s| s.flip_horizontal());
        let mirrored: Chess = setup.position(CastlingMode::Standard).expect("legal");
        let (a, b) = (evaluate(&pos, &p, &cfg), evaluate(&mirrored, &p, &cfg));
        assert!((a.total() - b.total()).abs() < 1e-4, "{a:?} vs {b:?}");
        checked += 1;
    }
    assert!(checked > 1_000);
}
