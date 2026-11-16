//! Exchange energy $E_\text{ex}$ (02 §5.4, Eq. (16)).

use shakmaty::{Color, Role};

use super::Ctx;
use crate::board::{rel_squares, sign};
use crate::see::see_square;

/// The two largest SEE gains available to colour `c`, over distinct target
/// squares holding enemy pieces other than the king.
fn top_gains(ctx: &Ctx, c: Color) -> (i32, i32) {
    let targets = ctx.board.by_color(!c) & !ctx.board.by_role(Role::King);
    let (mut g1, mut g2) = (0, 0);
    for sq in rel_squares(c, targets) {
        let g = see_square(ctx.board, sq, c).max(0);
        if g > g1 {
            g2 = g1;
            g1 = g;
        } else if g > g2 {
            g2 = g;
        }
    }
    (g1, g2)
}

/// Gain for colour `c` from capturing its single checker (0 under double check).
fn checker_capture_gain(ctx: &Ctx, c: Color) -> i32 {
    match ctx.checkers.single_square() {
        Some(sq) => see_square(ctx.board, sq, c).max(0),
        None => 0,
    }
}

/// Exchange value for the side to move, before the colour sign (Eq. (16)).
///
/// One move either cashes the best capture (`capture`) or parries a threat
/// (`parry`), never both. A side in check can do neither freely: it may only
/// capture its checker, and every opponent threat stays realisable.
fn compose(g1_stm: i32, g1_opp: i32, g2_opp: i32, beta_1: f32, beta_2: f32, in_check: bool) -> f32 {
    let capture = beta_1 * g1_stm as f32 - beta_2 * g1_opp as f32;
    if in_check {
        return capture;
    }
    let parry = -beta_2 * g2_opp as f32;
    capture.max(parry)
}

/// $E_\text{ex}$, White-positive.
pub(crate) fn energy(ctx: &Ctx, stm: Color, realisable_capture: bool) -> f32 {
    let in_check = ctx.checkers.any();
    let g1_stm = if in_check {
        checker_capture_gain(ctx, stm)
    } else {
        top_gains(ctx, stm).0
    };
    let (g1_opp, g2_opp) = top_gains(ctx, !stm);
    let beta_1 = if realisable_capture {
        ctx.p.beta_1
    } else {
        0.0
    };
    sign(stm) * compose(g1_stm, g1_opp, g2_opp, beta_1, ctx.p.beta_2, in_check)
}

#[cfg(test)]
mod tests {
    use super::compose;

    #[test]
    fn a_move_cannot_both_capture_and_parry() {
        // Capturing a minor (3) while a queen (9) hangs is worse than parrying.
        assert_eq!(compose(3, 9, 0, 1.0, 0.6, false), 0.0);
        // A free capture with no threats is cashed in full.
        assert_eq!(compose(5, 0, 0, 1.0, 0.6, false), 5.0);
        // A fork: only the second threat is realisable after a parry.
        assert_eq!(compose(0, 5, 3, 1.0, 0.6, false), -0.6 * 3.0);
    }

    #[test]
    fn a_side_in_check_cannot_parry() {
        assert_eq!(compose(0, 5, 0, 1.0, 0.6, true), -0.6 * 5.0);
    }

    #[test]
    fn without_realisable_captures_only_the_fork_counts() {
        // Levels >= 1 set beta_1 = 0: the formula reduces to -beta_2 * G2.
        assert_eq!(compose(9, 5, 3, 0.0, 0.6, false), -0.6 * 3.0);
    }
}
