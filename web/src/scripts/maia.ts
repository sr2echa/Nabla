// Maia-3 (CSSLab, University of Toronto). The weights are AGPL-3.0 and are
// downloaded by the browser on the first game, then kept in Cache Storage.
// This file does not ship the network.

import vocab from "./maia-moves.json";

const INDEX = vocab as Record<string, number>;
const PIECES = "PNBRQKpnbrqk";
const SOURCES = [
  "https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/maia3_simplified.onnx",
  "https://cdn.jsdelivr.net/gh/CSSLab/maia-platform-frontend@main/public/maia3/maia3_simplified.onnx",
];

type Session = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
};

let pending: Promise<Session> | null = null;

export async function maiaMove(
  fen: string,
  legal: string[],
  eloSelf: number,
  eloOppo: number,
  variety: number,
  onStatus: (text: string) => void,
): Promise<string> {
  const session = await (pending ??= load(onStatus).catch((error: unknown) => {
    pending = null;
    throw error;
  }));
  const { tokens, black } = tokensOf(fen);
  const ort = await import("onnxruntime-web/wasm");
  const out = await session.run({
    tokens: new ort.Tensor("float32", tokens, [1, 64, 12]),
    elo_self: new ort.Tensor("float32", Float32Array.of(eloSelf), [1]),
    elo_oppo: new ort.Tensor("float32", Float32Array.of(eloOppo), [1]),
  });
  const logits = out.logits_move.data;
  const scored = legal
    .map((uci) => {
      const key = black ? mirrorUci(uci) : uci;
      const at = INDEX[key];
      return at === undefined ? null : { uci, logit: logits[at] };
    })
    .filter((row): row is { uci: string; logit: number } => row !== null);
  if (scored.length === 0) throw new Error("Maia had no legal move in its vocabulary.");
  if (variety <= 0) return scored.reduce((best, row) => (row.logit > best.logit ? row : best)).uci;
  const max = Math.max(...scored.map((row) => row.logit));
  const weights = scored.map((row) => Math.exp((row.logit - max) / (variety / 100 || 0.05)));
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].uci;
  }
  return scored[0].uci;
}

async function load(onStatus: (text: string) => void): Promise<Session> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  onStatus("Downloading Maia.");
  const bytes = await fetchModel(onStatus);
  onStatus("Starting Maia.");
  return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] }) as Promise<Session>;
}

async function fetchModel(onStatus: (text: string) => void): Promise<Uint8Array> {
  const cache = "caches" in globalThis ? await caches.open("nabla-maia-3") : null;
  for (const url of SOURCES) {
    const hit = cache ? await cache.match(url) : null;
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  let last = "Maia could not be downloaded.";
  for (const url of SOURCES) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        last = `Maia download answered ${response.status}.`;
        continue;
      }
      const total = Number(response.headers.get("content-length") ?? 0);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.byteLength;
        if (total > 0) onStatus(`Downloading Maia, ${Math.round((got / total) * 100)}%.`);
      }
      const bytes = new Uint8Array(got);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.byteLength;
      }
      if (cache) await cache.put(url, new Response(bytes.slice()));
      return bytes;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

function tokensOf(fen: string): { tokens: Float32Array; black: boolean } {
  const [placement, turn] = fen.split(" ");
  const black = turn === "b";
  const tokens = new Float32Array(64 * 12);
  const ranks = placement.split("/");
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const glyph of ranks[rank] ?? "") {
      if (glyph >= "1" && glyph <= "8") {
        file += Number(glyph);
        continue;
      }
      const square = (7 - rank) * 8 + file;
      const whitePiece = glyph === glyph.toUpperCase();
      const asWhite = whitePiece !== black;
      const plane = PIECES.indexOf(asWhite ? glyph.toUpperCase() : glyph.toLowerCase());
      const target = black ? square ^ 56 : square;
      if (plane >= 0) tokens[target * 12 + plane] = 1;
      file += 1;
    }
  }
  return { tokens, black };
}

function mirrorUci(uci: string): string {
  const mirror = (square: string) => square[0] + String(9 - Number(square[1]));
  return mirror(uci.slice(0, 2)) + mirror(uci.slice(2, 4)) + uci.slice(4);
}
