//! King safety, breakdown model $E_\text{king}$ (02 §5.5, Eqs. (17)–(19)).

use shakmaty::{Bitboard, Color, Piece, Role, attacks};

use super::{Ctx, softplus};
use crate::board::{PIECES, file_of, forward, idx, pieces, rank_of, rel_squares, square_at};

/// King zone $Z_c$: the king, its neighbours, and three squares two ranks ahead.
fn zone(c: Color, king: shakmaty::Square) -> Bitboard {
    let mut z = attacks::king_attacks(king).with(king);
    let (f, r) = (file_of(king), rank_of(king) + 2 * forward(c));
    for df in -1..=1 {
        if let Some(sq) = square_at(f + df, r) {
            z = z.with(sq);
        }
    }
    z
}

/// Pressure $P_c$ on king `c` (Eq. (17)).
fn pressure(ctx: &Ctx, c: Color, king: shakmaty::Square) -> f32 {
    let mut p = 0.0;
    for sq in rel_squares(c, zone(c, king)) {
        p += ctx.fields.influence(!c, sq);
    }
    p + ctx.p.omega_chk * safe_checks(ctx, c, king) as f32
}

/// Number of safe checking squares against king `c` (02 §5.5).
fn safe_checks(ctx: &Ctx, c: Color, king: shakmaty::Square) -> usize {
    let occupied = ctx.board.occupied();
    let them = !c;
    let excluded = ctx.board.by_color(them) | ctx.fields.attacked[idx(c)];
    let mut squares = Bitboard::EMPTY;
    for role in PIECES {
        let piece = Piece { color: them, role };
        let checking = attacks::attacks(king, piece, occupied);
        let mut reach = Bitboard::EMPTY;
        for sq in pieces(ctx.board, them, role) {
            reach |= attacks::attacks(sq, piece, occupied);
        }
        squares |= checking & reach & !excluded;
    }
    squares.count()
}

/// Shelter $H_c$ (Eq. (18)).
fn shelter(ctx: &Ctx, c: Color, king: shakmaty::Square) -> f32 {
    let own_pawns = pieces(ctx.board, c, Role::Pawn);
    let (fk, rk) = (file_of(king), rank_of(king));
    let mut h = 0.0;
    for f in fk - 1..=fk + 1 {
        let mut w = 1.0;
        for k in 1..=3 {
            if let Some(sq) = square_at(f, rk + k * forward(c))
                && own_pawns.contains(sq)
            {
                h += w;
            }
            w *= ctx.p.nu_sh;
        }
    }
    h
}

/// Danger to king `c` (Eq. (19)): a softplus breakdown in the net pressure,
/// zeroed at no pressure and no shelter, and bounded by $D_\text{max}$.
fn danger(ctx: &Ctx, c: Color) -> f32 {
    let Some(king) = ctx.board.king_of(c) else {
        return 0.0;
    };
    let p = ctx.p;
    let them = !c;
    let queen = if pieces(ctx.board, them, Role::Queen).any() {
        1.0
    } else {
        0.0
    };
    let gamma = p.g_0 * (ctx.npm_mg[idx(them)] / p.npm_0()) * (1.0 + p.gamma_q * queen);
    let z = (pressure(ctx, c, king) - p.xi * shelter(ctx, c, king) - p.x_0) / p.sigma_b;
    let z_0 = -p.x_0 / p.sigma_b;
    let breakdown = p.sigma_b * (softplus(z) - softplus(z_0));
    gamma * p.d_max * libm::tanhf(breakdown / p.d_max)
}

pub(crate) fn energy(ctx: &Ctx) -> f32 {
    danger(ctx, Color::Black) - danger(ctx, Color::White)
}
