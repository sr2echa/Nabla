/** Plain-language readings of one square, from the pieces on the board. */

export type Side = "white" | "black";
type Role = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export type SquareSource = { role: Role; square: string; weight: number };
export type SquareExplain = {
  square: string;
  direct: Record<Side, SquareSource[]>;
  xray: Record<Side, SquareSource[]>;
};

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

function formatSources(sources: SquareExplain, side: Side): string[] {
  const direct = sources.direct[side]
    .filter((s) => s.weight > 0)
    .map((s) => `${s.role} on ${s.square}`);
  const xray = sources.xray[side]
    .filter((s) => s.weight > 0)
    .map((s) => `${s.role} on ${s.square} (X-ray)`);
  return [...direct, ...xray];
}

function list(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function explainControl(info: SquareExplain, value: number): string {
  const white = formatSources(info, "white");
  const black = formatSources(info, "black");
  const square = info.square;
  const holder = value >= 0 ? "White" : "Black";
  const own = value >= 0 ? white : black;
  const other = value >= 0 ? black : white;
  const otherName = value >= 0 ? "Black" : "White";
  const lead = own.length ? ` ${holder}'s ${list(own)} ${own.length === 1 ? "bears" : "bear"} on it.` : "";
  const also = other.length ? ` ${otherName}'s ${list(other)} also ${other.length === 1 ? "bears" : "bear"} on it.` : "";
  return `${holder} controls ${square}.${lead}${also}`;
}

export function explainTension(info: SquareExplain): string {
  const white = formatSources(info, "white");
  const black = formatSources(info, "black");
  const parts = [`Both sides bear on ${info.square}.`];
  if (white.length) parts.push(`White's ${list(white)}.`);
  if (black.length) parts.push(`Black's ${list(black)}.`);
  return parts.join(" ");
}

export function explainHang(fen: string, index: number, gain: number, info: SquareExplain): string {
  const piece = piecesOf(fen).find((item) => item.index === index);
  const square = info.square;
  if (!piece) return `Nabla's exchange sees ${gain.toFixed(1)} pawn${gain === 1 ? "" : "s"} on ${square}.`;
  const taker: Side = piece.side === "white" ? "black" : "white";
  const takers = info.direct[taker].map((s) => `${s.role} on ${s.square}`);
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
export function took(before: string, after: string, mover: Side): Array<Exclude<Role, "king">> {
  const victim: Side = mover === "white" ? "black" : "white";
  const from = tally(before);
  const to = tally(after);
  const taken: Array<Exclude<Role, "king">> = [];
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
