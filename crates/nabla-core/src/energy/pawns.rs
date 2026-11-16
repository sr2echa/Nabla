//! Pawn energy $E_\text{pawn}$ (02 §5.7, Eqs. (21)–(24)).
//!
//! All bitboards are taken in the pawn owner's relative frame, so "ahead"
//! always means "towards rank 8" and the code is identical for both colours.

use shakmaty::{Bitboard, Color, Role};

use super::{Ctx, logistic};
use crate::board::{
    COLORS, FILE_A, FILE_H, file_of, idx, pieces, rank_of, rel, rel_bb, sign, square_at,
};
use crate::params::SIGMA_U;

fn side(ctx: &Ctx, c: Color, stm: Color) -> f32 {
    let p = ctx.p;
    let board = ctx.board;
    let own = rel_bb(c, pieces(board, c, Role::Pawn)).0;
    let enemy = rel_bb(c, pieces(board, !c, Role::Pawn)).0;

    let own_attacks = rel_bb(c, ctx.fields.pawn_attacks[idx(c)]).0;
    let occupied = rel_bb(c, board.occupied()).0;
    let own_king = board.king_of(c).map(|k| rel(c, k));
    let enemy_king = board.king_of(!c).map(|k| rel(c, k));
    let defender_has_pieces = ctx.npm_mg[idx(!c)] > 0.0;
    let h_max = ctx.taper(p.h_max_mg, p.h_max_eg);
    let h_norm = libm::expf(6.0 * p.b_rho) - 1.0;
    let to_move_penalty = if stm == c { 0 } else { 1 };

    let mut sum = 0.0;
    for sq in Bitboard(own) {
        let (f, r) = (file_of(sq), rank_of(sq));
        let bit = 1u64 << sq.to_u32();
        let file_mask = FILE_A << f;
        let ahead = if r < 7 { !0u64 << (8 * (r + 1)) } else { 0 };
        let path = file_mask & ahead;
        let adjacent = ((file_mask << 1) & !FILE_A) | ((file_mask >> 1) & !FILE_H);
        let front_span = (file_mask | adjacent) & ahead;

        // Passage transmittance, Eq. (21): one factor per enemy pawn in the
        // front span; at theta_pp = 1 this is the passed-pawn predicate.
        let opaque = (front_span & enemy).count_ones();
        let mut t_pass = 1.0f32;
        for _ in 0..opaque {
            t_pass *= 1.0 - p.theta_pp;
        }

        let mut v = 0.0;
        if own_attacks & bit != 0 {
            v += p.psi_b;
        }
        if own & adjacent == 0 {
            v -= p.psi_i;
        }
        if own & path != 0 {
            v -= p.psi_d;
        }

        if t_pass > 0.0 {
            let stop = square_at(f, r + 1).expect("pawns never stand on the last rank");
            let promotion = square_at(f, 7).expect("file is on the board");
            let blocked = if occupied & (1u64 << stop.to_u32()) != 0 {
                1.0
            } else {
                0.0
            };
            // Rank potential, Eq. (22).
            let h = h_max * (libm::expf(p.b_rho * r as f32) - 1.0) / h_norm;
            // Light cone, Eq. (23).
            let mut u = 0.0;
            if !defender_has_pieces && let Some(ek) = enemy_king {
                // A defending king next to the pawn, with the move, takes it.
                let capturable = to_move_penalty == 1 && ek.distance(sq) <= 1;
                if !capturable {
                    let d_p = 7 - r - i32::from(r == 1);
                    let d_k = ek.distance(promotion) as i32;
                    u = logistic(((d_k - d_p - to_move_penalty) as f32 - 0.5) / SIGMA_U);
                }
            }
            let escort = match (own_king, enemy_king) {
                (Some(ok), Some(ek)) => {
                    let gap = ek.distance(stop) as i32 - ok.distance(stop) as i32;
                    (1.0 - ctx.phase) * p.eps_k * gap as f32
                }
                _ => 0.0,
            };
            v += t_pass * (1.0 - p.eps_blk * blocked) * (h + p.u_bonus * u + escort);
        }
        sum += v;
    }
    sum
}

pub(crate) fn energy(ctx: &Ctx, stm: Color) -> f32 {
    COLORS
        .iter()
        .fold(0.0, |acc, &c| acc + sign(c) * side(ctx, c, stm))
}
