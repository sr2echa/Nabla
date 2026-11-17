import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import { explainArrow, explainControl, explainHang, explainTension, materialLead, sanParts, took } from "./explain";
import { drawFields, drawOverlay, layerState, mountLegend, setLayer, type Candidate, type HudArrow } from "./hud";
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
type Who = "human" | "nabla" | "stockfish" | "maia";
type Lab = {
  fen(): string;
  moves(): string;
  view(): string;
  analyze(): string;
  push(uci: string): void;
  load(fen: string): void;
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
const players: Record<"white" | "black", Who> = { white: "human", black: "nabla" };
let sheetSide: "white" | "black" | null = null;
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
let sheetOpen = false;
let candidateSide: "white" | "black" = "black";
let judgeToken = 0;
type Step = { uci: string; san: string; side: "white" | "black"; fen: string };
const steps: Step[] = [];
let cursor = 0;
let startFen = "";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function start(): Promise<void> {
  const board = document.querySelector<HTMLElement>("#board");
  const status = document.querySelector<HTMLElement>("#status");
  if (!board || !status) return;
  try {
    const wasm = await import("../engine/nabla_wasm.js");
    await wasm.default();
    lab = new wasm.Lab();
    startFen = lab.fen();
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
    if (button) button.setAttribute("aria-pressed", paused ? "true" : "false");
    const tip = document.querySelector<HTMLElement>("#mark-tip");
    if (tip) tip.hidden = true;
    if (!paused) void turn();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-seat]").forEach((button) => {
    button.addEventListener("click", () => openSheet(button.dataset.seat as "white" | "black"));
  });
  document.querySelector("#sheet-close")?.addEventListener("click", closePanels);
  document.querySelector("#help-open")?.addEventListener("click", () => openPanel("help"));
  document.querySelector("#help-close")?.addEventListener("click", closePanels);
  document.querySelector("#scrim")?.addEventListener("click", closePanels);
  const board = document.querySelector<HTMLElement>(".board");
  board?.addEventListener("pointermove", (event) => showMark(event));
  board?.addEventListener("pointerleave", () => {
    const tip = document.querySelector<HTMLElement>("#mark-tip");
    if (tip) tip.hidden = true;
  });
  document.querySelectorAll<HTMLButtonElement>(".choices button").forEach((button) => {
    button.addEventListener("click", () => {
      button.parentElement?.querySelectorAll("button").forEach((other) => {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!sheetSide) return;
      players[sheetSide] = button.dataset.pick as Who;
      paintSheet();
      paintSeats();
    });
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanels();
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
  document.querySelectorAll<HTMLInputElement>("input[type='range']").forEach((input) => {
    const sync = () => {
      const span = Number(input.max) - Number(input.min) || 1;
      input.style.setProperty("--p", `${((Number(input.value) - Number(input.min)) / span) * 100}%`);
    };
    sync();
    input.addEventListener("input", sync);
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
  mountLegend(document.querySelector("#legend-board"));
  const legend = document.querySelector("#legend-board");
  const caption = document.querySelector("#legend-caption");
  const clearLegend = () => {
    legend?.querySelectorAll(".lm").forEach((mark) => mark.classList.remove("dim"));
    if (caption) caption.textContent = "Hover a mark.";
  };
  legend?.querySelectorAll<SVGGElement>(".lm").forEach((mark) => {
    const show = () => {
      legend.querySelectorAll(".lm").forEach((other) => other.classList.toggle("dim", other !== mark));
      if (caption) caption.textContent = mark.dataset.text ?? "";
    };
    mark.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") show();
    });
    mark.addEventListener("focus", show);
    mark.addEventListener("click", show);
  });
  legend?.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    clearLegend();
  });
  document.querySelectorAll<HTMLButtonElement>(".layers button").forEach((button) => {
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", on ? "true" : "false");
      const name = button.dataset.layer as "control" | "tension" | "threats" | "moves";
      setLayer(name, on);
      paint();
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab ?? "read"));
  });
  document.querySelector("#prev")?.addEventListener("click", () => recall(cursor - 1));
  document.querySelector("#redo")?.addEventListener("click", () => recall(cursor + 1));
  document.querySelector("#undo")?.addEventListener("click", () => undo());
  document.querySelector("#to-start")?.addEventListener("click", () => recall(0));
  document.querySelector("#to-end")?.addEventListener("click", () => recall(steps.length));
  document.querySelector("#swap")?.addEventListener("click", () => swapSeats());
  document.querySelector("#pgn")?.addEventListener("click", () => void copyPgn());
  const fishEloInput = document.querySelector<HTMLInputElement>("#fish-elo");
  const fishEloOut = document.querySelector("#fish-elo-out");
  if (fishEloInput) magnet(fishEloInput, [1320, 1600, 1800, 2000, 2200, 2500, 2800, 3190], fishEloOut);
  for (const id of ["maia-self", "maia-oppo"]) {
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    const out = document.querySelector(`#${id}-out`);
    if (input) magnet(input, [800, 1100, 1300, 1500, 1700, 1900, 2200, 2500], out);
  }
}

