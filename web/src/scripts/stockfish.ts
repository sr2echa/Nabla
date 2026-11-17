// Stockfish 19 lite, single threaded, from the `stockfish` package (GPL-3.0).
// The worker finds its wasm file in the URL hash. That is how stockfish.js 19
// is written: the first hash field is the wasm address.

import jsUrl from "stockfish/bin/stockfish-19-lite-single.js?url";
import wasmUrl from "stockfish/bin/stockfish-19-lite-single.wasm?url";

export type FishScore = { uci: string; cp: number | null; mate: number | null };
export type FishRead = { cp: number | null; mate: number | null; wdl: [number, number, number] | null; depth: number };

export type Fish = {
  move(fen: string, elo: number | "full", movetime: number): Promise<FishScore>;
  /** A short full-strength read. Scores and WDL are from the side to move. */
  read(fen: string): Promise<FishRead>;
  newGame(): Promise<void>;
  stop(): void;
};

export async function openFish(): Promise<Fish> {
  const [js, wasm] = await Promise.all([fetch(jsUrl), fetch(wasmUrl)]);
  if (!js.ok || !wasm.ok) throw new Error("Stockfish lite failed to load.");
  const jsBlob = URL.createObjectURL(new Blob([await js.blob()], { type: "text/javascript" }));
  const wasmBlob = URL.createObjectURL(new Blob([await wasm.blob()], { type: "application/wasm" }));
  const worker = new Worker(`${jsBlob}#${encodeURIComponent(wasmBlob)}`);
  const wait = once(worker, (line) => line === "uciok");
  worker.postMessage("uci");
  await wait;
  worker.postMessage("setoption name UCI_ShowWDL value true");
  await ready(worker);

  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(job, job);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    stop() {
      worker.postMessage("stop");
    },
    newGame() {
      return enqueue(async () => {
        worker.postMessage("ucinewgame");
        await ready(worker);
      });
    },
    move(fen, elo, movetime) {
      return enqueue(async () => {
        worker.postMessage(`setoption name UCI_LimitStrength value ${elo === "full" ? "false" : "true"}`);
        if (elo !== "full") worker.postMessage(`setoption name UCI_Elo value ${elo}`);
        worker.postMessage("setoption name Threads value 1");
        await ready(worker);
        worker.postMessage(`position fen ${fen}`);
        let cp: number | null = null;
        let mate: number | null = null;
        let uci = "";
        await once(
          worker,
          (line) => {
            if (line.startsWith("info ") && line.includes(" score ") && !line.includes("bound")) {
              const parts = line.split(" ");
              const at = parts.indexOf("score");
              const kind = parts[at + 1];
              const value = Number(parts[at + 2]);
              if (kind === "cp" && Number.isFinite(value)) {
                cp = value;
                mate = null;
              } else if (kind === "mate" && Number.isFinite(value)) {
                mate = value;
                cp = null;
              }
            }
            if (!line.startsWith("bestmove")) return false;
            uci = line.split(" ")[1] ?? "";
            return true;
          },
          `go movetime ${movetime}`,
        );
        if (!uci || uci === "(none)" || uci === "0000") uci = "";
        return { uci, cp, mate };
      });
    },
    read(fen) {
      return enqueue(async () => {
        worker.postMessage("setoption name UCI_LimitStrength value false");
        worker.postMessage("setoption name Threads value 1");
        await ready(worker);
        worker.postMessage(`position fen ${fen}`);
        let cp: number | null = null;
        let mate: number | null = null;
        let wdl: [number, number, number] | null = null;
        let depth = 0;
        await once(
          worker,
          (line) => {
            if (line.startsWith("info ") && line.includes(" score ") && !line.includes("bound")) {
              const parts = line.split(" ");
              const at = parts.indexOf("score");
              const kind = parts[at + 1];
              const value = Number(parts[at + 2]);
              const d = Number(parts[parts.indexOf("depth") + 1]);
              if (Number.isFinite(d)) depth = d;
              if (kind === "cp" && Number.isFinite(value)) {
                cp = value;
                mate = null;
              } else if (kind === "mate" && Number.isFinite(value)) {
                mate = value;
                cp = null;
              }
              const w = parts.indexOf("wdl");
              if (w > 0) {
                const a = Number(parts[w + 1]);
                const b = Number(parts[w + 2]);
                const c = Number(parts[w + 3]);
                if ([a, b, c].every(Number.isFinite)) wdl = [a, b, c];
              }
            }
            return line.startsWith("bestmove");
          },
          "go depth 8",
        );
        return { cp, mate, wdl, depth };
      });
    },
  };
}

function ready(worker: Worker): Promise<void> {
  const pending = once(worker, (line) => line === "readyok");
  worker.postMessage("isready");
  return pending;
}

function once(worker: Worker, done: (line: string) => boolean, command?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(new Error("Stockfish lite did not answer."));
    }, 20000);
    const onMessage = (event: MessageEvent) => {
      if (!done(String(event.data))) return;
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      resolve();
    };
    worker.addEventListener("message", onMessage);
    if (command) worker.postMessage(command);
  });
}
