//! Static exchange evaluation (02 §5.4).
//!
//! Swap algorithm with least-valuable-attacker ordering and X-ray discovery.
//! `see_move` models en passant captures and first-move promotion captures;
//! documented simplifications: pins of capturing pieces and mid-sequence
//! promotions are ignored.

use shakmaty::{Bitboard, Board, Color, Move, Role, Square, attacks};

use crate::board::{rel, rel_bb};

/// Fixed SEE values (P, N, B, R, Q); the king is effectively infinite.
#[inline]
pub fn value(role: Role) -> i32 {
    match role {
        Role::Pawn => 1,
        Role::Knight | Role::Bishop => 3,
        Role::Rook => 5,
        Role::Queen => 9,
        Role::King => 1000,
    }
}

/// All pieces of both colours attacking `target` under occupancy `occupied`.
fn attackers_to(board: &Board, target: Square, occupied: Bitboard) -> Bitboard {
    let rook_like = board.rooks_and_queens();
    let bishop_like = board.bishops_and_queens();
    ((attacks::rook_attacks(target, occupied) & rook_like)
        | (attacks::bishop_attacks(target, occupied) & bishop_like)
        | (attacks::knight_attacks(target) & board.knights())
        | (attacks::king_attacks(target) & board.kings())
        | (attacks::pawn_attacks(Color::White, target) & board.pawns() & board.black())
        | (attacks::pawn_attacks(Color::Black, target) & board.pawns() & board.white()))
        & occupied
}

/// Least valuable piece of `side` within `candidates`. Ties between equal
/// roles are broken in `side`-relative square order: which attacker moves
/// first decides which X-ray is revealed, so an absolute tie-break would make
/// SEE colour-asymmetric.
fn least_valuable(board: &Board, side: Color, candidates: Bitboard) -> Option<Square> {
    crate::board::ROLES.iter().find_map(|&role| {
        let own = rel_bb(side, candidates & board.by_role(role));
        own.first().map(|s| rel(side, s))
    })
}

/// Material gain for `side` from capturing first on `target` (0 if the square
/// is empty or `side` has no capture). Never positive for the opponent; may be
/// negative when the first capture loses material.
pub fn see_square(board: &Board, target: Square, side: Color) -> i32 {
    let Some(victim) = board.role_at(target) else {
        return 0;
    };
    let candidates = attackers_to(board, target, board.occupied()) & board.by_color(side);
    match least_valuable(board, side, candidates) {
        Some(from) => {
            let Some(attacker) = board.role_at(from) else {
                return 0;
            };
            swap_with(
                board,
                target,
                from,
                side,
                attacker,
                value(victim),
                board.occupied(),
            )
        }
        None => 0,
    }
}

/// SEE of a specific capture move, including en passant and promotion captures.
/// Non-captures return 0.
pub fn see_move(board: &Board, m: Move) -> i32 {
    match m {
        Move::Normal {
            role,
            from,
            to,
            capture: Some(victim),
            promotion,
        } => {
            let Some(first) = board.piece_at(from) else {
                return 0;
            };
            let initial_gain = value(victim) + promotion.map_or(0, |r| value(r) - value(role));
            let initial_role = promotion.unwrap_or(first.role);
            swap_with(
                board,
                to,
                from,
                first.color,
                initial_role,
                initial_gain,
                board.occupied(),
            )
        }
        Move::EnPassant { from, to } => {
            let Some(first) = board.piece_at(from) else {
                return 0;
            };
            let captured_sq = Square::from_coords(to.file(), from.rank());
            let initial_occupied = board.occupied().without(captured_sq);
            swap_with(
                board,
                to,
                from,
                first.color,
                Role::Pawn,
                value(Role::Pawn),
                initial_occupied,
            )
        }
        _ => 0,
    }
}

/// Swap algorithm with a fixed first attacker on `from`.
fn swap_with(
    board: &Board,
    target: Square,
    from: Square,
    mut side: Color,
    mut attacker_role: Role,
    initial_gain: i32,
    mut occupied: Bitboard,
) -> i32 {
    let mut gain = [0i32; 34];
    let mut attacker_sq = from;
    gain[0] = initial_gain;
    let mut d = 0usize;
    loop {
        // A king may capture only onto a square the opponent no longer attacks.
        if attacker_role == Role::King {
            let after = occupied.without(attacker_sq);
            if (attackers_to(board, target, after) & board.by_color(!side)).any() {
                if d == 0 {
                    return 0;
                }
                break;
            }
        }
        d += 1;
        gain[d] = value(attacker_role) - gain[d - 1];
        occupied = occupied.without(attacker_sq);
        side = !side;
        let candidates = attackers_to(board, target, occupied) & board.by_color(side);
        match least_valuable(board, side, candidates) {
            Some(sq) => {
                attacker_sq = sq;
                attacker_role = board.role_at(sq).expect("attacker square is occupied");
            }
            None => break,
        }
    }
    while d > 1 {
        d -= 1;
        gain[d - 1] = -(-gain[d - 1]).max(gain[d]);
    }
    gain[0]
}
