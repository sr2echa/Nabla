/** Plain-language readings of one square, from the pieces on the board. */

export type Side = "white" | "black";
type Role = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

type Piece = { side: Side; role: Role; index: number };

const ROLE_OF: Record<string, Role> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const VALUE: Record<Exclude<Role, "king">, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
const ORDER: Exclude<Role, "king">[] = ["pawn", "knight", "bishop", "rook", "queen"];

export function squareName(index: number): string {
  return "abcdefgh"[index % 8] + String(Math.floor(index / 8) + 1);
}

function piecesOf(fen: string): Piece[] {
  const pieces: Piece[] = [];
  let index = 56;
  for (const char of fen.split(" ")[0]) {
    if (char === "/") index -= 8;
    else if (char >= "1" && char <= "8") index += Number(char);
    else {
      const role = ROLE_OF[char.toLowerCase()];
      if (role) pieces.push({ side: char === char.toUpperCase() ? "white" : "black", role, index });
      index += 1;
    }
  }
  return pieces;
}

function occupied(pieces: Piece[]): boolean[] {
  const squares = Array.from({ length: 64 }, () => false);
  for (const piece of pieces) squares[piece.index] = true;
  return squares;
}

function ray(from: number, fileStep: number, rankStep: number, blocks: boolean[]): number[] {
  const hits: number[] = [];
  let file = from % 8;
  let rank = Math.floor(from / 8);
  for (;;) {
    file += fileStep;
    rank += rankStep;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) break;
    const index = rank * 8 + file;
    hits.push(index);
    if (blocks[index]) break;
  }
  return hits;
}

function attacks(piece: Piece, blocks: boolean[]): number[] {
  const file = piece.index % 8;
  const rank = Math.floor(piece.index / 8);
  if (piece.role === "pawn") {
    const next = piece.side === "white" ? rank + 1 : rank - 1;
    return [file - 1, file + 1].filter((f) => f >= 0 && f <= 7 && next >= 0 && next <= 7).map((f) => next * 8 + f);
  }
  if (piece.role === "knight") {
    const jumps = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
    return jumps
      .map(([df, dr]) => [file + df, rank + dr])
      .filter(([f, r]) => f >= 0 && f <= 7 && r >= 0 && r <= 7)
      .map(([f, r]) => r * 8 + f);
  }
  if (piece.role === "king") {
    const hits: number[] = [];
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const f = file + df;
        const r = rank + dr;
        if (f >= 0 && f <= 7 && r >= 0 && r <= 7) hits.push(r * 8 + f);
      }
    }
    return hits;
  }
  const dirs = piece.role === "bishop"
    ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    : piece.role === "rook"
      ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
      : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  return dirs.flatMap(([df, dr]) => ray(piece.index, df, dr, blocks));
}

function bearers(pieces: Piece[], index: number, side: Side): string[] {
  const blocks = occupied(pieces);
  return pieces
    .filter((piece) => piece.side === side && attacks(piece, blocks).includes(index))
    .map((piece) => `${piece.role} on ${squareName(piece.index)}`);
}

function list(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function explainControl(fen: string, index: number, value: number): string {
  const pieces = piecesOf(fen);
  const white = bearers(pieces, index, "white");
  const black = bearers(pieces, index, "black");
  const square = squareName(index);
  const holder = value >= 0 ? "White" : "Black";
  const own = value >= 0 ? white : black;
  const other = value >= 0 ? black : white;
  const otherName = value >= 0 ? "Black" : "White";
  const lead = own.length ? ` ${holder}'s ${list(own)} ${own.length === 1 ? "bears" : "bear"} on it.` : "";
  const also = other.length ? ` ${otherName}'s ${list(other)} also ${other.length === 1 ? "bears" : "bear"} on it.` : "";
  return `${holder} controls ${square}.${lead}${also}`;
}

export function explainTension(fen: string, index: number): string {
  const pieces = piecesOf(fen);
  const square = squareName(index);
  const white = bearers(pieces, index, "white");
  const black = bearers(pieces, index, "black");
  const parts = [`Both sides bear on ${square}.`];
  if (white.length) parts.push(`White's ${list(white)}.`);
  if (black.length) parts.push(`Black's ${list(black)}.`);
  return parts.join(" ");
}

export function explainHang(fen: string, index: number, gain: number): string {
  const pieces = piecesOf(fen);
  const piece = pieces.find((item) => item.index === index);
  const square = squareName(index);
  if (!piece) return `Nabla's exchange sees ${gain.toFixed(1)} pawn${gain === 1 ? "" : "s"} on ${square}.`;
  const taker = piece.side === "white" ? "black" : "white";
  const takers = bearers(pieces, index, taker);
  const who = taker === "white" ? "White" : "Black";
  const by = takers.length ? ` ${who}'s ${list(takers)} can take it.` : "";
  const pawns = gain === 1 ? "1 pawn" : `${gain.toFixed(1)} pawns`;
  return `${cap(piece.side)}'s ${piece.role} on ${square}.${by} Nabla's exchange sees ${who} winning ${pawns}.`;
}

export function explainArrow(san: string, primary: boolean, side: Side, both: boolean): string {
  const who = both ? `${cap(side)}'s Nabla` : "Nabla";
  return primary ? `${who} is about to play ${san}.` : `${who} also considered ${san}.`;
}

function tally(fen: string): Record<Side, Record<Exclude<Role, "king">, number>> {
  const have: Record<Side, Record<Exclude<Role, "king">, number>> = {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
  };
  for (const piece of piecesOf(fen)) {
    if (piece.role === "king") continue;
    have[piece.side][piece.role] += 1;
  }
  return have;
}

/** Pieces the mover took between two positions. A promotion is not a capture. */
export function took(before: string, after: string, mover: Side): Role[] {
  const victim: Side = mover === "white" ? "black" : "white";
  const from = tally(before);
  const to = tally(after);
  const taken: Role[] = [];
  for (const role of ORDER) {
    const lost = from[victim][role] - to[victim][role];
    for (let i = 0; i < lost; i++) taken.push(role);
  }
  return taken;
}

/** How many pawn-points White is ahead on this board. */
export function materialLead(fen: string): number {
  const have = tally(fen);
  let lead = 0;
  for (const role of ORDER) lead += (have.white[role] - have.black[role]) * VALUE[role];
  return lead;
}

/** The piece icon and the square that follows it, from a SAN. */
export function sanParts(san: string): { role: Role; rest: string } {
  const clean = san.replace(/[+#?!]/g, "");
  if (clean.startsWith("O-O-O")) return { role: "king", rest: "O-O-O" };
  if (clean.startsWith("O-O")) return { role: "king", rest: "O-O" };
  const letters: Record<string, Role> = { N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
  const role = letters[clean[0]] ?? "pawn";
  const body = role === "pawn" ? clean : clean.slice(1);
  const promoAt = body.indexOf("=");
  const core = promoAt >= 0 ? body.slice(0, promoAt) : body;
  const square = core.slice(-2);
  const promo = promoAt >= 0 ? body.slice(promoAt) : "";
  return { role, rest: `${square}${promo}` };
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