const WHO: Record<Who, { name: string; approach: string }> = {
  human: { name: "You", approach: "At this keyboard" },
  nabla: { name: "Nabla", approach: "Energy descent" },
  stockfish: { name: "Stockfish", approach: "Alpha-beta, lite" },
  maia: { name: "Maia", approach: "Human move, Maia-3" },
};

function openPanel(id: "sheet" | "help"): void {
  closePanels();
  const scrim = document.querySelector<HTMLElement>("#scrim");
  const panel = document.querySelector<HTMLElement>(`#${id}`);
  if (scrim) scrim.hidden = false;
  if (panel) panel.hidden = false;
}

function closePanels(): void {
  const resume = sheetOpen;
  sheetOpen = false;
  sheetSide = null;
  for (const id of ["scrim", "sheet", "help"]) {
    const node = document.querySelector<HTMLElement>(`#${id}`);
    if (node) node.hidden = true;
  }
  if (resume) {
    refresh();
    void turn();
  }
}

function openSheet(side: "white" | "black"): void {
  openPanel("sheet");
  sheetOpen = true;
  sheetSide = side;
  const title = document.querySelector("#sheet-title");
  if (title) title.textContent = side === "white" ? "White seat" : "Black seat";
  const chip = document.querySelector("#sheet-chip");
  chip?.classList.remove("white", "black");
  chip?.classList.add(side);
  paintSheet();
  refresh();
}

function paintSheet(): void {
  if (!sheetSide) return;
  const who = players[sheetSide];
  document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.pick === who ? "true" : "false");
  });
  const nabla = document.querySelector<HTMLElement>("#set-nabla");
  const fishSet = document.querySelector<HTMLElement>("#set-fish");
  const maia = document.querySelector<HTMLElement>("#set-maia");
  const lead = document.querySelector("#sheet-lead");
  const approach = document.querySelector("#sheet-approach");
  const about = document.querySelector("#sheet-about");
  if (nabla) nabla.hidden = who !== "nabla";
  if (fishSet) fishSet.hidden = who !== "stockfish";
  if (maia) maia.hidden = who !== "maia";
  if (lead) lead.textContent = WHO[who].name;
  if (approach) approach.textContent = WHO[who].approach;
  if (about) {
    about.textContent = who === "human"
      ? "You move the pieces on this board."
      : who === "nabla"
        ? "Nabla chooses the legal move that raises its own energy the most. Level 0 scores the move, Level 1 plays out captures, Level 2 looks at one reply."
        : who === "stockfish"
          ? "Stockfish 19 lite. The Elo cap is Stockfish's own limit, not a measured rating for Nabla."
          : "Maia-3 predicts the move a person of the chosen rating would play. The network downloads the first time Maia moves. Its weights are AGPL-3.0.";
  }
  document.querySelector<HTMLElement>("#level-w-field")!.hidden = sheetSide !== "white";
  document.querySelector<HTMLElement>("#level-b-field")!.hidden = sheetSide !== "black";
}

