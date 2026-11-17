import { spawnSync } from "node:child_process";
import path from "node:path";

const home = process.env.USERPROFILE || process.env.HOME;
const bin = path.join(home, ".cargo", "bin");
const exe = process.platform === "win32" ? ".exe" : "";
const root = path.resolve(import.meta.dirname, "../..");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(path.join(bin, `cargo${exe}`), [
  "build",
  "-p",
  "nabla-wasm",
  "--release",
  "--target",
  "wasm32-unknown-unknown",
]);
run(path.join(bin, `wasm-bindgen${exe}`), [
  "--target",
  "web",
  "--out-dir",
  "web/src/engine",
  "target/wasm32-unknown-unknown/release/nabla_wasm.wasm",
]);
