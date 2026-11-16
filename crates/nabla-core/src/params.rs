//! The parameter set of 02 §9: 57 tunable coefficients and the fixed constants.
//!
//! Every coefficient of the energy functional is a named field here; no other
//! module contains unnamed numeric weights.

/// Pawn rest mass; fixing it defines the energy unit (02 Eq. (13)).
pub const M_PAWN: f32 = 1.0;
/// Ray cut-off on cumulative transmittance (02 §4.1).
pub const T_MIN: f32 = 0.05;
/// Light-cone sharpness (02 Eq. (23)).
pub const SIGMA_U: f32 = 0.1;
/// Control saturation scale $\Phi_0$, fixed to remove an exact scaling
/// degeneracy among the transport and king coefficients (02 §9.2).
pub const PHI_0: f32 = 1.0;

macro_rules! params {
    ($( $(#[$doc:meta])* $name:ident = $default:expr ),* $(,)?) => {
        /// Tunable coefficients of the energy functional, in pawn units where
        /// applicable. Field names match the symbols of 02 §9.
        #[derive(Clone, Debug, PartialEq)]
        pub struct Params {
            $( $(#[$doc])* pub $name: f32, )*
        }

        impl Default for Params {
            fn default() -> Self {
                Self { $( $name: $default, )* }
            }
        }

        impl Params {
            /// Coefficient names, in declaration order.
            pub const NAMES: &'static [&'static str] = &[$( stringify!($name), )*];

            /// Value of the coefficient called `name`.
            pub fn get(&self, name: &str) -> Option<f32> {
                match name {
                    $( stringify!($name) => Some(self.$name), )*
                    _ => None,
                }
            }

            /// Set the coefficient called `name`; returns `false` for unknown names.
            pub fn set(&mut self, name: &str, value: f32) -> bool {
                match name {
                    $( stringify!($name) => { self.$name = value; true } )*
                    _ => false,
                }
            }
        }
    };
}

params! {
    // 02 §9.1 Material.
    m_n_mg = 3.2, m_n_eg = 3.2,
    m_b_mg = 3.3, m_b_eg = 3.4,
    m_r_mg = 5.0, m_r_eg = 5.2,
    m_q_mg = 9.0, m_q_eg = 9.4,
    // 02 §9.2 Ray transport and control.
    alpha_p = 1.0, alpha_n = 0.8, alpha_b = 0.8, alpha_r = 0.6, alpha_q = 0.4, alpha_k = 0.5,
    lambda = 0.12,
    theta_bat = 0.9, theta_fr = 0.25, theta_en = 0.5, theta_ep = 0.1,
    chi = 0.35,
    // 02 §9.3 Mobility and territory.
    mu_n = 0.040, mu_b = 0.035, mu_r = 0.025, mu_q = 0.012,
    w_0 = 0.02, w_c = 0.06,
    // 02 §9.4 Exchange.
    beta_1 = 1.0, beta_2 = 0.6,
    // 02 §9.5 King safety.
    g_0 = 0.6, gamma_q = 0.5, x_0 = 3.0, sigma_b = 1.0, d_max = 3.0,
    xi = 0.8, nu_sh = 0.5, omega_chk = 0.5,
    // 02 §9.6 Tropism and king activity.
    g_n = 0.03, g_b = 0.02, g_r = 0.02, g_q = 0.05, a_s = 2.0, g_k = 0.3,
    // 02 §9.7 Pawns.
    h_max_mg = 0.5, h_max_eg = 1.5, b_rho = 0.6, theta_pp = 1.0, eps_blk = 0.3,
    u_bonus = 5.0, eps_k = 0.05, psi_b = 0.05, psi_i = 0.15, psi_d = 0.15,
    // 02 §9.8 Confinement and tempo.
    zeta_1 = 1.0, zeta_2 = 0.3, delta_0 = 2.5, delta_s = 0.5,
    delta_tempo = 0.1,
}

impl Params {
    /// Stable identity of the parameter set: FNV-1a (64-bit) over the canonical
    /// `name=value` serialisation, as 16 hexadecimal digits (05 §6).
    pub fn hash_hex(&self) -> String {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for name in Self::NAMES {
            let line = format!("{name}={:?}\n", self.get(name).unwrap_or_default());
            for b in line.bytes() {
                h ^= u64::from(b);
                h = h.wrapping_mul(0x0100_0000_01b3);
            }
        }
        format!("{h:016x}")
    }

    /// Initial non-pawn material of one side, $\mathrm{NPM}_0$ (02 Eq. (19)).
    pub fn npm_0(&self) -> f32 {
        2.0 * (self.m_n_mg + self.m_b_mg + self.m_r_mg) + self.m_q_mg
    }
}
