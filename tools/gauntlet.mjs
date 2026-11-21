// Development matches against the protocol's opponents.
// A short run is a smoke test. It is not a rating.
//
//   node tools/gauntlet.mjs --opponent stockfish --rounds 10
//   node tools/gauntlet.mjs --opponent self --other-level 0 --rounds 20
//   node tools/gauntlet.mjs --opponent maia --weights path/to/maia-1500.pb.gz --rounds 100
//
// Conditions follow docs/research/hypotheses-and-protocol.md §4:
// fastchess, 10s+0.1s, Temperature 0 (the best move), Threads 1 for the opponent.
// Pass --book 8moves_v3.pgn before treating a score as protocol data.
// Near an even score, the 95% half-width is about 681/sqrt(n) Elo (protocol Eq. 1).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    rounds: { type: "string", default: "10" },
    opponent: { type: "string", default: "stockfish" },
    elo: { type: "string", default: "1320" },
    level: { type: "string", default: "2" },
    "other-level": { type: "string", default: "0" },
    tc: { type: "string", default: "10+0.1" },
    seed: { type: "string" },
    pgnout: { type: "string" },
    nabla: { type: "string" },
    stockfish: { type: "string", default: "stockfish" },
    lc0: { type: "string", default: "lc0" },
    weights: { type: "string" },
    book: { type: "string" },
    fastchess: { type: "string", default: "fastchess" },
    concurrency: { type: "string", default: "1" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log("Usage: node tools/gauntlet.mjs --opponent <stockfish|maia|self> [options]");
  console.log("  --rounds <N> --tc <10+0.1> --level <0|1|2> --other-level <0|1|2> --elo <1320..3190>");
  console.log("  --book <path.(pgn|epd)> --seed <N> --pgnout <path> --concurrency <N>");
  process.exit(0);
}

const root = resolve(import.meta.dirname, "..");
const nabla = values.nabla ?? (process.platform === "win32"
  ? resolve(root, "target/release/nabla.exe")
  : resolve(root, "target/release/nabla"));
const outDir = resolve(root, "tools/gauntlet/out");
const rounds = Number(values.rounds);
const games = rounds * 2;

if (!Number.isInteger(rounds) || rounds < 1) fail("--rounds must be a positive integer.");
if (!existsSync(nabla)) fail(`Nabla binary not found at ${nabla}. Run: cargo build --release`);
if (!commandExists(values.fastchess)) {
  fail("fastchess is not on PATH. The protocol runner is https://github.com/Disservin/fastchess");
}

const engines = [
  ["-engine", `cmd=${nabla}`, "name=Nabla", `option.Level=${values.level}`, "option.Temperature=0", `tc=${values.tc}`],
];

if (values.opponent === "stockfish") {
  if (!commandExists(values.stockfish)) fail(`Stockfish is not on PATH (${values.stockfish}).`);
  const elo = Number(values.elo);
  if (!Number.isInteger(elo) || elo < 1320 || elo > 3190) fail("--elo must be an integer from 1320 to 3190.");
  engines.push([
    "-engine", `cmd=${values.stockfish}`, `name=SF${elo}`,
    "option.UCI_LimitStrength=true", `option.UCI_Elo=${elo}`, "option.Threads=1", `tc=${values.tc}`,
  ]);
} else if (values.opponent === "maia") {
  if (!values.weights || !existsSync(values.weights)) fail("--weights must be a Maia network file for lc0.");
  if (!commandExists(values.lc0)) fail(`lc0 is not on PATH (${values.lc0}). Maia plays through lc0 at 1 node.`);
  engines.push([
    "-engine", `cmd=${values.lc0}`, "name=Maia",
    `option.WeightsFile=${values.weights}`, "nodes=1", "option.Threads=1",
  ]);
} else if (values.opponent === "self") {
  const other = Number(values["other-level"]);
  if (![0, 1, 2].includes(other)) fail("--other-level must be 0, 1, or 2.");
  engines.push([
    "-engine", `cmd=${nabla}`, `name=NablaL${other}`,
    `option.Level=${other}`, "option.Temperature=0", `tc=${values.tc}`,
  ]);
} else {
  fail("--opponent must be stockfish, maia, or self.");
}

if (values.book && !existsSync(values.book)) fail(`Opening book not found: ${values.book}`);

mkdirSync(outDir, { recursive: true });
const pgn = values.pgnout ? resolve(values.pgnout) : resolve(outDir, "match.pgn");
const bookFormat = values.book?.toLowerCase().endsWith(".epd") ? "epd" : "pgn";
const args = [
  ...engines.flat(),
  ...(values.book ? ["-openings", `file=${values.book}`, `format=${bookFormat}`, "order=random"] : []),
  ...(values.seed ? ["-srand", values.seed] : []),
  "-rounds", String(rounds),
  "-repeat",
  "-concurrency", values.concurrency,
  "-pgnout", pgn,
];

if (!values.book) {
  console.log("No --book. Every game starts from the opening position.");
  console.log("That repeats one opening. Do not quote it as a protocol rating.");
}

const half = (681 / Math.sqrt(games)).toFixed(0);
console.log(`Rounds: ${rounds}, with -repeat so colours are reversed.`);
console.log(`If that is ${games} games and the score were even, the 95% half-width would be about ±${half} Elo.`);
console.log("Use the game count in the Score line fastchess prints if it differs. Eq. (1) is 681/sqrt(n).");
console.log("This run is exploratory until it uses the protocol book and the protocol sample size.");
console.log(`fastchess ${args.join(" ")}`);

const result = spawnSync(values.fastchess, args, { stdio: "inherit" });
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);

function commandExists(name) {
  if (name.includes("/") || name.includes("\\")) return existsSync(name);
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return dirs.some((dir) => exts.some((ext) => existsSync(join(dir, `${name}${ext}`))));
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
