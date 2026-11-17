import type { Key } from "chessground/types";

export type Terms = Record<string, number>;
export type Candidate = { uci: string; san: string; q: number; prob: number; terms: Terms | null };
export type HudView = { control: number[]; tension: number[]; threats: number[] };
export type HudArrow = { uci: string; san: string; prob: number; primary: boolean };

const layers = { control: false, tension: false, threats: true, moves: true };
const NS = "http://www.w3.org/2000/svg";

/** Fractions of one square. The board canvas and the legend use the same figures. */
const RIM = { gap: 0.07, outer: 0.046, radius: 0.06 };

export function layerState(): typeof layers {
  return layers;
}

export function setLayer(name: keyof typeof layers, on: boolean): void {
  layers[name] = on;
}

/** Squares and a single control rim sit under the pieces. */
export function drawFields(
  canvas: HTMLCanvasElement,
  view: HudView | undefined,
  orientation: "white" | "black",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = canvas.width / devicePixelRatio / 8;
  const light = cssColor("--sq-light", "#f7f4ee");
  const dark = cssColor("--sq-dark", "#d4cec3");
  const grout = cssColor("--grout", "#c2bbb0");
  const whiteField = cssColor("--field-white", "#3a5670");
  const blackField = cssColor("--field-black", "#5a5e52");
  const ink = cssColor("--ink", "#242220");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.lineJoin = "round";
  for (let index = 0; index < 64; index++) {
    const { x, y } = squareOrigin(index, css, orientation);
    const file = index % 8;
    const rank = Math.floor(index / 8);
    ctx.fillStyle = (file + rank) % 2 === 0 ? dark : light;
    ctx.fillRect(x, y, css + 0.5, css + 0.5);
  }
  ctx.strokeStyle = grout;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const at = Math.round(i * css) + 0.5;
    ctx.moveTo(at, 0);
    ctx.lineTo(at, css * 8);
    ctx.moveTo(0, at);
    ctx.lineTo(css * 8, at);
  }
  ctx.stroke();
  for (let index = 0; index < 64; index++) {
    const { x, y } = squareOrigin(index, css, orientation);
    if (!view) continue;
    if (layers.control) {
      const value = Math.max(-1, Math.min(1, view.control[index] ?? 0));
      const strength = Math.abs(value);
      if (strength > 0.28) {
        const color = value >= 0 ? whiteField : blackField;
        strokeRim(ctx, x, y, css, color, 0.55 + strength * 0.4, 0.03, 0.06);
      }
    }
    if (layers.tension && (view.tension[index] ?? 0) > 0.2) {
      const alpha = Math.min(0.85, 0.35 + (view.tension[index] ?? 0) / 4);
      ctx.strokeStyle = hexAlpha(ink, alpha);
      ctx.lineWidth = Math.max(1, css * 0.045);
      ctx.lineCap = "square";
      const m = css * 0.14;
      const len = css * 0.14;
      corner(ctx, x + m, y + m, len, 1, 1);
      corner(ctx, x + css - m, y + m, len, -1, 1);
      corner(ctx, x + m, y + css - m, len, 1, -1);
      corner(ctx, x + css - m, y + css - m, len, -1, -1);
    }
  }
  ctx.restore();
}

/** Arrows and hanging-piece marks sit above the pieces, clear of each piece's face. */
export function drawOverlay(
  svg: SVGSVGElement,
  view: HudView | undefined,
  arrows: HudArrow[],
  showArrows: boolean,
  orientation: "white" | "black",
  tone = "var(--field-white)",
): void {
  svg.replaceChildren();
  if (view && layers.threats) {
    for (let index = 0; index < 64; index++) {
      const gain = view.threats[index] ?? 0;
      if (gain <= 0 || gain >= 100) continue;
      const { x, y } = cell(index, orientation);
      const label = gain >= 10 ? String(Math.round(gain)) : gain.toFixed(1);
      svg.append(badge(x, y, label));
    }
  }
  if (!showArrows || !layers.moves) return;
  const ordered = arrows.slice(0, 4).sort((a, b) => Number(a.primary) - Number(b.primary));
  for (const arrow of ordered) {
    const from = centerOf(arrow.uci.slice(0, 2) as Key, orientation);
    const to = centerOf(arrow.uci.slice(2, 4) as Key, orientation);
    svg.append(isKnight(from, to) ? knightArrow(from, to, arrow.primary, tone) : arrowShape(from, to, arrow.primary, tone));
  }
}

