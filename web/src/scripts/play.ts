import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import katex from "katex";
import { drawFields, drawOverlay, setLayer, type Candidate, type HudArrow } from "./hud";
import type { Fish } from "./stockfish";

type Move = { uci: string; san: string; from: Key; to: Key };
type Terms = Record<string, number>;
type View = {
  turn: "white" | "black";
  state: "play" | "check" | "checkmate" | "draw";
  detail: string;
  energy: Terms;
  control: number[];
  tension: number[];
  threats: number[];
};
type Analysis = { best: string | null; level: number; nodes: number; candidates: Candidate[] };
type Mode = "you" | "mirror" | "fish";
type Lab = {
  fen(): string;
  moves(): string;
  view(): string;
  analyze(): string;
  push(uci: string): void;
  reset(): void;
  set_level(level: number): void;
  set_temperature(pawns: number): void;
};

const TERMS: { key: string; label: string }[] = [
  { key: "mat", label: "Material" },
  { key: "flux", label: "Mobility" },
  { key: "terr", label: "Territory" },
  { key: "ex", label: "Exchange" },
  { key: "king", label: "King" },
  { key: "trop", label: "Tropism" },
  { key: "pawn", label: "Pawns" },
  { key: "conf", label: "Confinement" },
  { key: "tempo", label: "Tempo" },
];

let lab: Lab;
let ground: Api;
let fish: Fish | undefined;
let mode: Mode = "you";
let seat: "white" | "black" = "white";
let orientation: "white" | "black" = "white";
let lastMove: [Key, Key] | undefined;
let candidates: Candidate[] = [];
let arrows: HudArrow[] = [];
let arrowsOn = false;
let view: View | undefined;
let pending: Move[] = [];
let epoch = 0;
let flight = 0;
let paused = false;
let judgeId: "nabla" | "stockfish" | "maia" = "nabla";
let judgeToken = 0;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function start(): Promise<void> {
  const board = document.querySelector<HTMLElement>("#board");
  const status = document.querySelector<HTMLElement>("#status");
  if (!board || !status) return;
  try {
    const wasm = await import("../engine/nabla_wasm.js");
    await wasm.default();
    lab = new wasm.Lab();
  } catch {
    status.textContent = "The engine build is missing. From the repo root run: npm run engine --prefix web";
    return;
  }

  ground = Chessground(board, {
    fen: lab.fen(),
    coordinates: false,
    animation: { duration: reduceMotion ? 0 : 180 },
    trustAllEvents: true,
    movable: { free: false, events: { after: onDrop } },
    premovable: { enabled: false },
    drawable: { enabled: false },
  });
  bind();
  renderMath();
  resize();
  window.addEventListener("resize", resize);
  refresh();
  void turn();
}

function bind(): void {
  document.querySelector("#new-game")?.addEventListener("click", () => begin());
  document.querySelector("#flip")?.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    refresh();
  });
  document.querySelector("#pause")?.addEventListener("click", () => {
    paused = !paused;
    const button = document.querySelector("#pause");
    if (button) button.textContent = paused ? "Resume" : "Pause";
    if (!paused) void turn();
  });
  document.querySelectorAll<HTMLInputElement>("input[name='mode']").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      mode = input.value as Mode;
      showMode();
      begin();
    });
  });
  document.querySelector<HTMLSelectElement>("#side")?.addEventListener("change", (event) => {
    seat = (event.target as HTMLSelectElement).value as "white" | "black";
    orientation = seat;
    begin();
  });
  const temp = document.querySelector<HTMLInputElement>("#temp");
  const tempOut = document.querySelector("#temp-out");
  temp?.addEventListener("input", () => {
    const pawns = Number(temp.value) / 100;
    if (tempOut) tempOut.textContent = pawns.toFixed(2);
    lab.set_temperature(pawns);
  });
  const pace = document.querySelector<HTMLInputElement>("#pace");
  const paceOut = document.querySelector("#pace-out");
  pace?.addEventListener("input", () => {
    if (paceOut) paceOut.textContent = `${pace.value} ms`;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-judge]").forEach((button) => {
    button.addEventListener("click", () => {
      judgeId = button.dataset.judge as "nabla" | "stockfish" | "maia";
      document.querySelectorAll<HTMLButtonElement>("[data-judge]").forEach((other) => {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      judgeToken += 1;
      updateJudge();
    });
  });
  const legend = document.querySelector("#legend-board");
  const caption = document.querySelector("#legend-caption");
  legend?.querySelectorAll<SVGGElement>(".lm").forEach((mark) => {
    const show = () => {
      legend.querySelectorAll(".lm").forEach((other) => other.classList.toggle("dim", other !== mark));
      if (caption) caption.textContent = mark.dataset.text ?? "";
    };
    mark.addEventListener("pointerenter", show);
    mark.addEventListener("focus", show);
  });
  legend?.addEventListener("pointerleave", () => {
    legend.querySelectorAll(".lm").forEach((mark) => mark.classList.remove("dim"));
    if (caption) caption.textContent = "Hover a mark.";
  });
  document.querySelectorAll<HTMLInputElement>("[data-layer]").forEach((box) => {
    box.addEventListener("change", () => {
      const name = box.dataset.layer as "control" | "tension" | "threats" | "moves";
      setLayer(name, box.checked);
      paint();
    });
  });
}

