//! Adapter over `shakmaty`: colour-relative coordinates, bitboard helpers, and
//! position transforms. Every other module reaches the board library through
//! this file (decision D-005).

use shakmaty::{
    Bitboard, CastlingMode, Chess, Color, EnPassantMode, File, Piece, Position, Rank, Role, Square,
    zobrist::Zobrist64,
};

/// Piece types in the fixed order used for all iteration.
pub const ROLES: [Role; 6] = [
    Role::Pawn,
    Role::Knight,
    Role::Bishop,
    Role::Rook,
    Role::Queen,
    Role::King,
];

/// Non-pawn, non-king roles in iteration order.
pub const PIECES: [Role; 4] = [Role::Knight, Role::Bishop, Role::Rook, Role::Queen];

/// Both colours, White first.
pub const COLORS: [Color; 2] = [Color::White, Color::Black];

pub const FILE_A: u64 = 0x0101_0101_0101_0101;
pub const FILE_H: u64 = 0x8080_8080_8080_8080;

/// Array index of a colour: White = 0, Black = 1.
#[inline]
pub fn idx(c: Color) -> usize {
    if c.is_white() { 0 } else { 1 }
}

/// Colour sign $s_c$.
#[inline]
pub fn sign(c: Color) -> f32 {
    if c.is_white() { 1.0 } else { -1.0 }
}

/// Forward rank direction $\delta_c$.
#[inline]
pub fn forward(c: Color) -> i32 {
    if c.is_white() { 1 } else { -1 }
}

/// A square seen from colour `c`: identity for White, rank mirror for Black.
#[inline]
pub fn rel(c: Color, sq: Square) -> Square {
    if c.is_white() { sq } else { sq.flip_vertical() }
}

/// A bitboard seen from colour `c`.
#[inline]
pub fn rel_bb(c: Color, bb: Bitboard) -> Bitboard {
    if c.is_white() { bb } else { bb.flip_vertical() }
}

/// Squares of `bb`, visited in `c`-relative LERF order.
///
/// Iterating both colours this way makes every per-side accumulation an exact
/// mirror image of the other, which is what makes colour antisymmetry hold
/// bit-for-bit (02 §6).
pub fn rel_squares(c: Color, bb: Bitboard) -> impl Iterator<Item = Square> {
    rel_bb(c, bb).into_iter().map(move |s| rel(c, s))
}

#[inline]
pub fn file_of(sq: Square) -> i32 {
    sq.file().to_u32() as i32
}

#[inline]
pub fn rank_of(sq: Square) -> i32 {
    sq.rank().to_u32() as i32
}

/// The square at (file, rank), or `None` off the board.
#[inline]
pub fn square_at(file: i32, rank: i32) -> Option<Square> {
    ((0..8).contains(&file) && (0..8).contains(&rank))
        .then(|| Square::from_coords(File::new(file as u32), Rank::new(rank as u32)))
}

/// Centre distance $d_c(i) \in \lbrace 0,1,2,3 \rbrace$ (notation §2).
#[inline]
pub fn centre_distance(sq: Square) -> i32 {
    let f = (2 * file_of(sq) - 7).abs();
    let r = (2 * rank_of(sq) - 7).abs();
    (f.max(r) - 1) / 2
}

/// Manhattan distance $d_1$.
#[inline]
pub fn manhattan(a: Square, b: Square) -> i32 {
    (file_of(a) - file_of(b)).abs() + (rank_of(a) - rank_of(b)).abs()
}

/// Union of king steps from every square of `b`, including `b` itself.
#[inline]
pub fn king_dilate(b: u64) -> u64 {
    let row = b | ((b >> 1) & !FILE_H) | ((b << 1) & !FILE_A);
    row | (row << 8) | (row >> 8)
}

/// Game phase $\varphi \in [0, 1]$ (02 Eq. (12)): 1 with full middlegame
/// material, 0 with kings and pawns only.
pub fn phase(board: &shakmaty::Board) -> f32 {
    let n = |role| board.by_role(role).count() as f32;
    let raw = n(Role::Knight) + n(Role::Bishop) + 2.0 * n(Role::Rook) + 4.0 * n(Role::Queen);
    (raw / 24.0).min(1.0)
}

/// Bitboard of one piece type of one colour.
#[inline]
pub fn pieces(board: &shakmaty::Board, c: Color, role: Role) -> Bitboard {
    board.by_piece(Piece { color: c, role })
}

/// Zobrist key used for repetition detection and policy seeding.
#[inline]
pub fn hash(pos: &Chess) -> u64 {
    pos.zobrist_hash::<Zobrist64>(EnPassantMode::Legal).0
}

/// Colour flip $\mathcal{F}$: mirror ranks, swap colours and side to move.
pub fn flip_colors(pos: &Chess) -> Chess {
    pos.to_setup(EnPassantMode::Legal)
        .into_mirrored()
        .position(CastlingMode::Standard)
        .expect("the colour flip of a legal position is legal")
}

/// Plies played since the start of the game, from the move counters.
pub fn game_ply(pos: &Chess) -> u32 {
    (pos.fullmoves().get() - 1) * 2 + u32::from(pos.turn().is_black())
}