/** The small board uses the same rims, ticks, badge, and arrow as the position. */
export function mountLegend(svg: SVGSVGElement | null): void {
  if (!svg) return;
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 6 6");
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const square = el("rect");
      square.setAttribute("x", String(col));
      square.setAttribute("y", String(row));
      square.setAttribute("width", "1");
      square.setAttribute("height", "1");
      square.setAttribute("fill", (col + row) % 2 === 0 ? "var(--sq-light)" : "var(--sq-dark)");
      svg.append(square);
    }
  }
  for (let i = 1; i < 6; i++) {
    svg.append(rule(0, i, 6, i));
    svg.append(rule(i, 0, i, 6));
  }

  const white = mark(
    1,
    3,
    "A blue rim. White controls that square more than Black. The same rim is drawn on the board.",
  );
  white.append(rim(1, 3, "var(--field-white)", 0.92, RIM.outer, RIM.gap));
  svg.append(white);

  const black = mark(4, 1, "An olive rim. Black controls that square more than White.");
  black.append(rim(4, 1, "var(--field-black)", 0.92, RIM.outer, RIM.gap));
  svg.append(black);

  const tension = mark(2, 2, "Corner ticks. Both sides bear on the square. Turn the layer on with Tension.");
  tension.append(tickPath(2, 2));
  svg.append(tension);

  const hanging = mark(3, 2, "The number is the pawns Nabla's exchange sees the opponent winning by taking that piece. The king is not marked.");
  hanging.append(badge(3, 2, "3.0"));
  svg.append(hanging);

  const move = mark(5, 1, "The arrow is the move Nabla is about to play. A paler arrow is another move that was considered.");
  const hit = move.querySelector("rect");
  if (hit) {
    hit.setAttribute("y", "1");
    hit.setAttribute("height", "4");
  }
  move.append(arrowShape({ x: 4.5, y: 3.5 }, { x: 4.5, y: 4.5 }, false));
  move.append(arrowShape({ x: 5.5, y: 4.5 }, { x: 5.5, y: 1.5 }, true));
  svg.append(move);
}

function mark(col: number, row: number, text: string): SVGGElement {
  const g = el("g");
  g.setAttribute("class", "lm");
  g.setAttribute("tabindex", "0");
  g.dataset.text = text;
  const hit = el("rect");
  hit.setAttribute("class", "hit");
  hit.setAttribute("x", String(col));
  hit.setAttribute("y", String(row));
  hit.setAttribute("width", "1");
  hit.setAttribute("height", "1");
  g.append(hit);
  return g;
}

function rim(col: number, row: number, color: string, alpha: number, width: number, gap: number): SVGRectElement {
  const pad = gap + width / 2;
  const rect = el("rect");
  rect.setAttribute("x", String(col + pad));
  rect.setAttribute("y", String(row + pad));
  rect.setAttribute("width", String(1 - pad * 2));
  rect.setAttribute("height", String(1 - pad * 2));
  rect.setAttribute("rx", String(RIM.radius));
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", color);
  rect.setAttribute("stroke-width", String(width));
  rect.setAttribute("opacity", String(alpha));
  return rect;
}

function rule(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = el("line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", "var(--grout)");
  line.setAttribute("stroke-width", "0.02");
  return line;
}

function tickPath(col: number, row: number): SVGPathElement {
  const x = col;
  const y = row;
  const inset = 0.14;
  const arm = 0.14;
  const marks: Array<[number, number, number, number]> = [
    [inset, inset, 1, 1],
    [1 - inset, inset, -1, 1],
    [inset, 1 - inset, 1, -1],
    [1 - inset, 1 - inset, -1, -1],
  ];
  const path = el("path");
  path.setAttribute(
    "d",
    marks.map(([cx, cy, sx, sy]) => `M${x + cx + sx * arm} ${y + cy}L${x + cx} ${y + cy}L${x + cx} ${y + cy + sy * arm}`).join(""),
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--ink)");
  path.setAttribute("stroke-width", "0.045");
  path.setAttribute("stroke-linecap", "square");
  path.setAttribute("stroke-linejoin", "miter");
  return path;
}

function badge(x: number, y: number, label: string): SVGGElement {
  const w = Math.max(0.4, 0.18 + label.length * 0.082);
  const h = 0.25;
  const bx = x + 1 - w - 0.06;
  const by = y + 0.06;
  const g = el("g");
  const rect = el("rect");
  rect.setAttribute("x", String(bx));
  rect.setAttribute("y", String(by));
  rect.setAttribute("width", String(w));
  rect.setAttribute("height", String(h));
  rect.setAttribute("rx", String(h / 2));
  rect.setAttribute("fill", "var(--bg)");
  rect.setAttribute("stroke", "var(--ink)");
  rect.setAttribute("stroke-width", "0.018");
  const text = el("text");
  text.setAttribute("x", String(bx + w / 2));
  text.setAttribute("y", String(by + h / 2));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.setAttribute("fill", "var(--ink)");
  text.setAttribute("font-size", "0.15");
  text.setAttribute("font-family", "Geist Mono Variable, ui-monospace, monospace");
  text.textContent = label;
  g.append(rect, text);
  return g;
}

function isKnight(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return (Math.abs(dx - 1) < 0.01 && Math.abs(dy - 2) < 0.01) || (Math.abs(dx - 2) < 0.01 && Math.abs(dy - 1) < 0.01);
}