function showMode(): void {
  const pair = document.querySelector<HTMLElement>("#level-pair");
  const one = document.querySelector<HTMLElement>("#level-one");
  const fishOpts = document.querySelector<HTMLElement>("#fish-opts");
  const side = document.querySelector<HTMLElement>("#side-field");
  const sideLabel = document.querySelector("#side-label");
  if (pair) pair.hidden = mode !== "mirror";
  if (one) one.hidden = mode === "mirror";
  if (fishOpts) fishOpts.hidden = mode !== "fish";
  if (side) side.hidden = mode === "mirror";
  if (sideLabel) sideLabel.textContent = mode === "fish" ? "Nabla plays" : "You play";
}

function begin(): void {
  epoch += 1;
  flight = 0;
  paused = false;
  arrowsOn = false;
  void fish?.newGame();
  arrows = [];
  candidates = [];
  const pause = document.querySelector("#pause");
  if (pause) pause.textContent = "Pause";
  lab.reset();
  lastMove = undefined;
  const promo = document.querySelector<HTMLElement>("#promo");
  if (promo) promo.hidden = true;
  const reason = document.querySelector("#reason");
  if (reason) reason.innerHTML = "<p class='empty'>No move to explain yet.</p>";
  refresh();
  void turn();
}

function onDrop(from: Key, to: Key): void {
  if (actor() !== "human") {
    refresh();
    return;
  }
  const moves = JSON.parse(lab.moves()) as Move[];
  const choices = moves.filter((move) => move.from === from && move.to === to);
  if (choices.length === 0) {
    refresh();
    return;
  }
  if (choices.length === 1) {
    play(choices[0].uci);
    return;
  }
  pending = choices;
  const promo = document.querySelector<HTMLElement>("#promo");
  if (!promo) return;
  promo.hidden = false;
  promo.replaceChildren();
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.uci.slice(4).toUpperCase();
    button.addEventListener("click", () => {
      promo.hidden = true;
      play(choice.uci);
    });
    promo.append(button);
  }
}

