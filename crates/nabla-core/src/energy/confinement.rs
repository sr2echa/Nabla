//! Endgame confinement $E_\text{conf}$ (02 §5.8, Eq. (25)).

use shakmaty::{Bitboard, Color, Role};

use super::{Ctx, logistic};
use crate::board::{COLORS, idx, king_dilate, manhattan, pieces, sign};
use crate::params::M_PAWN;

/// Gate below which the flood fill is skipped (02 §5.8).
const GATE_MIN: f32 = 1e-3;

/// Number of squares the king of `!c` can reach through squares that `c` does
/// not attack (seeing through that king) and that `!c`'s own pieces do not occupy.
fn region_size(ctx: &Ctx, c: Color, enemy_king: shakmaty::Square) -> u32 {
    let start = Bitboard::from_square(enemy_king).0;
    let blocked = ctx.fields.attacked_through_king[idx(c)] | ctx.board.by_color(!c);
    let open = !blocked.0 | start;
    let mut region = start;
    loop {
        let next = king_dilate(region) & open;
        if next == region {
            return region.count_ones();
        }
        region = next;
    }
}

fn side(ctx: &Ctx, c: Color) -> f32 {
    let p = ctx.p;
    // Non-pawn lead: pawn-up rook endings are left to the pawn terms.
    let non_pawn = |side: Color| {
        ctx.mass[idx(side)] - M_PAWN * pieces(ctx.board, side, Role::Pawn).count() as f32
    };
    let lead = non_pawn(c) - non_pawn(!c);
    let gate = (1.0 - ctx.phase) * logistic((lead - p.delta_0) / p.delta_s);
    if gate < GATE_MIN {
        return 0.0;
    }
    let (Some(own_king), Some(enemy_king)) = (ctx.board.king_of(c), ctx.board.king_of(!c)) else {
        return 0.0;
    };
    let area = region_size(ctx, c, enemy_king) as f32;
    let proximity = manhattan(own_king, enemy_king) as f32;
    gate * (p.zeta_1 * (1.0 - area / 64.0) + p.zeta_2 * (1.0 - proximity / 14.0))
}

pub(crate) fn energy(ctx: &Ctx) -> f32 {
    COLORS
        .iter()
        .fold(0.0, |acc, &c| acc + sign(c) * side(ctx, c))
}
