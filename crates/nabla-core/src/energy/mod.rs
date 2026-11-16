//! The energy functional $E(S)$ (02 §5): nine additive terms, White-positive,
//! in pawn units.
//!
//! Each term is computed as a White part minus a Black part, using identical
//! code on colour-relative inputs, so that $E(\mathcal{F}S) = -E(S)$ holds
//! bit-for-bit (02 §6).

mod confinement;
mod exchange;
mod king;
mod material;
mod mobility;
mod pawns;
mod territory;
mod tropism;

use shakmaty::{Bitboard, Board, Chess, Color, Position};

use crate::board::{self, COLORS, PIECES, idx, pieces, sign};
use crate::params::Params;
use crate::transport::{self, Fields};

/// One additive term of the energy functional.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Term {
    Mat,
    Flux,
    Terr,
    Ex,
    King,
    Trop,
    Pawn,
    Conf,
    Tempo,
}

impl Term {
    pub const ALL: [Term; 9] = [
        Term::Mat,
        Term::Flux,
        Term::Terr,
        Term::Ex,
        Term::King,
        Term::Trop,
        Term::Pawn,
        Term::Conf,
        Term::Tempo,
    ];

    /// Short name used in UCI output and options (`Ablate_<name>`).
    pub fn name(self) -> &'static str {
        match self {
            Term::Mat => "mat",
            Term::Flux => "flux",
            Term::Terr => "terr",
            Term::Ex => "ex",
            Term::King => "king",
            Term::Trop => "trop",
            Term::Pawn => "pawn",
            Term::Conf => "conf",
            Term::Tempo => "tempo",
        }
    }

    pub fn from_name(name: &str) -> Option<Term> {
        Term::ALL
            .into_iter()
            .find(|t| t.name().eq_ignore_ascii_case(name))
    }

    fn bit(self) -> u16 {
        1 << (self as u16)
    }
}

/// Per-term energies of one position, White-positive (02 Eq. (11)).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Terms {
    pub mat: f32,
    pub flux: f32,
    pub terr: f32,
    pub ex: f32,
    pub king: f32,
    pub trop: f32,
    pub pawn: f32,
    pub conf: f32,
    pub tempo: f32,
}

impl Terms {
    /// $E(S)$, summed in a fixed order.
    pub fn total(&self) -> f32 {
        self.as_array().iter().fold(0.0, |acc, v| acc + v)
    }

    pub fn get(&self, t: Term) -> f32 {
        self.as_array()[t as usize]
    }

    pub fn as_array(&self) -> [f32; 9] {
        [
            self.mat, self.flux, self.terr, self.ex, self.king, self.trop, self.pawn, self.conf,
            self.tempo,
        ]
    }

    fn from_array(a: [f32; 9]) -> Terms {
        Terms {
            mat: a[0],
            flux: a[1],
            terr: a[2],
            ex: a[3],
            king: a[4],
            trop: a[5],
            pawn: a[6],
            conf: a[7],
            tempo: a[8],
        }
    }

    /// `scale · (self − other)`, term by term: the explanation of a move
    /// (03 §6) when `scale` is the mover's colour sign.
    pub fn diff_scaled(&self, other: &Terms, scale: f32) -> Terms {
        let (a, b) = (self.as_array(), other.as_array());
        Terms::from_array(std::array::from_fn(|i| scale * (a[i] - b[i])))
    }
}

/// Evaluation switches that depend on the selection level and on ablations.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EvalConfig {
    /// Whether the realisable-capture part of the exchange term is active
    /// ($\beta_1$; Level 0 only, 02 §5.4).
    pub realisable_capture: bool,
    /// Bit mask of disabled terms (ablations, protocol §7).
    pub disabled: u16,
}

impl Default for EvalConfig {
    fn default() -> Self {
        EvalConfig {
            realisable_capture: true,
            disabled: 0,
        }
    }
}