function play(uci: string): void {
  flight = 0;
  lab.push(uci);
  lastMove = [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
  arrowsOn = false;
  arrows = [];
  candidates = [];
  refresh();
  void turn();
}

function actor(): "human" | "nabla" | "fish" | "none" {
  if (!view || view.state === "checkmate" || view.state === "draw" || paused) return "none";
  if (mode === "mirror") return "nabla";
  if (mode === "you") return view.turn === seat ? "human" : "nabla";
  return view.turn === seat ? "nabla" : "fish";
}

function turn(): void {
  if (flight !== 0) return;
  const who = actor();
  if (who !== "nabla" && who !== "fish") return;
  flight = epoch;
  const mine = epoch;
  if (who === "nabla") window.setTimeout(() => void nablaTurn(mine), reduceMotion ? 0 : 40);
  else void fishTurn(mine);
}

async function nablaTurn(mine: number): Promise<void> {
  if (mine !== epoch || actor() !== "nabla") {
    if (mine === epoch) flight = 0;
    return;
  }
  lab.set_level(nablaLevel());
  const analysis = JSON.parse(lab.analyze()) as Analysis;
  if (mine !== epoch) return;
  candidates = analysis.candidates;
  arrows = analysis.candidates.slice(0, 4).map((candidate) => ({
    uci: candidate.uci,
    san: candidate.san,
    prob: candidate.prob,
    primary: candidate.uci === analysis.best,
  }));
  arrowsOn = true;
  drawReason(analysis);
  drawCandidates();
  paint();
  window.setTimeout(() => {
    if (mine !== epoch) return;
    if (actor() !== "nabla") {
      flight = 0;
      return;
    }
    arrowsOn = false;
    if (analysis.best) play(analysis.best);
    else {
      flight = 0;
      refresh();
    }
  }, pace());
}

async function fishTurn(mine: number): Promise<void> {
  setStatus("Stockfish lite is thinking.");
  try {
    if (!fish) {
      if (mine !== epoch) return;
      fish = await ensureFish();
      await fish.newGame();
    }
    if (mine !== epoch || actor() !== "fish") {
      if (mine === epoch) flight = 0;
      return;
    }
    const fen = lab.fen();
    const elo = fishElo();
    const ms = fishMs();
    const score = await fish.move(fen, elo, ms);
    if (mine !== epoch || actor() !== "fish" || !score.uci) {
      if (mine === epoch) flight = 0;
      return;
    }
    const moves = JSON.parse(lab.moves()) as Move[];
    const san = moves.find((move) => move.uci === score.uci)?.san ?? score.uci;
    arrows = [{ uci: score.uci, san, prob: 1, primary: true }];
    arrowsOn = true;
    drawFish(san, score.cp, score.mate, ms);
    paint();
    window.setTimeout(() => {
      if (mine !== epoch) return;
      if (actor() !== "fish") {
        flight = 0;
        return;
      }
      arrowsOn = false;
      play(score.uci);
    }, pace());
  } catch (error) {
    if (mine === epoch) flight = 0;
    const message = error instanceof Error ? error.message : "Stockfish lite failed.";
    setStatus(message);
  }
}

function nablaLevel(): number {
  if (mode === "mirror") {
    const id = view?.turn === "black" ? "#level-b" : "#level-w";
    return Number(document.querySelector<HTMLSelectElement>(id)?.value ?? 2);
  }
  return Number(document.querySelector<HTMLSelectElement>("#level")?.value ?? 2);
}

function fishElo(): number | "full" {
  const value = document.querySelector<HTMLSelectElement>("#fish-elo")?.value ?? "1320";
  return value === "full" ? "full" : Number(value);
}

function fishMs(): number {
  return Number(document.querySelector<HTMLSelectElement>("#fish-ms")?.value ?? 200);
}

function refresh(): void {
  view = JSON.parse(lab.view()) as View;
  if (!view.detail) view.detail = view.state;
  const moves = JSON.parse(lab.moves()) as Move[];
  const dests = new Map<Key, Key[]>();
  if (actor() === "human") {
    for (const move of moves) {
      const list = dests.get(move.from) ?? [];
      list.push(move.to);
      dests.set(move.from, list);
    }
  }
  ground.set({
    fen: lab.fen(),
    orientation,
    lastMove,
    turnColor: view.turn,
    check: view.state === "check" || view.state === "checkmate",
    movable: { color: actor() === "human" ? seat : undefined, dests, free: false },
  });
  setStatus(statusLine());
  drawCallout();
  drawEnergy(view.energy);
  drawCandidates();
  updateJudge();
  resize();
}

function statusLine(): string {
  if (!view) return "Loading the engine.";
  const color = cap(view.turn);
  if (view.detail === "checkmate") return `${color} is checkmated.`;
  if (view.detail === "stalemate") return `Stalemate. ${color} has no legal move.`;
  if (view.detail === "material") return "Draw. Not enough material to mate.";
  if (view.detail === "fifty") return "Draw. Fifty moves without a pawn move or a capture.";
  if (view.detail === "repetition") return "Draw. This position has occurred three times.";
  if (view.detail === "check") return `${color} is in check.`;
  return `${color} to move.`;
}

function drawCallout(): void {
  const host = document.querySelector<HTMLElement>("#callout");
  if (!host || !view) return;
  if (view.detail === "play") {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.className = view.state === "check" ? "callout chip" : "callout card";
  host.replaceChildren();
  const title = document.createElement("p");
  title.className = "callout-title";
  const body = document.createElement("p");
  body.className = "callout-body";
  const line = statusLine();
  const split = line.indexOf(". ");
  if (view.state === "check" || split < 0) {
    title.textContent = line;
    body.hidden = true;
  } else {
    title.textContent = line.slice(0, split);
    body.textContent = line.slice(split + 2);
  }
  host.append(title, body);
  if (view.state === "checkmate" || view.state === "draw") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "New game";
    button.addEventListener("click", () => begin());
    host.append(button);
  }
}

function setStatus(text: string): void {
  const status = document.querySelector("#status");
  if (status) status.textContent = text;
}

function drawEnergy(energy: Terms): void {
  const host = document.querySelector("#energy");
  if (!host) return;
  host.replaceChildren();
  const max = Math.max(0.2, ...TERMS.map((term) => Math.abs(energy[term.key] ?? 0)));
  for (const term of TERMS) {
    const value = energy[term.key] ?? 0;
    const row = document.createElement("div");
    row.className = "bar";
    const fill = document.createElement("i");
    fill.dataset.sign = value < 0 ? "neg" : "pos";
    fill.style.width = `${(Math.abs(value) / max) * 50}%`;
    const name = document.createElement("span");
    name.textContent = term.label;
    const track = document.createElement("span");
    track.className = "track";
    track.append(fill);
    const number = document.createElement("b");
    number.textContent = value.toFixed(2);
    row.append(name, track, number);
    host.append(row);
  }
  const total = document.createElement("p");
  total.className = "total";
  total.textContent = `Total ${energy.total.toFixed(2)}`;
  host.append(total);
}

function drawReason(analysis: Analysis): void {
  const host = document.querySelector("#reason");
  if (!host) return;
  const chosen = analysis.candidates.find((candidate) => candidate.uci === analysis.best);
  host.replaceChildren();
  if (!chosen?.terms) {
    host.innerHTML = "<p class='empty'>The line ended in mate or a draw, so there is no energy to split.</p>";
    return;
  }
  const title = document.createElement("p");
  title.className = "total";
  title.textContent = `${chosen.san}  score ${signed(chosen.q)}`;
  host.append(title);
  const max = Math.max(0.05, ...TERMS.map((term) => Math.abs(chosen.terms?.[term.key] ?? 0)));
  for (const term of TERMS) {
    const value = chosen.terms[term.key] ?? 0;
    const row = document.createElement("div");
    row.className = "bar";
    const fill = document.createElement("i");
    fill.dataset.sign = value < 0 ? "neg" : "pos";
    fill.style.width = `${(Math.abs(value) / max) * 50}%`;
    const name = document.createElement("span");
    name.textContent = term.label;
    const track = document.createElement("span");
    track.className = "track";
    track.append(fill);
    const number = document.createElement("b");
    number.textContent = signed(value);
    row.append(name, track, number);
    host.append(row);
  }
}

function drawFish(san: string, cp: number | null, mate: number | null, ms: number): void {
  const host = document.querySelector("#reason");
  const list = document.querySelector("#candidates");
  if (list) list.replaceChildren();
  if (!host) return;
  host.replaceChildren();
  const title = document.createElement("p");
  title.className = "total";
  title.textContent = `Stockfish played ${san}`;
  const note = document.createElement("p");
  note.className = "note";
  if (mate !== null) note.textContent = `After ${ms} ms it sees mate in ${Math.abs(mate)}, from its own side. This is Stockfish's score, not Nabla's energy.`;
  else if (cp !== null) note.textContent = `After ${ms} ms its score is ${signed(cp / 100)} pawns, from its own side. This is Stockfish's score, not Nabla's energy.`;
  else note.textContent = "Stockfish does not split this move into Nabla's energy terms. The board still shows Nabla's reading of the position.";
  host.append(title, note);
}

function drawCandidates(): void {
  const list = document.querySelector("#candidates");
  if (!list) return;
  list.replaceChildren();
  for (const candidate of candidates.slice(0, 6)) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = candidate.san;
    const score = document.createElement("b");
    score.textContent = signed(candidate.q);
    const chance = document.createElement("b");
    chance.textContent = `${(candidate.prob * 100).toFixed(0)}%`;
    item.append(name, score, chance);
    list.append(item);
  }
}

