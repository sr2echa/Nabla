//! Parameter set of 02 §9.

use nabla_core::Params;

#[test]
fn there_are_57_tunable_coefficients() {
    assert_eq!(Params::NAMES.len(), 57);
}

#[test]
fn hash_identifies_the_parameter_set() {
    let a = Params::default();
    let mut b = a.clone();
    assert_eq!(a.hash_hex(), b.hash_hex());
    assert!(b.set("chi", 0.3));
    assert_ne!(a.hash_hex(), b.hash_hex());
    assert!(!b.set("no_such_coefficient", 1.0));
}

#[test]
fn initial_non_pawn_material_is_32() {
    assert!((Params::default().npm_0() - 32.0).abs() < 1e-5);
}