function paintSeats(): void {
  const far = orientation === "white" ? "black" : "white";
  const near = orientation === "white" ? "white" : "black";
  fillSeat("seat-top", far);
  fillSeat("seat-bottom", near);
}

function fillSeat(id: string, color: "white" | "black"): void {
  const seat = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!seat) return;
  seat.dataset.seat = color;
  const who = players[color];
  const name = seat.querySelector(".name");
  const sub = seat.querySelector(".sub");
  const chip = seat.querySelector(".chip");
  if (name) name.textContent = WHO[who].name;
  if (sub) sub.textContent = WHO[who].approach;
  chip?.classList.remove("white", "black");
  chip?.classList.add(color);
  const over = view?.state === "checkmate" || view?.state === "draw";
  seat.classList.toggle("on", !over && view?.turn === color);
  seat.classList.toggle("dim", !!over || view?.turn !== color);
  const loot = seat.querySelector(".loot");
  if (loot) fillLoot(loot, color);
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
  if (pause) pause.setAttribute("aria-pressed", "false");
  lab.reset();
  lastMove = undefined;
  steps.length = 0;
  cursor = 0;
  startFen = lab.fen();
  paintMoves();
  const promo = document.querySelector<HTMLElement>("#promo");
  if (promo) promo.hidden = true;
  const reason = document.querySelector("#reason");
  if (reason) drawHist(null, "");
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
    play(choices[0].uci, choices[0].san);
    return;
  }
  pending = choices;
  const promo = document.querySelector<HTMLElement>("#promo");
  if (!promo) return;
  promo.hidden = false;
  promo.replaceChildren();
  const pieceName: Record<string, string> = { q: "queen", r: "rook", b: "bishop", n: "knight" };
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    const role = pieceName[choice.uci[4] ?? "q"] ?? "queen";
    const piece = document.createElement("piece");
    piece.className = `${role} ${view?.turn ?? "white"}`;
    button.append(piece);
    button.setAttribute("aria-label", role);
    button.addEventListener("click", () => {
      promo.hidden = true;
      play(choice.uci, choice.san);
    });
    promo.append(button);
  }
}

