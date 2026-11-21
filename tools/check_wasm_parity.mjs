// Cross-target bit-identity check (05 §6, §7): compares native `nabla` UCI output
// against `web/src/engine/nabla_wasm.js` over the 16 bench positions at Levels 0-2,
// and reports WASM vs native decision times (P-3).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const nablaBin = resolve(
  root,
  process.platform === "win32" ? "target/release/nabla.exe" : "target/release/nabla",
);
const wasmJs = new URL("../web/src/engine/nabla_wasm.js", import.meta.url).href;
const wasmBytes = readFileSync(resolve(root, "web/src/engine/nabla_wasm_bg.wasm"));

const BENCH = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5",
  "2r3k1/pp3ppp/2n5/3p4/3P4/2N5/PP3PPP/2R3K1 w - - 0 1",
  "1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1",
  "1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1",
  "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
  "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
  "8/8/8/8/8/2k5/8/1K1Q4 w - - 0 1",
  "8/8/8/8/4k3/8/8/R3K3 w - - 0 1",
  "8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1",
];

function runNativeBatch(level) {
  const lines = [`setoption name Level value ${level}`];
  for (let i = 0; i < BENCH.length; i++) {
    lines.push(`position fen ${BENCH[i]}`);
    lines.push("eval");
    lines.push("explain 8");
    lines.push("go");
    lines.push(`echo MARKER_${i}`);
  }
  lines.push("quit");
  // `echo` is not a UCI command, so use `d` as an unambiguous boundary marker.
  const script = lines
    .map((l) => (l.startsWith("echo ") ? "d" : l))
    .join("\n") + "\n";
  const stdout = execFileSync(nablaBin, [], { input: script, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const records = [];
  let cur = { evalTotal: 0, candidates: [], best: null, nodes: 0 };
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("total ")) {
      cur.evalTotal = Number(line.split(/\s+/)[1]);
    } else if (/^[a-h][1-8][a-h][1-8][qrbn]?\s+[+-]\d+\.\d+/.test(line)) {
      const parts = line.split(/\s+/);
      cur.candidates.push({ uci: parts[0], q: Number(parts[1]) });
    } else if (line.startsWith("info ") && line.includes(" nodes ")) {
      const m = line.match(/\bnodes\s+(\d+)/);
      if (m) cur.nodes = Number(m[1]);
    } else if (line.startsWith("bestmove ")) {
      cur.best = line.split(/\s+/)[1];
    } else if (/^[rnbqkpRNBQKP1-8/]+\s+[wb]\s+/.test(line)) {
      records.push(cur);
      cur = { evalTotal: 0, candidates: [], best: null, nodes: 0 };
    }
  }
  if (records.length !== BENCH.length) {
    throw new Error(`Expected ${BENCH.length} native records at level ${level}, got ${records.length}`);
  }
  return records;
}

const mod = await import(wasmJs);
mod.initSync({ module: wasmBytes });
const lab = new mod.Lab();

let checks = 0;
for (const level of [0, 1, 2]) {
  lab.set_level(level);
  lab.set_temperature(0);
  const native = runNativeBatch(level);
  const t0 = performance.now();
  for (let i = 0; i < BENCH.length; i++) {
    lab.load(BENCH[i]);
    const view = JSON.parse(lab.view());
    const analysis = JSON.parse(lab.analyze());
    const ref = native[i];

    if (Math.abs(view.energy.total - ref.evalTotal) > 1e-3) {
      throw new Error(`L${level} pos ${i} eval mismatch: wasm=${view.energy.total} native=${ref.evalTotal}`);
    }
    if (analysis.best !== ref.best) {
      throw new Error(`L${level} pos ${i} best mismatch: wasm=${analysis.best} native=${ref.best}`);
    }
    if (analysis.nodes !== ref.nodes) {
      throw new Error(`L${level} pos ${i} nodes mismatch: wasm=${analysis.nodes} native=${ref.nodes}`);
    }
    if (analysis.candidates.length !== ref.candidates.length) {
      throw new Error(`L${level} pos ${i} candidate count mismatch`);
    }
    for (let k = 0; k < analysis.candidates.length; k++) {
      const wc = analysis.candidates[k];
      const nc = ref.candidates[k];
      if (wc.uci !== nc.uci || Math.abs(wc.q - nc.q) > 1e-3) {
        throw new Error(`L${level} pos ${i} cand ${k} mismatch: wasm=${wc.uci}@${wc.q} native=${nc.uci}@${nc.q}`);
      }
      if (wc.terms) {
        const mover = view.turn === "white" ? 1 : -1;
        const reconstructed = mover * view.energy.total + wc.terms.total;
        if (Math.abs(reconstructed - wc.q) > 2e-3) {
          throw new Error(`L${level} pos ${i} cand ${k} view+terms!=q: ${reconstructed} vs ${wc.q}`);
        }
      }
    }
    checks += 1;
  }
  const elapsed = performance.now() - t0;
  console.log(`Level ${level}: ${BENCH.length}/${BENCH.length} parity OK (WASM mean ${(elapsed / BENCH.length).toFixed(2)} ms/pos)`);
}
lab.free();
console.log(`All ${checks} native-vs-WASM cross-target checks passed bit-identically.`);
