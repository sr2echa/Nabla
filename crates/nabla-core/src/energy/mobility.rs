//! Flux (safe mobility) $E_\text{flux}$ (02 §5.2, Eq. (14)).

use shakmaty::{Color, Piece, Role, attacks};

use super::Ctx;
use crate::board::{COLORS, PIECES, idx, rel_squares, sign};

fn mu(ctx: &Ctx, role: Role) -> f32 {
    match role {
        Role::Knight => ctx.p.mu_n,
        Role::Bishop => ctx.p.mu_b,
        Role::Rook => ctx.p.mu_r,
        _ => ctx.p.mu_q,
    }
}

fn side(ctx: &Ctx, c: Color) -> f32 {
    let occupied = ctx.board.occupied();
    let unsafe_squares = ctx.board.by_color(c) | ctx.fields.pawn_attacks[idx(!c)];
    let mut sum = 0.0;
    for role in PIECES {
        let piece = Piece { color: c, role };
        for sq in rel_squares(c, ctx.board.by_piece(piece)) {
            let flux = (attacks::attacks(sq, piece, occupied) & !unsafe_squares).count();
            sum += mu(ctx, role) * flux as f32;
        }
    }
    sum
}

pub(crate) fn energy(ctx: &Ctx) -> f32 {
    COLORS
        .iter()
        .fold(0.0, |acc, &c| acc + sign(c) * side(ctx, c))
}
