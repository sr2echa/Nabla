//! Rest mass $E_\text{mat}$ (02 §5.1, Eq. (13)).

use shakmaty::{Color, Role};

use super::Ctx;
use crate::board::pieces;
use crate::params::M_PAWN;

/// Tapered rest mass of all pieces of colour `c` (kings excluded).
pub(crate) fn rest_mass(ctx: &Ctx, c: Color) -> f32 {
    let p = ctx.p;
    let count = |role| pieces(ctx.board, c, role).count() as f32;
    M_PAWN * count(Role::Pawn)
        + ctx.taper(p.m_n_mg, p.m_n_eg) * count(Role::Knight)
        + ctx.taper(p.m_b_mg, p.m_b_eg) * count(Role::Bishop)
        + ctx.taper(p.m_r_mg, p.m_r_eg) * count(Role::Rook)
        + ctx.taper(p.m_q_mg, p.m_q_eg) * count(Role::Queen)
}
