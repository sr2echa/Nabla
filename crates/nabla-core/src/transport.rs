//! Ray transport and per-side fields (02 §4).

use shakmaty::{Bitboard, Board, Color, Piece, Role, Square, attacks};

use crate::board::{self, COLORS, ROLES, file_of, forward, idx, rank_of, rel_squares, square_at};
use crate::params::{PHI_0, Params, T_MIN};

/// Orthogonal directions as (file, rank) steps, in colour-relative form.
const ORTHOGONAL: [(i32, i32); 4] = [(0, 1), (0, -1), (1, 0), (-1, 0)];
/// Diagonal directions as (file, rank) steps, in colour-relative form.
const DIAGONAL: [(i32, i32); 4] = [(1, 1), (-1, 1), (1, -1), (-1, -1)];
/// Queen directions: orthogonal, then diagonal.
const QUEEN: [(i32, i32); 8] = [
    (0, 1),
    (0, -1),
    (1, 0),
    (-1, 0),
    (1, 1),
    (-1, 1),
    (1, -1),
    (-1, -1),
];

/// Per-side fields of one position. Arrays are indexed `[colour][square]`
/// with White = 0 and squares in LERF order (a1 = 0).
#[derive(Clone, Debug)]
pub struct Fields {
    /// Direct field $A_c$ (Eq. (5)).
    pub direct: [[f32; 64]; 2],
    /// X-ray field $X_c$ (Eq. (6)).
    pub xray: [[f32; 64]; 2],
    /// Squares attacked by colour $c$.
    pub attacked: [Bitboard; 2],
    /// Squares attacked by non-king pieces of colour $c$.
    pub attacked_non_king: [Bitboard; 2],
    /// Squares attacked by at least two distinct pieces of colour $c$.
    pub attacked_twice: [Bitboard; 2],
    /// Squares attacked by pawns of colour $c$, $\mathrm{PA}_c$.
    pub pawn_attacks: [Bitboard; 2],
    /// Squares attacked by colour $c$ with the enemy king removed from the
    /// board, so that squares behind a checked king count as attacked
    /// (also the superset of $A_c$'s support, 02 §4.2, §5.8).
    pub attacked_through_king: [Bitboard; 2],
    /// X-ray weight $\chi$ used to form $\Phi_c$.
    pub chi: f32,
}

impl Fields {
    /// Influence $\Phi_c(i) = A_c(i) + \chi X_c(i)$ (Eq. (7)).
    #[inline]
    pub fn influence(&self, c: Color, sq: Square) -> f32 {
        let i = idx(c);
        self.direct[i][sq.to_usize()] + self.chi * self.xray[i][sq.to_usize()]
    }

    /// Control $\Omega(i) = \tanh\big((\Phi_W - \Phi_B)/\Phi_0\big)$ (Eq. (10)).
    pub fn control(&self, sq: Square) -> f32 {
        libm::tanhf((self.influence(Color::White, sq) - self.influence(Color::Black, sq)) / PHI_0)
    }

    /// Tension $\Theta(i) = \min(\Phi_W, \Phi_B)$ (Eq. (9)).
    pub fn tension(&self, sq: Square) -> f32 {
        self.influence(Color::White, sq)
            .min(self.influence(Color::Black, sq))
    }
}

/// Control weight $\alpha_t$; the king's is tapered by $1 - \varphi$ so that
/// it controls squares only as material comes off (02 §4.2).
fn alpha(p: &Params, role: Role, phase: f32) -> f32 {
    match role {
        Role::Pawn => p.alpha_p,
        Role::Knight => p.alpha_n,
        Role::Bishop => p.alpha_b,
        Role::Rook => p.alpha_r,
        Role::Queen => p.alpha_q,
        Role::King => p.alpha_k * (1.0 - phase),
    }
}

/// Distance attenuation $a(k)$ (Eq. (4)).
#[inline]
fn attenuation(p: &Params, k: i32) -> f32 {
    1.0 / (1.0 + p.lambda * (k - 1) as f32)
}

/// Single-blocker transmission coefficient $\theta$ (Eq. (3)) for a ray of
/// colour `emitter` travelling in actual direction `(df, dr)`.
fn transmission(p: &Params, blocker: Piece, emitter: Color, df: i32, dr: i32) -> f32 {
    if blocker.color == emitter {
        let diagonal = df != 0 && dr != 0;
        let compatible = match blocker.role {
            Role::Queen => true,
            Role::Rook => !diagonal,
            Role::Bishop => diagonal,
            Role::Pawn | Role::Knight | Role::King => false,
        };
        if compatible { p.theta_bat } else { p.theta_fr }
    } else {
        match blocker.role {
            Role::King => 1.0,
            Role::Pawn => p.theta_ep,
            _ => p.theta_en,
        }
    }
}