function pace(): number {
  if (reduceMotion) return 0;
  return Number(document.querySelector<HTMLInputElement>("#pace")?.value ?? 500);
}

function resize(): void {
  paint();
}

function paint(): void {
  const board = document.querySelector("#board");
  const cg = board?.querySelector("cg-board");
  const canvas = document.querySelector<HTMLCanvasElement>("#fields");
  const svg = document.querySelector<SVGSVGElement>("#arrows");
  if (canvas && cg) {
    if (canvas.parentElement !== cg) cg.prepend(canvas);
    const width = cg.clientWidth;
    const height = cg.clientHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    drawFields(canvas, view, orientation);
  }
  if (svg) drawOverlay(svg, view, arrows, arrowsOn, orientation);
  paintRails();
}

function paintRails(): void {
  const ranks = orientation === "white" ? "87654321" : "12345678";
  const files = orientation === "white" ? "abcdefgh" : "hgfedcba";
  const rankHost = document.querySelector("#rank-rail");
  const fileHost = document.querySelector("#file-rail");
  if (rankHost) rankHost.replaceChildren(...[...ranks].map((glyph) => railCell(glyph)));
  if (fileHost) fileHost.replaceChildren(...[...files].map((glyph) => railCell(glyph)));
}

function railCell(glyph: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = glyph;
  return span;
}