function play(uci: string, san: string): void {
  if (cursor < steps.length) steps.length = cursor;
  const side = view?.turn;
  flight = 0;
  lab.push(uci);
  if (side && san) steps.push({ uci, san, side, fen: lab.fen() });
  cursor = steps.length;
  paintMoves();
  lastMove = [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
  arrowsOn = false;
  arrows = [];
  refresh();
  void turn();
}

function undo(): void {
  if (cursor <= 0) return;
  if (cursor < steps.length) {
    recall(cursor - 1);
    return;
  }
  epoch += 1;
  flight = 0;
  steps.length = cursor - 1;
  cursor = steps.length;
  arrowsOn = false;
  arrows = [];
  lab.load(cursor === 0 ? startFen : steps[cursor - 1].fen);
  const step = cursor === 0 ? undefined : steps[cursor - 1];
  lastMove = step ? [step.uci.slice(0, 2) as Key, step.uci.slice(2, 4) as Key] : undefined;
  refresh();
  void turn();
}

function swapSeats(): void {
  const white = players.white;
  players.white = players.black;
  players.black = white;
  orientation = orientation === "white" ? "black" : "white";
  refresh();
  void turn();
}

async function copyPgn(): Promise<void> {
  const parts: string[] = [];
  steps.forEach((step, index) => {
    parts.push(index % 2 === 0 ? `${index / 2 + 1}. ${step.san}` : step.san);
  });
  const result = !view || view.state === "play" || view.state === "check"
    ? "*"
    : view.state === "draw"
      ? "1/2-1/2"
      : view.turn === "white"
        ? "0-1"
        : "1-0";
  const body = [
    `[Event "Nabla"]`,
    `[White "${WHO[players.white].name}"]`,
    `[Black "${WHO[players.black].name}"]`,
    `[Result "${result}"]`,
    "",
    `${parts.join(" ")} ${result}`,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(body);
    setStatus("Copied.");
  } catch {
    setStatus("Could not copy.");
  }
}

function recall(next: number): void {
  if (!startFen) return;
  epoch += 1;
  flight = 0;
  arrowsOn = false;
  arrows = [];
  candidates = [];
  cursor = Math.max(0, Math.min(steps.length, next));
  lab.load(cursor === 0 ? startFen : steps[cursor - 1].fen);
  const step = cursor === 0 ? undefined : steps[cursor - 1];
  lastMove = step ? [step.uci.slice(0, 2) as Key, step.uci.slice(2, 4) as Key] : undefined;
  refresh();
  if (cursor === steps.length) void turn();
}

function atHead(): boolean {
  return cursor === steps.length;
}

function actor(): "human" | "nabla" | "fish" | "maia" | "none" {
  if (sheetOpen || !atHead() || !view || view.state === "checkmate" || view.state === "draw" || paused) return "none";
  const who = players[view.turn];
  if (who === "human") return "human";
  if (who === "nabla") return "nabla";
  if (who === "stockfish") return "fish";
  if (who === "maia") return "maia";
  return "none";
}

function turn(): void {
  if (flight !== 0) return;
  const who = actor();
  if (who !== "nabla" && who !== "fish" && who !== "maia") return;
  flight = epoch;
  const mine = epoch;
  if (who === "nabla") window.setTimeout(() => void nablaTurn(mine), reduceMotion ? 0 : 40);
  else if (who === "maia") void maiaTurn(mine);
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
  candidateSide = view?.turn === "black" ? "black" : "white";
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
    if (analysis.best) {
      const san = analysis.candidates.find((candidate) => candidate.uci === analysis.best)?.san ?? analysis.best;
      play(analysis.best, san);
    }
    else {
      flight = 0;
      refresh();
    }
  }, pace());
}

async function fishTurn(mine: number): Promise<void> {
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
    window.setTimeout(() => {
      if (mine !== epoch) return;
      if (actor() !== "fish") {
        flight = 0;
        return;
      }
      arrowsOn = false;
      play(score.uci, san);
    }, pace());
  } catch (error) {
    if (mine === epoch) flight = 0;
    const message = error instanceof Error ? error.message : "Stockfish lite failed.";
    setStatus(message);
  }
}

async function maiaTurn(mine: number): Promise<void> {
  try {
    const { maiaMove } = await import("./maia");
    if (mine !== epoch || actor() !== "maia") {
      if (mine === epoch) flight = 0;
      return;
    }
    const fen = lab.fen();
    const legal = (JSON.parse(lab.moves()) as Move[]).map((move) => move.uci);
    const elo = Number(document.querySelector<HTMLInputElement>("#maia-self")?.value ?? 1500);
    const oppo = Number(document.querySelector<HTMLInputElement>("#maia-oppo")?.value ?? 1500);
    const variety = Number(document.querySelector<HTMLInputElement>("#maia-mix")?.value ?? 0);
    const uci = await maiaMove(fen, legal, elo, oppo, variety, setStatus);
    if (mine !== epoch || actor() !== "maia" || !uci) {
      if (mine === epoch) flight = 0;
      return;
    }
    const moves = JSON.parse(lab.moves()) as Move[];
    const san = moves.find((move) => move.uci === uci)?.san ?? uci;
    play(uci, san);
  } catch (error) {
    if (mine === epoch) flight = 0;
    setStatus(error instanceof Error ? error.message : "Maia did not move.");
  }
}

function groupValue(id: string, fallback: string): string {
  return document.querySelector<HTMLElement>(`#${id} [aria-pressed="true"]`)?.dataset.value ?? fallback;
}

