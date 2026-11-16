//! Nabla core: ray-transport fields, an additive energy functional, and
//! energy-descent move selection.
//!
//! The specification lives in `docs/design/`:
//! `02-field-model.md` (fields and energy), `03-move-selection.md` (levels and
//! boundary conditions), and `04-strength-control.md` (Boltzmann policy).
//! Equation numbers in comments refer to those documents.

#![forbid(unsafe_code)]

pub mod board;
pub mod energy;
pub mod params;
pub mod policy;
pub mod see;
pub mod select;
pub mod transport;

pub use energy::{EvalConfig, Term, Terms, evaluate};
pub use params::Params;
pub use select::{Candidate, Decision, Level, SearchConfig, decide};
