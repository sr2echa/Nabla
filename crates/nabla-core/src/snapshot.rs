//! The position picture the lab draws: energy, control, tension, and threats.
//! None of these change move selection; `decide` does that.

use shakmaty::{Chess, Color, Position, Role, Square};

use crate::energy::{EvalConfig, Terms, evaluate};
use crate::params::Params;
use crate::see::see_square;
use crate::transport;

/// One square's display values, in LERF order (a1 = 0).
#[derive(Clone, Debug)]
pub struct Picture {
    pub energy: Terms,
    pub control: [f32; 64],
    pub tension: [f32; 64],
    /// Material the opponent can win by a capture on this square, in pawns.
    /// Zero when the square is empty or the capture does not pay.
    pub threats: [f32; 64],
}

/// Paint `pos` for the lab with default evaluation settings.
pub fn picture(pos: &Chess, params: &Params) -> Picture {
    picture_with_config(pos, params, &EvalConfig::default())
}

/// Paint `pos` for the lab using `cfg`. Threats exclude the king and reflect
/// material the opponent can win by capturing on each square.
pub fn picture_with_config(pos: &Chess, params: &Params, cfg: &EvalConfig) -> Picture {
    let fields = transport::compute(pos.board(), params);
    let mut control = [0.0; 64];
    let mut tension = [0.0; 64];
    let mut threats = [0.0; 64];
    for sq in Square::ALL {
        let i = sq.to_usize();
        control[i] = fields.control(sq);
        tension[i] = fields.tension(sq);
        if let Some(piece) = pos.board().piece_at(sq)
            && piece.role != Role::King
        {
            let gain = see_square(pos.board(), sq, !piece.color);
            if gain > 0 {
                threats[i] = gain as f32;
            }
        }
    }
    Picture {
        energy: evaluate(pos, params, cfg),
        control,
        tension,
        threats,
    }
}

/// White-positive energy of a position. Used by the tuner.
pub fn white_energy(pos: &Chess, params: &Params) -> f32 {
    evaluate(pos, params, &EvalConfig::default()).total()
}

/// `true` when the side to move has no capture that wins material.
pub fn is_quiet(pos: &Chess) -> bool {
    let targets = pos.them();
    !targets
        .into_iter()
        .any(|sq| see_square(pos.board(), sq, pos.turn()) > 0)
}

/// Colour of the side to move, for the lab.
pub fn turn_name(pos: &Chess) -> &'static str {
    if pos.turn() == Color::White {
        "white"
    } else {
        "black"
    }
}

/// Why the lab should stop, or that the game is still going.
///
/// `state` is the coarse value the page already branches on. `detail` names the
/// chess reason. Repetition is the FIDE threefold count. Nabla's search scores
/// the first recurrence as a draw (03 §3); that rule chooses moves and does not
/// end the game shown here.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub state: &'static str,
    pub detail: &'static str,
}

pub fn outcome(pos: &Chess, history: &[u64]) -> Outcome {
    if pos.is_checkmate() {
        return Outcome {
            state: "checkmate",
            detail: "checkmate",
        };
    }
    if pos.is_stalemate() {
        return Outcome {
            state: "draw",
            detail: "stalemate",
        };
    }
    if pos.is_insufficient_material() {
        return Outcome {
            state: "draw",
            detail: "material",
        };
    }
    if pos.halfmoves() >= 100 {
        return Outcome {
            state: "draw",
            detail: "fifty",
        };
    }
    let hash = crate::board::hash(pos);
    if history.iter().filter(|h| **h == hash).count() >= 3 {
        return Outcome {
            state: "draw",
            detail: "repetition",
        };
    }
    if pos.is_check() {
        Outcome {
            state: "check",
            detail: "check",
        }
    } else {
        Outcome {
            state: "play",
            detail: "play",
        }
    }
}