async function ensureFish(): Promise<Fish> {
  if (!fish) {
    const mod = await import("./stockfish");
    fish = await mod.openFish();
  }
  return fish;
}

function updateJudge(): void {
  const read = document.querySelector("#judge-read");
  if (!read || !view) return;
  if (view.state === "checkmate") {
    const whiteWins = view.turn === "black";
    setMeter(whiteWins ? 1 : 0);
    read.textContent = whiteWins ? "Black is checkmated. White wins." : "White is checkmated. Black wins.";
    return;
  }
  if (view.state === "draw") {
    setMeter(0.5);
    read.textContent = "The game is a draw.";
    return;
  }
  if (judgeId === "maia") {
    setMeter(0.5);
    read.textContent = "Maia is not loaded in this page. The gauntlet scores it through lc0, at one node.";
    return;
  }
  if (judgeId === "nabla") {
    const energy = view.energy.total ?? 0;
    setMeter(1 / (1 + Math.exp(-0.4 * energy)));
    read.textContent = `Energy ${signed(energy)}. The bar is a logistic of that energy, scale 0.4. It is not a measured win rate.`;
    return;
  }
  const token = ++judgeToken;
  const fen = lab.fen();
  const whiteToMove = view.turn === "white";
  read.textContent = "Stockfish lite is reading the position.";
  void ensureFish()
    .then((engine) => engine.read(fen))
    .then((result) => {
      if (token !== judgeToken) return;
      let share = 0.5;
      if (result.wdl) {
        const [win, draw, loss] = whiteToMove ? result.wdl : [result.wdl[2], result.wdl[1], result.wdl[0]];
        share = (win + 0.5 * draw) / 1000;
      } else if (result.mate !== null) {
        const moverWins = result.mate > 0;
        share = whiteToMove ? (moverWins ? 0.98 : 0.02) : moverWins ? 0.02 : 0.98;
      } else if (result.cp !== null) {
        const whiteCp = whiteToMove ? result.cp : -result.cp;
        share = 1 / (1 + Math.exp(-whiteCp / 180));
      }
      setMeter(share);
      const score = result.mate !== null ? `mate ${result.mate}` : result.cp !== null ? `${signed(result.cp / 100)} pawns` : "no score";
      read.textContent = `Stockfish lite, depth ${result.depth}, from the side to move: ${score}.`;
    })
    .catch((error: unknown) => {
      if (token === judgeToken) read.textContent = error instanceof Error ? error.message : "Stockfish lite did not answer.";
    });
}

function setMeter(share: number): void {
  const meter = document.querySelector<HTMLElement>("#meter");
  if (!meter) return;
  meter.style.setProperty("--share", String(Math.min(1, Math.max(0, share))));
}

const TEX = [
  "E(S)=E_{\\mathrm{mat}}+E_{\\mathrm{flux}}+E_{\\mathrm{terr}}+E_{\\mathrm{ex}}+E_{\\mathrm{king}}+E_{\\mathrm{trop}}+E_{\\mathrm{pawn}}+E_{\\mathrm{conf}}+E_{\\mathrm{tempo}}",
  "\\varphi=\\min\\left(1,\\frac{N_{N}+N_{B}+2N_{R}+4N_{Q}}{24}\\right)",
  "E(\\mathcal{F}S)=-E(S)",
];

function renderMath(): void {
  document.querySelectorAll<HTMLElement>(".math").forEach((node, index) => {
    katex.render(TEX[index] ?? "", node, { throwOnError: false, displayMode: true });
  });
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