function knightArrow(from: { x: number; y: number }, to: { x: number; y: number }, primary: boolean, tone = "var(--field-white)"): SVGGElement {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const shortX = Math.abs(dx) < Math.abs(dy) ? dx : 0;
  const shortY = Math.abs(dx) < Math.abs(dy) ? 0 : dy;
  const elbow = { x: from.x + shortX, y: from.y + shortY };
  const start = nudge(from, elbow, 0.28);
  const tip = nudge(to, elbow, 0.34);
  const neck = nudge(tip, elbow, 0.26);
  const vx = tip.x - neck.x;
  const vy = tip.y - neck.y;
  const vlen = Math.hypot(vx, vy) || 1;
  const px = -vy / vlen;
  const py = vx / vlen;
  const hw = primary ? 0.18 : 0.12;
  const g = el("g");
  g.setAttribute("opacity", primary ? "0.92" : "0.4");
  const path = el("path");
  path.setAttribute("d", `M${start.x.toFixed(3)} ${start.y.toFixed(3)} L${elbow.x.toFixed(3)} ${elbow.y.toFixed(3)} L${neck.x.toFixed(3)} ${neck.y.toFixed(3)}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", primary ? tone : "var(--ink)");
  path.setAttribute("stroke-width", primary ? "0.07" : "0.042");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  const head = el("polygon");
  head.setAttribute(
    "points",
    [[tip.x, tip.y], [neck.x + px * hw, neck.y + py * hw], [neck.x - px * hw, neck.y - py * hw]]
      .map((point) => point.map((n) => n.toFixed(3)).join(","))
      .join(" "),
  );
  head.setAttribute("fill", primary ? tone : "var(--ink)");
  g.append(path, head);
  return g;
}

function nudge(from: { x: number; y: number }, toward: { x: number; y: number }, gap: number): { x: number; y: number } {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * gap, y: from.y + (dy / len) * gap };
}

function arrowShape(from: { x: number; y: number }, to: { x: number; y: number }, primary: boolean, tone = "var(--field-white)"): SVGGElement {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const gap = Math.min(0.34, len * 0.18);
  const travel = Math.max(0.22, len - gap * 2);
  const head = Math.min(primary ? 0.36 : 0.28, travel * 0.55);
  const hw = primary ? 0.21 : 0.14;
  const sw = primary ? 0.072 : 0.042;
  const sx = from.x + ux * gap;
  const sy = from.y + uy * gap;
  const tipx = to.x - ux * gap;
  const tipy = to.y - uy * gap;
  const neckx = tipx - ux * head;
  const necky = tipy - uy * head;
  const tail = sw * 0.62;
  const g = el("g");
  g.setAttribute("opacity", primary ? "0.92" : "0.4");
  const shape = el("polygon");
  shape.setAttribute(
    "points",
    [
      [sx + px * tail, sy + py * tail],
      [neckx + px * sw, necky + py * sw],
      [neckx + px * hw, necky + py * hw],
      [tipx, tipy],
      [neckx - px * hw, necky - py * hw],
      [neckx - px * sw, necky - py * sw],
      [sx - px * tail, sy - py * tail],
    ]
      .map((p) => p.map((n) => n.toFixed(3)).join(","))
      .join(" "),
  );
  shape.setAttribute("fill", primary ? tone : "var(--ink)");
  shape.setAttribute("stroke", "var(--paper)");
  shape.setAttribute("stroke-width", primary ? "0.028" : "0.02");
  shape.setAttribute("stroke-linejoin", "round");
  g.append(shape);
  return g;
}

function strokeRim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number,
  widthFrac: number,
  gapFrac: number,
): void {
  const lw = Math.max(0.75, size * widthFrac);
  const gap = size * gapFrac;
  const left = x + gap + lw / 2;
  const top = y + gap + lw / 2;
  const inner = size - 2 * (gap + lw / 2);
  if (inner <= 2) return;
  ctx.beginPath();
  ctx.roundRect(left, top, inner, inner, Math.min(size * RIM.radius, inner / 3));
  ctx.strokeStyle = hexAlpha(color, alpha);
  ctx.lineWidth = lw;
  ctx.stroke();
}

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, name);
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexAlpha(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function corner(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, sx: number, sy: number): void {
  ctx.beginPath();
  ctx.moveTo(x + sx * len, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + sy * len);
  ctx.stroke();
}

function squareOrigin(index: number, css: number, orientation: "white" | "black"): { x: number; y: number } {
  const { x, y } = cell(index, orientation);
  return { x: x * css, y: y * css };
}

function cell(index: number, orientation: "white" | "black"): { x: number; y: number } {
  const file = index % 8;
  const rank = Math.floor(index / 8);
  return {
    x: orientation === "white" ? file : 7 - file,
    y: orientation === "white" ? 7 - rank : rank,
  };
}

function centerOf(name: Key, orientation: "white" | "black"): { x: number; y: number } {
  const file = name.charCodeAt(0) - 97;
  const rank = Number(name[1]) - 1;
  const index = file + rank * 8;
  const { x, y } = cell(index, orientation);
  return { x: x + 0.5, y: y + 0.5 };
}