impl EvalConfig {
    pub fn enabled(&self, t: Term) -> bool {
        self.disabled & t.bit() == 0
    }

    pub fn set_enabled(&mut self, t: Term, on: bool) {
        if on {
            self.disabled &= !t.bit();
        } else {
            self.disabled |= t.bit();
        }
    }
}

/// Quantities shared by the term computations.
pub(crate) struct Ctx<'a> {
    pub board: &'a Board,
    pub p: &'a Params,
    pub fields: &'a Fields,
    /// Game phase $\varphi$ (Eq. (12)).
    pub phase: f32,
    /// Rest mass of each side at the current phase.
    pub mass: [f32; 2],
    /// Non-pawn material of each side under middlegame masses.
    pub npm_mg: [f32; 2],
    /// Pieces giving check to the side to move.
    pub checkers: Bitboard,
}

impl Ctx<'_> {
    /// Tapered coefficient $x(\varphi)$ (Eq. (12)).
    pub fn taper(&self, mg: f32, eg: f32) -> f32 {
        self.phase * mg + (1.0 - self.phase) * eg
    }
}

/// Evaluate all terms of $E(S)$ for `pos` (02 Eq. (11)).
pub fn evaluate(pos: &Chess, p: &Params, cfg: &EvalConfig) -> Terms {
    let fields = transport::compute(pos.board(), p);
    evaluate_with_fields(pos, p, cfg, &fields)
}

/// As [`evaluate`], reusing precomputed fields.
pub fn evaluate_with_fields(pos: &Chess, p: &Params, cfg: &EvalConfig, fields: &Fields) -> Terms {
    let board = pos.board();
    let mut ctx = Ctx {
        board,
        p,
        fields,
        phase: board::phase(board),
        mass: [0.0; 2],
        npm_mg: [0.0; 2],
        checkers: pos.checkers(),
    };
    for c in COLORS {
        ctx.mass[idx(c)] = material::rest_mass(&ctx, c);
        ctx.npm_mg[idx(c)] = non_pawn_material_mg(board, p, c);
    }
    let stm = pos.turn();
    let term = |t: Term, f: &dyn Fn() -> f32| if cfg.enabled(t) { f() } else { 0.0 };
    Terms {
        mat: term(Term::Mat, &|| ctx.mass[0] - ctx.mass[1]),
        flux: term(Term::Flux, &|| mobility::energy(&ctx)),
        terr: term(Term::Terr, &|| territory::energy(&ctx)),
        ex: term(Term::Ex, &|| {
            exchange::energy(&ctx, stm, cfg.realisable_capture)
        }),
        king: term(Term::King, &|| king::energy(&ctx)),
        trop: term(Term::Trop, &|| tropism::energy(&ctx)),
        pawn: term(Term::Pawn, &|| pawns::energy(&ctx, stm)),
        conf: term(Term::Conf, &|| confinement::energy(&ctx)),
        tempo: term(Term::Tempo, &|| sign(stm) * p.delta_tempo),
    }
}

/// $\mathrm{NPM}_c$ under middlegame masses.
fn non_pawn_material_mg(board: &Board, p: &Params, c: Color) -> f32 {
    let m = [p.m_n_mg, p.m_b_mg, p.m_r_mg, p.m_q_mg];
    PIECES.iter().zip(m).fold(0.0, |acc, (&role, mass)| {
        acc + mass * pieces(board, c, role).count() as f32
    })
}

/// Numerically stable $\ln(1 + e^x)$ using the portable `libm` implementation.
#[inline]
pub(crate) fn softplus(x: f32) -> f32 {
    if x > 30.0 {
        x
    } else {
        libm::log1pf(libm::expf(x))
    }
}

/// Logistic function $\sigma_\text{L}$.
#[inline]
pub(crate) fn logistic(x: f32) -> f32 {
    1.0 / (1.0 + libm::expf(-x))
}