function nablaLevel(): number {
  const id = view?.turn === "black" ? "level-b" : "level-w";
  return Number(groupValue(id, "2"));
}

function fishElo(): number | "full" {
  const value = Number(document.querySelector<HTMLInputElement>("#fish-elo")?.value ?? 1320);
  return value >= 3190 ? "full" : value;
}

function fishMs(): number {
  return Number(groupValue("fish-ms", "200"));
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
    movable: { color: actor() === "human" ? view.turn : undefined, dests, free: false },
  });
  setStatus(view.state === "checkmate" || view.state === "draw" ? "" : `${cap(view.turn)} to move.`);
  drawCallout();
  drawEnergy(view.energy);
  drawCandidates();
  updateJudge();
  paintSeats();
  paintMoves();
  resize();
}

function statusLine(): string {
  if (!view) return "Loading the engine.";
  const color = cap(view.turn);
  if (view.detail === "checkmate") return "";
  if (view.detail === "stalemate") return "Stalemate.";
  if (view.detail === "material") return "Draw. Not enough material to mate.";
  if (view.detail === "fifty") return "Draw. Fifty moves without a pawn move or a capture.";
  if (view.detail === "repetition") return "Draw. This position has occurred three times.";
  if (view.detail === "check") return `${color} is in check.`;
  const who = WHO[players[view.turn]].name;
  return `${color} to move. ${who}.`;
}

function drawCallout(): void {
  const host = document.querySelector<HTMLElement>("#callout");
  if (!host || !view) return;
  document.querySelector(".board")?.classList.toggle("ended", view.state === "checkmate" || view.state === "draw");
  if (view.detail === "play") {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.className = view.detail === "check" ? "callout chip" : "callout card";
  host.replaceChildren();
  const title = document.createElement("p");
  title.className = "callout-title";
  const body = document.createElement("p");
  body.className = "callout-body";
  const line = statusLine();
  if (view.detail === "check") {
    title.textContent = "Check";
    body.hidden = true;
    host.append(title, body);
  } else if (view.state === "checkmate" || view.state === "draw") {
    const whiteWins = view.turn === "black";
    title.className = "callout-score";
    title.textContent = view.state === "draw" ? "½-½" : whiteWins ? "1-0" : "0-1";
    body.className = "callout-reason";
    body.textContent = view.state === "draw" ? line.replace(/^Draw\. /, "") : "Checkmate";
    host.append(title, body, resultSeats());
  } else {
    title.textContent = line;
    body.hidden = true;
    host.append(title, body);
  }
  if (view.state === "checkmate" || view.state === "draw") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "go";
    button.textContent = "New game";
    button.addEventListener("click", () => begin());
    host.append(button);
  }
}

function setStatus(text: string): void {
  const status = document.querySelector("#status");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("alert", view?.detail === "check");
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
  const chosen = analysis.candidates.find((candidate) => candidate.uci === analysis.best);
  if (!chosen?.terms) {
    drawHist(null, "No energy to split.");
    return;
  }
  drawHist(chosen.terms, `${chosen.san}  ${signed(chosen.q)}`);
}

function drawHist(terms: Terms | null, title: string): void {
  const host = document.querySelector("#reason");
  if (!host) return;
  host.replaceChildren();
  if (!title) return;
  if (!terms) {
    const head = document.createElement("p");
    head.className = "reason-title";
    head.textContent = title;
    host.append(head);
    return;
  }
  const split = document.createElement("div");
  split.className = "split";
  const max = Math.max(0.05, ...TERMS.map((term) => Math.abs(terms?.[term.key] ?? 0)));
  for (const term of TERMS) {
    const value = terms?.[term.key] ?? 0;
    const row = document.createElement("div");
    row.className = "row";
    row.title = `${term.label} ${signed(value)}`;
    const name = document.createElement("span");
    name.textContent = term.label;
    const track = document.createElement("span");
    track.className = "track";
    const fill = document.createElement("i");
    fill.dataset.sign = value < 0 ? "neg" : "pos";
    fill.style.width = terms ? `${(Math.abs(value) / max) * 50}%` : "0%";
    track.append(fill);
    const number = document.createElement("b");
    number.textContent = signed(value);
    row.append(name, track, number);
    split.append(row);
  }
  host.append(split);
}

