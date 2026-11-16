//! Tropism and endgame king activity $E_\text{trop}$ (02 §5.6, Eq. (20)).

use shakmaty::{Color, Role};

use super::Ctx;
use crate::board::{COLORS, PIECES, centre_distance, file_of, pieces, rank_of, rel_squares, sign};

fn weight(ctx: &Ctx, role: Role) -> f32 {
    match role {
        Role::Knight => ctx.p.g_n,
        Role::Bishop => ctx.p.g_b,
        Role::Rook => ctx.p.g_r,
        _ => ctx.p.g_q,
    }
}

fn side(ctx: &Ctx, c: Color) -> f32 {
    let p = ctx.p;
    let mut pull = 0.0;
    if let Some(enemy_king) = ctx.board.king_of(!c) {
        let a2 = p.a_s * p.a_s;
        for role in PIECES {
            for sq in rel_squares(c, pieces(ctx.board, c, role)) {
                let df = file_of(sq) - file_of(enemy_king);
                let dr = rank_of(sq) - rank_of(enemy_king);
                let d2 = (df * df + dr * dr) as f32;
                pull += weight(ctx, role) / (1.0 + d2 / a2);
            }
        }
    }
    let activity = match ctx.board.king_of(c) {
        Some(k) => p.g_k * (3 - centre_distance(k)) as f32 / 3.0,
        None => 0.0,
    };
    ctx.phase * pull + (1.0 - ctx.phase) * activity
}

pub(crate) fn energy(ctx: &Ctx) -> f32 {
    COLORS
        .iter()
        .fold(0.0, |acc, &c| acc + sign(c) * side(ctx, c))
}
