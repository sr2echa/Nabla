import type { Key } from "chessground/types";

export type Terms = Record<string, number>;
export type Candidate = { uci: string; san: string; q: number; prob: number; terms: Terms | null };
export type HudView = { control: number[]; tension: number[]; threats: number[] };
export type HudArrow = { uci: string; san: string; prob: number; primary: boolean };

const layers = { control: true, tension: false, threats: true, moves: true };
const NS = "http://www.w3.org/2000/svg";

export function layerState(): typeof layers {
  return layers;
}

export function setLayer(name: keyof typeof layers, on: boolean): void {
  layers[name] = on;
}

/** Field washes sit under the pieces. The centre of each square stays clear. */
export function drawFields(
  canvas: HTMLCanvasElement,
  view: HudView | undefined,
  orientation: "white" | "black",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = canvas.width / devicePixelRatio / 8;
  const whiteField = cssColor("--field-white", "#2f6798");
  const blackField = cssColor("--field-black", "#b85a28");
  const ink = cssColor("--ink", "#1c1915");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  if (view) {
    for (let index = 0; index < 64; index++) {
      const { x, y } = squareOrigin(index, css, orientation);
      const cx = x + css / 2;
      const cy = y + css / 2;
      if (layers.control) {
        const value = Math.max(-1, Math.min(1, view.control[index] ?? 0));
        if (Math.abs(value) > 0.05) {
          const color = value >= 0 ? whiteField : blackField;
          const wash = ctx.createRadialGradient(cx, cy, css * 0.18, cx, cy, css * 0.5);
          wash.addColorStop(0, hexAlpha(color, 0));
          wash.addColorStop(0.55, hexAlpha(color, Math.abs(value) * 0.16));
          wash.addColorStop(1, hexAlpha(color, Math.abs(value) * 0.5));
          ctx.fillStyle = wash;
          ctx.fillRect(x, y, css, css);
        }
      }
      if (layers.tension && (view.tension[index] ?? 0) > 0.2) {
        const alpha = Math.min(0.8, (view.tension[index] ?? 0) / 3);
        ctx.strokeStyle = hexAlpha(ink, alpha);
        ctx.lineWidth = 1.6;
        const m = css * 0.1;
        const len = css * 0.16;
        corner(ctx, x + m, y + m, len, 1, 1);
        corner(ctx, x + css - m, y + m, len, -1, 1);
        corner(ctx, x + m, y + css - m, len, 1, -1);
        corner(ctx, x + css - m, y + css - m, len, -1, -1);
      }
    }
  }
  ctx.restore();
}

/** Arrows and hanging-piece badges sit above the pieces, clear of each piece's face. */
export function drawOverlay(
  svg: SVGSVGElement,
  view: HudView | undefined,
  arrows: HudArrow[],
  showArrows: boolean,
  orientation: "white" | "black",
): void {
  svg.replaceChildren();
  if (view && layers.threats) {
    for (let index = 0; index < 64; index++) {
      const gain = view.threats[index] ?? 0;
      if (gain <= 0) continue;
      const { x, y } = cell(index, orientation);
      const label = gain >= 10 ? String(Math.round(gain)) : gain.toFixed(1);
      const g = el("g");
      const disk = el("circle");
      disk.setAttribute("cx", String(x + 0.78));
      disk.setAttribute("cy", String(y + 0.22));
      disk.setAttribute("r", "0.16");
      disk.setAttribute("fill", "#8d2f2a");
      const text = el("text");
      text.setAttribute("x", String(x + 0.78));
      text.setAttribute("y", String(y + 0.22));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "#fffdf8");
      text.setAttribute("font-size", "0.16");
      text.setAttribute("font-family", "Geist Mono Variable, ui-monospace, monospace");
      text.textContent = label;
      g.append(disk, text);
      svg.append(g);
    }
  }
  if (!showArrows || !layers.moves) return;
  arrows.slice(0, 4).forEach((arrow, n) => {
    const from = centerOf(arrow.uci.slice(0, 2) as Key, orientation);
    const to = centerOf(arrow.uci.slice(2, 4) as Key, orientation);
    svg.append(arrowShape(from, to, arrow.primary, n === 0 ? arrow.san : ""));
  });
}

function arrowShape(
  from: { x: number; y: number },
  to: { x: number; y: number },
  primary: boolean,
  label: string,
): SVGGElement {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const gap = 0.36;
  const head = 0.22;
  const sx = from.x + ux * gap;
  const sy = from.y + uy * gap;
  const ex = to.x - ux * (gap + head * 0.15);
  const ey = to.y - uy * (gap + head * 0.15);
  const width = primary ? 0.085 : 0.05;
  const shaftEnd = { x: ex - ux * head, y: ey - uy * head };
  const g = el("g");
  g.setAttribute("opacity", primary ? "1" : "0.45");
  const halo = el("polygon");
  halo.setAttribute("points", poly(sx, sy, shaftEnd.x, shaftEnd.y, px, py, width + 0.045));
  halo.setAttribute("fill", "#fffdf8");
  const body = el("polygon");
  body.setAttribute("points", poly(sx, sy, shaftEnd.x, shaftEnd.y, px, py, width));
  body.setAttribute("fill", "#1f6b45");
  const tip = el("polygon");
  const hx = ex;
  const hy = ey;
  const bx = shaftEnd.x;
  const by = shaftEnd.y;
  tip.setAttribute(
    "points",
    [
      [hx, hy],
      [bx + px * head * 0.72, by + py * head * 0.72],
      [bx - px * head * 0.72, by - py * head * 0.72],
    ]
      .map((p) => p.join(","))
      .join(" "),
  );
  tip.setAttribute("fill", "#1f6b45");
  tip.setAttribute("stroke", "#fffdf8");
  tip.setAttribute("stroke-width", "0.03");
  tip.setAttribute("stroke-linejoin", "round");
  g.append(halo, body, tip);
  if (label) {
    const lx = shaftEnd.x + px * 0.28;
    const ly = shaftEnd.y + py * 0.28;
    const chip = el("g");
    const w = Math.max(0.55, label.length * 0.16);
    const rect = el("rect");
    rect.setAttribute("x", String(lx - w / 2));
    rect.setAttribute("y", String(ly - 0.14));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", "0.28");
    rect.setAttribute("rx", "0.14");
    rect.setAttribute("fill", "#fffdf8");
    rect.setAttribute("stroke", "#1f6b45");
    rect.setAttribute("stroke-width", "0.02");
    const text = el("text");
    text.setAttribute("x", String(lx));
    text.setAttribute("y", String(ly));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("fill", "#143d28");
    text.setAttribute("font-size", "0.16");
    text.setAttribute("font-family", "Geist Variable, sans-serif");
    text.setAttribute("font-style", "italic");
    text.textContent = label;
    chip.append(rect, text);
    g.append(chip);
  }
  return g;
}

function poly(x1: number, y1: number, x2: number, y2: number, px: number, py: number, w: number): string {
  return [
    [x1 + px * w, y1 + py * w],
    [x2 + px * w, y2 + py * w],
    [x2 - px * w, y2 - py * w],
    [x1 - px * w, y1 - py * w],
  ]
    .map((p) => p.join(","))
    .join(" ");
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