function drawCandidates(): void {
  const list = document.querySelector("#candidates");
  if (!list) return;
  list.replaceChildren();
  for (const candidate of candidates.slice(0, 8)) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "move";
    const part = sanParts(candidate.san);
    const pip = document.createElement("span");
    pip.className = "cg-wrap pip";
    const glyph = document.createElement("piece");
    glyph.className = `${candidateSide} ${part.role}`;
    pip.append(glyph);
    const square = document.createElement("span");
    square.className = "sq";
    square.textContent = part.rest;
    name.append(pip, square);
    const score = document.createElement("b");
    score.className = "pts";
    score.textContent = signed(candidate.q);
    item.append(name, score);
    list.append(item);
  }
}

function pace(): number {
  if (reduceMotion) return 0;
  return Number(document.querySelector<HTMLInputElement>("#pace")?.value ?? 500);
}

function paintMoves(): void {
  const host = document.querySelector("#moves");
  const name = document.querySelector("#ply-name");
  if (name) name.textContent = cursor === 0 ? "Start" : `Move ${Math.ceil(cursor / 2)}`;
  const count = document.querySelector("#move-count");
  if (count) count.textContent = String(cursor);
  const total = document.querySelector("#move-total");
  if (total) total.textContent = String(steps.length);
  for (const [id, on] of [["prev", cursor > 0], ["undo", cursor > 0], ["to-start", cursor > 0], ["redo", cursor < steps.length], ["to-end", cursor < steps.length]] as const) {
    const button = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (button) button.disabled = !on;
  }
  if (!host) return;
  host.replaceChildren();
  if (steps.length === 0) return;
  const list = document.createElement("ol");
  list.className = "plies";
  for (let i = 0; i < steps.length; i += 2) {
    const row = document.createElement("li");
    const number = document.createElement("span");
    number.textContent = String(i / 2 + 1);
    const white = document.createElement("button");
    white.type = "button";
    white.textContent = steps[i]?.san ?? "";
    white.disabled = !steps[i];
    white.addEventListener("click", () => recall(i + 1));
    const black = document.createElement("button");
    black.type = "button";
    black.textContent = steps[i + 1]?.san ?? "";
    black.disabled = !steps[i + 1];
    if (i >= cursor) white.classList.add("future");
    if (i + 1 >= cursor) black.classList.add("future");
    black.addEventListener("click", () => recall(i + 2));
    row.append(number, white, black);
    list.append(row);
  }
  host.append(list);
}

function showTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.tab === name ? "true" : "false");
  });
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

function magnet(input: HTMLInputElement, stops: number[], out: Element | null): void {
  const pull = () => {
    let value = Number(input.value);
    const near = stops.reduce((best, stop) => (Math.abs(stop - value) < Math.abs(best - value) ? stop : best));
    if (Math.abs(near - value) <= 40) {
      value = near;
      input.value = String(near);
    }
    if (out) out.textContent = String(value);
    const span = Number(input.max) - Number(input.min) || 1;
    input.style.setProperty("--p", `${((value - Number(input.min)) / span) * 100}%`);
  };
  input.addEventListener("input", pull);
  input.addEventListener("change", pull);
  pull();
}

function fitBoard(): void {
  const probe = document.querySelector<HTMLElement>("#board-probe");
  if (!probe) return;
  const raw = probe.getBoundingClientRect().width;
  if (raw < 8) return;
  const dpr = window.devicePixelRatio || 1;
  const snapped = Math.floor((raw * dpr) / 8) * 8 / dpr;
  document.documentElement.style.setProperty("--cg", `${snapped}px`);
}