/// Compute the per-side fields of `board` (02 §4).
pub fn compute(board: &Board, p: &Params) -> Fields {
    let mut f = Fields {
        direct: [[0.0; 64]; 2],
        xray: [[0.0; 64]; 2],
        attacked: [Bitboard::EMPTY; 2],
        attacked_non_king: [Bitboard::EMPTY; 2],
        attacked_twice: [Bitboard::EMPTY; 2],
        pawn_attacks: [Bitboard::EMPTY; 2],
        attacked_through_king: [Bitboard::EMPTY; 2],
        chi: p.chi,
    };
    let occupied = board.occupied();
    let phase = board::phase(board);
    for c in COLORS {
        let ci = idx(c);
        let without_enemy_king = occupied
            & !board.by_piece(Piece {
                color: !c,
                role: Role::King,
            });
        for role in ROLES {
            let piece = Piece { color: c, role };
            let a = alpha(p, role, phase);
            for sq in rel_squares(c, board.by_piece(piece)) {
                let att = attacks::attacks(sq, piece, occupied);
                f.attacked_twice[ci] |= f.attacked[ci] & att;
                f.attacked[ci] |= att;
                if role != Role::King {
                    f.attacked_non_king[ci] |= att;
                }
                f.attacked_through_king[ci] |= attacks::attacks(sq, piece, without_enemy_king);
                match role {
                    Role::Pawn | Role::Knight | Role::King => {
                        if role == Role::Pawn {
                            f.pawn_attacks[ci] |= att;
                        }
                        for t in rel_squares(c, att) {
                            f.direct[ci][t.to_usize()] += a;
                        }
                    }
                    Role::Bishop | Role::Rook | Role::Queen => {
                        let dirs: &[(i32, i32)] = match role {
                            Role::Bishop => &DIAGONAL,
                            Role::Rook => &ORTHOGONAL,
                            _ => &QUEEN,
                        };
                        for &(df, dr_rel) in dirs {
                            walk_ray(&mut f, board, p, c, a, sq, df, dr_rel * forward(c));
                        }
                    }
                }
            }
        }
    }
    f
}

/// One piece's direct or X-ray contribution to a target square.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SquareSource {
    pub color: Color,
    pub role: Role,
    pub from: Square,
    pub xray: bool,
    /// Weighted contribution to $\Phi_c$ (already scaled by $\chi$ when `xray`).
    pub weight: f32,
}

/// All direct and X-ray contributors bearing on `target`, in colour-relative
/// piece iteration order (02 §4, 06 §4).
pub fn square_sources(board: &Board, p: &Params, target: Square) -> Vec<SquareSource> {
    let occupied = board.occupied();
    let phase = board::phase(board);
    let mut out = Vec::new();
    for c in COLORS {
        for role in ROLES {
            let piece = Piece { color: c, role };
            let a = alpha(p, role, phase);
            for from in rel_squares(c, board.by_piece(piece)) {
                match role {
                    Role::Pawn | Role::Knight | Role::King => {
                        if attacks::attacks(from, piece, occupied).contains(target) {
                            out.push(SquareSource {
                                color: c,
                                role,
                                from,
                                xray: false,
                                weight: a,
                            });
                        }
                    }
                    Role::Bishop | Role::Rook | Role::Queen => {
                        let dirs: &[(i32, i32)] = match role {
                            Role::Bishop => &DIAGONAL,
                            Role::Rook => &ORTHOGONAL,
                            _ => &QUEEN,
                        };
                        for &(df, dr_rel) in dirs {
                            trace_ray(
                                board,
                                p,
                                c,
                                a,
                                from,
                                df,
                                dr_rel * forward(c),
                                |sq, xray, w| {
                                    if sq == target {
                                        out.push(SquareSource {
                                            color: c,
                                            role,
                                            from,
                                            xray,
                                            weight: if xray { p.chi * w } else { w },
                                        });
                                    }
                                },
                            );
                        }
                    }
                }
            }
        }
    }
    out
}

/// Propagate one ray (Eqs. (2), (5), (6)).
#[allow(clippy::too_many_arguments)]
#[inline]
fn trace_ray(
    board: &Board,
    p: &Params,
    c: Color,
    a: f32,
    from: Square,
    df: i32,
    dr: i32,
    mut emit: impl FnMut(Square, bool, f32),
) {
    let (mut file, mut rank) = (file_of(from), rank_of(from));
    let mut t = 1.0f32;
    let mut direct = true;
    let mut k = 1;
    loop {
        file += df;
        rank += dr;
        let Some(sq) = square_at(file, rank) else {
            break;
        };
        let w = a * attenuation(p, k);
        if direct {
            emit(sq, false, w);
        } else {
            if t < T_MIN {
                break;
            }
            emit(sq, true, w * t);
        }
        if let Some(blocker) = board.piece_at(sq)
            && !(blocker.color != c && blocker.role == Role::King)
        {
            direct = false;
            t *= transmission(p, blocker, c, df, dr);
        }
        k += 1;
    }
}

/// Propagate one ray into `Fields` (Eqs. (2), (5), (6)).
#[allow(clippy::too_many_arguments)]
fn walk_ray(
    f: &mut Fields,
    board: &Board,
    p: &Params,
    c: Color,
    a: f32,
    from: Square,
    df: i32,
    dr: i32,
) {
    let ci = idx(c);
    trace_ray(board, p, c, a, from, df, dr, |sq, xray, w| {
        if xray {
            f.xray[ci][sq.to_usize()] += w;
        } else {
            f.direct[ci][sq.to_usize()] += w;
        }
    });
}
