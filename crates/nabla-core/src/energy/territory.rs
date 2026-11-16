//! Territory (saturating control) $E_\text{terr}$ (02 §5.3, Eqs. (10), (15)).

use shakmaty::{Color, Square};

use super::Ctx;
use crate::board::{centre_distance, rel};
use crate::params::PHI_0;

/// Square weight $w(i)$; symmetric under the colour flip.
fn weight(ctx: &Ctx, sq: Square) -> f32 {
    ctx.p.w_0 + ctx.p.w_c * (3 - centre_distance(sq)) as f32 / 3.0
}

/// $\sum_j w(j) \tanh\big((\Phi_c - \Phi_{\bar c})/\Phi_0\big)$ over squares in
/// `c`-relative order. Equals $s_c E_\text{terr}$.
fn side(ctx: &Ctx, c: Color) -> f32 {
    let mut sum = 0.0;
    for j in Square::ALL {
        let sq = rel(c, j);
        let own = ctx.fields.influence(c, sq);
        let their = ctx.fields.influence(!c, sq);
        sum += weight(ctx, sq) * libm::tanhf((own - their) / PHI_0);
    }
    sum
}

/// $E_\text{terr} = \sum_i w(i)\,\Omega(i)$, computed as half the difference of
/// the two colour-relative sums so that it is exactly antisymmetric.
pub(crate) fn energy(ctx: &Ctx) -> f32 {
    0.5 * (side(ctx, Color::White) - side(ctx, Color::Black))
}