function resize(): void {
  fitBoard();
  paint();
}

function paint(): void {
  const board = document.querySelector<HTMLElement>(".board");
  const canvas = document.querySelector<HTMLCanvasElement>("#fields");
  const svg = document.querySelector<SVGSVGElement>("#arrows");
  const seated = players.white === "nabla" || players.black === "nabla";
  const both = players.white === "nabla" && players.black === "nabla";
  const nabla = !!view && (view.state === "play" || view.state === "check") && seated;
  const tone = both && view?.turn === "black" ? "var(--field-black)" : "var(--field-white)";
  if (canvas && board) {
    const width = board.clientWidth;
    const height = board.clientHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    drawFields(canvas, nabla ? view : undefined, orientation);
  }
  if (svg) drawOverlay(svg, nabla ? view : undefined, nabla && arrowsOn ? arrows : [], nabla && arrowsOn, orientation, tone);
  board?.classList.toggle("flipped", orientation === "black");
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
    setScore(whiteWins ? "1-0" : "0-1");
    read.textContent = "Checkmate.";
    return;
  }
  if (view.state === "draw") {
    setMeter(0.5);
    setScore("1/2");
    read.textContent = "The game is a draw.";
    return;
  }
  if (judgeId === "nabla") {
    const energy = view.energy.total ?? 0;
    setMeter(1 / (1 + Math.exp(-0.4 * energy)));
    setScore(signed(energy));
    read.textContent = "";
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
      if (result.mate !== null) {
        const told = mateScore(result.mate, whiteToMove);
        setScore(told.glyph);
        read.textContent = told.line;
      } else if (result.cp !== null) {
        const whiteCp = whiteToMove ? result.cp : -result.cp;
        setScore(signed(whiteCp / 100));
        read.textContent = `Stockfish lite, depth ${result.depth}. Positive is White ahead.`;
      } else {
        setScore("n/a");
        read.textContent = "Stockfish lite did not return a score.";
      }
    })
    .catch((error: unknown) => {
      if (token === judgeToken) read.textContent = error instanceof Error ? error.message : "Stockfish lite did not answer.";
    });
}

function setMeter(share: number): void {
  const meter = document.querySelector<HTMLElement>("#meter");
  if (!meter) return;
  const clamped = Math.min(1, Math.max(0, share));
  meter.style.setProperty("--share", String(clamped));
  meter.classList.toggle("flip", orientation === "black");
  const read = document.querySelector("#meter-read");
  if (read) read.textContent = clamped.toFixed(2);
}

function setScore(text: string): void {
  const node = document.querySelector("#judge-score");
  if (node) node.textContent = text;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function mateScore(mate: number, whiteToMove: boolean): { glyph: string; line: string } {
  const n = Math.abs(mate);
  const whiteMates = whiteToMove ? mate > 0 : mate < 0;
  const glyph = whiteMates ? `M${n}` : `-M${n}`;
  const line = n === 0
    ? whiteMates ? "White has mate." : "Black has mate."
    : whiteMates ? `White mates in ${n}.` : `Black mates in ${n}.`;
  return { glyph, line };
}

function resultSeats(): HTMLElement {
  const row = document.createElement("div");
  row.className = "callout-vs";
  row.append(resultSeat("white"), Object.assign(document.createElement("span"), { className: "vs", textContent: "vs" }), resultSeat("black"));
  return row;
}

function resultSeat(color: "white" | "black"): HTMLElement {
  const cell = document.createElement("div");
  const name = document.createElement("b");
  name.textContent = WHO[players[color]].name;
  const sub = document.createElement("span");
  sub.textContent = WHO[players[color]].approach;
  cell.append(name, sub);
  return cell;
}

function fillLoot(host: Element, color: "white" | "black"): void {
  host.replaceChildren();
  if (!view || !startFen) return;
  const taken: Array<"pawn" | "knight" | "bishop" | "rook" | "queen"> = [];
  let previous = startFen;
  for (let i = 0; i < cursor; i++) {
    const step = steps[i];
    if (!step) continue;
    if (step.side === color) taken.push(...took(previous, step.fen, color));
    previous = step.fen;
  }
  const other = color === "white" ? "black" : "white";
  for (const role of taken) {
    const pip = document.createElement("span");
    pip.className = "cg-wrap pip";
    const glyph = document.createElement("piece");
    glyph.className = `${other} ${role}`;
    pip.append(glyph);
    host.append(pip);
  }
  const ahead = color === "white" ? materialLead(lab.fen()) : -materialLead(lab.fen());
  if (ahead > 0) {
    const plus = document.createElement("b");
    plus.className = "plus";
    plus.textContent = `+${ahead}`;
    host.append(plus);
  }
}

function showMark(event: PointerEvent): void {
  const tip = document.querySelector<HTMLElement>("#mark-tip");
  if (!tip) return;
  const text = paused ? markText(event) : "";
  if (!text) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = text;
  const left = Math.min(event.clientX + 14, window.innerWidth - 280);
  const top = Math.min(event.clientY + 16, window.innerHeight - 72);
  tip.style.transform = `translate(${left}px, ${top}px)`;
}

function markText(event: PointerEvent): string {
  if (!view || !(view.state === "play" || view.state === "check")) return "";
  if (players.white !== "nabla" && players.black !== "nabla") return "";
  const board = document.querySelector(".board");
  if (!board) return "";
  const rect = board.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 8;
  const y = ((event.clientY - rect.top) / rect.height) * 8;
  if (x < 0 || y < 0 || x >= 8 || y >= 8) return "";
  const layers = layerState();
  if (layers.moves && arrowsOn) {
    const arrow = arrowAt(x, y);
    if (arrow && view) return explainArrow(arrow.san, arrow.primary, view.turn, players.white === "nabla" && players.black === "nabla");
  }
  const file = orientation === "white" ? Math.floor(x) : 7 - Math.floor(x);
  const rank = orientation === "white" ? 7 - Math.floor(y) : Math.floor(y);
  const index = rank * 8 + file;
  const fen = lab.fen();
  if (layers.threats) {
    const gain = view.threats[index] ?? 0;
    if (gain > 0 && gain < 100) return explainHang(fen, index, gain);
  }
  if (layers.tension && (view.tension[index] ?? 0) > 0.2) return explainTension(fen, index);
  if (layers.control) {
    const value = view.control[index] ?? 0;
    if (Math.abs(value) > 0.28) return explainControl(fen, index, value);
  }
  return "";
}

function arrowAt(x: number, y: number): HudArrow | undefined {
  let best: { arrow: HudArrow; distance: number } | undefined;
  for (const arrow of arrows) {
    const from = boardPoint(arrow.uci.slice(0, 2));
    const to = boardPoint(arrow.uci.slice(2, 4));
    const distance = arrowDistance(x, y, from, to);
    if (distance < 0.42 && (!best || distance < best.distance)) best = { arrow, distance };
  }
  return best?.arrow;
}

function boardPoint(square: string): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === "white" ? { x: file + 0.5, y: 7.5 - rank } : { x: 7.5 - file, y: rank + 0.5 };
}

function arrowDistance(x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const knight = (Math.abs(Math.abs(dx) - 1) < 0.01 && Math.abs(Math.abs(dy) - 2) < 0.01) || (Math.abs(Math.abs(dx) - 2) < 0.01 && Math.abs(Math.abs(dy) - 1) < 0.01);
  if (!knight) return segmentDistance(x, y, from, to);
  const elbow = Math.abs(dx) < Math.abs(dy) ? { x: from.x + dx, y: from.y } : { x: from.x, y: from.y + dy };
  return Math.min(segmentDistance(x, y, from, elbow), segmentDistance(x, y, elbow, to));
}

function segmentDistance(x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / len));
  return Math.hypot(from.x + dx * t - x, from.y + dy * t - y);
}
