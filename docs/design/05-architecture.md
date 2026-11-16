# 05 — System Architecture

> **Status:** Draft v0.2 · **Implemented:** native UCI engine (v0.1); WebAssembly
> module planned for Milestone 6 · **Depends on:** 02, 03, 04 · **Decisions:**
> D-005, D-008, D-010 in [`../decisions.md`](../decisions.md)

Nabla is one Rust engine core compiled to two targets: a native command-line
binary that speaks UCI (for match runners and GUIs) and a WebAssembly module (for
the visualisation lab). Both targets run the **same code** and must produce
**bit-identical** analyses.

---

## 1. Goals and constraints

| ID | Goal or constraint |
| --- | --- |
| A1 | One core, two targets: native UCI and `wasm32-unknown-unknown`. |
| A2 | Bit-identical evaluation, selection, and sampling across targets (§6). |
| A3 | The core performs no I/O, has no global state, and contains no `unsafe` code of its own (`#![forbid(unsafe_code)]`). |
| A4 | Every coefficient comes from one parameter set with a stable hash (02 §9, 04 §4.2). |
| A5 | Every evaluation is explainable term by term (03 §6). |
| A6 | Correctness is enforced by automated tests before any strength claim (§7). |

---

## 2. System context

```mermaid
flowchart TB
    subgraph Clients
        FC["fastchess<br/>(gauntlets, SPRT)"]
        GUI["Chess GUIs"]
        LAB["Visualisation lab<br/>(browser, Web Worker)"]
        TUNE["Tuning and calibration scripts"]
    end
    subgraph Nabla
        UCI["nabla-uci<br/>binary: nabla"]
        WASM["nabla-wasm<br/>(planned)"]
        CORE["nabla-core<br/>fields · energy · SEE · selection · policy"]
    end
    FC -- UCI --> UCI
    GUI -- UCI --> UCI
    TUNE -- "UCI options" --> UCI
    LAB -- "JS API, typed arrays" --> WASM
    UCI --> CORE
    WASM --> CORE
    CORE --> BOARD["shakmaty<br/>rules, attacks, Zobrist"]
    CORE --> LIBM["libm<br/>portable exp, log1p, tanh"]
```

---

## 3. Repository layout

```text
Nabla/
├── Cargo.toml                   # workspace (edition 2024, MSRV 1.97)
├── crates/
│   ├── nabla-core/              # library: no I/O, forbid(unsafe_code)
│   │   ├── src/
│   │   │   ├── board.rs         # adapter over shakmaty: relative iteration, phase, flip
│   │   │   ├── transport.rs     # rays, transmittance, per-side fields (02 §4)
│   │   │   ├── see.rs           # static exchange evaluation (02 §5.4)
│   │   │   ├── energy/          # one module per term (02 §5) + decomposition
│   │   │   ├── select.rs        # boundary conditions, levels 0–2 (03)
│   │   │   ├── policy.rs        # Boltzmann policy, counter-based RNG (04 §2)
│   │   │   └── params.rs        # the 57 coefficients, fixed constants, hash
│   │   └── tests/               # invariant tests (§7)
│   └── nabla-uci/               # binary `nabla`: UCI loop, options, analysis commands
└── docs/
```

Planned additions: `crates/nabla-wasm` (Milestone 6), `params/*.toml` and
`tools/` for tuning (Milestone 4), `calibration/elo-map.toml` (Milestone 5), and
`web/` for the lab (Milestone 6). The board library sits behind `board.rs`, so
replacing it touches one module (decision D-005).

---

## 4. Native UCI binary

**Standard commands:** `uci`, `isready`, `ucinewgame`, `setoption`,
`position [startpos | fen <FEN>] [moves …]`, `go`, `stop`, `ponderhit`, `quit`.
`go` accepts every standard limit. The clock (`wtime`, `btime`, `winc`, `binc`),
`movetime`, or `nodes` becomes a node budget for the core (03 §7); `depth` and
`mate` are accepted and ignored. Under `go infinite` or `go ponder` there is no
budget and `bestmove` is held until `stop` or `ponderhit`. With no legal moves the
reply is `bestmove 0000`.

**Public options:** as listed in 04 §5.

**Hidden options** (not shown by `uci`, accepted by `setoption`):

| Option | Purpose | Status |
| --- | --- | --- |
| `Param_<symbol>` | Integer-scaled ($`\times 1000`$) override of any coefficient in 02 §9, for SPSA. | Implemented |
| `Ablate_<term>` | `true` disables one energy term (`mat`, `flux`, `terr`, `ex`, `king`, `trop`, `pawn`, `conf`, `tempo`). | Implemented |
| `ParamsFile` | Load a complete parameter set from TOML. | Milestone 4 |
| `ResearchDepth` | Enables the AB-*d* research control (03 §4.5). | Milestone 7 |

**Analysis commands** (not part of UCI):

| Command | Output |
| --- | --- |
| `eval` | Energy decomposition of the current position, per term. |
| `explain [n]` | The top $n$ candidates with score, probability, and per-term gradient (03 §6). |
| `fields` | The influence fields and the control field as 8×8 tables. |
| `bench [level]` | Fixed 16-position suite at the given level (default 2): nodes, evaluations, speed, mean decision time, move checksum, parameter hash. Also runs as `nabla bench [level]`. |
| `d` | The current position as FEN. |

The Level 2 `bench` checksum changes whenever evaluation or search behaviour
changes. Commits that change it state the new value as `Bench: <checksum>`, so
unintended behavioural changes are caught in review (a practice adopted from
Stockfish development).

---

## 5. WebAssembly API (planned, Milestone 6)

The lab runs the module inside a **Web Worker** so analysis never blocks rendering.
The interface, shown from the JavaScript side:

```ts
class FieldEngine {
  constructor(paramsToml?: string);
  analyze(fen: string, history: string[], options: AnalyzeOptions): Analysis;
  explainSquare(fen: string, square: number): Source[];   // who contributes to one square
  setParam(symbol: string, value: number): void;
  params(): ParamInfo[];            // symbol, value, range, group: drives the sliders
}

interface AnalyzeOptions {
  level: 0 | 1 | 2;
  temperature: number;              // pawn units
  seed: number;
  game: number;                     // game counter for the policy key (04 §2)
  multiPv: number;
}

interface Analysis {
  bestMove: string;                 // UCI notation
  candidates: Candidate[];          // sorted by exact score
  energy: Terms & { total: number };
  fields: {                         // Float32Array(64) each, LERF order (a1 = 0)
    directW: Float32Array;  directB: Float32Array;
    xrayW: Float32Array;    xrayB: Float32Array;
    net: Float32Array;      tension: Float32Array;  control: Float32Array;
    fluxWx: Float32Array;   fluxWy: Float32Array;
    fluxBx: Float32Array;   fluxBy: Float32Array;
    gradX: Float32Array;    gradY: Float32Array;
  };
  diagnostics: {
    kingPressure: [number, number]; // P_W, P_B (02 Eq. 17)
    shelter: [number, number];      // H_W, H_B (02 Eq. 18)
    passage: Float32Array;          // T^pass on squares holding a pawn, else 0 (02 Eq. 21)
    unstoppable: Float32Array;      // u_p on squares holding a pawn, else 0 (02 Eq. 23)
    confinement: Uint8Array;        // 1 on the defending king's region R (02 §5.8)
    threatsW: Uint8Array;           // SEE gain for White capturing on each square (02 §5.4)
    threatsB: Uint8Array;           // SEE gain for Black capturing on each square
  };
  meta: { level: number; nodes: number; paramsHash: string; engineVersion: string };
}

interface Candidate {
  uci: string;  san: string;
  q: number;                        // exact root score, pawn units, mover's perspective
  prob: number;                     // Boltzmann probability (04 §2)
  terms: Terms | null;              // per-term gradient (03 §6); null for terminal lines
  pv: string[];                     // principal variation
}

interface Source {
  from: number;                     // square of the contributing piece
  piece: string;                    // e.g. "wQ"
  channel: "direct" | "xray";
  value: number;                    // contribution to Φ_c on the queried square
}

interface Terms {
  mat: number; flux: number; terr: number; ex: number; king: number;
  trop: number; pawn: number; conf: number; tempo: number;
}
```

Typed arrays are transferred, not copied, between the worker and the page.

---

## 6. Determinism and numerics

Bit-identical results across targets (A2) and exact colour antisymmetry (02 §6)
rest on six rules, all followed by the v0.1 code:

1. **`f32` in evaluation, no fused multiply-add.** Rust does not contract
   floating-point operations by default, and baseline WebAssembly has no fused
   operations.
2. **Colour-relative iteration.** Each side visits its pieces and squares in its
   own relative order (`board::rel_squares`), ray directions are stored in relative
   form, and ties that change results are broken in relative order. No hash-map
   iteration occurs on evaluation paths.
3. **Per-side accumulation.** Each term is computed as a White part minus a Black
   part with identical code paths.
4. **Portable transcendental functions.** `exp`, `log1p`, and `tanh` come from the
   `libm` crate, never from `std`, whose implementations differ between native
   targets and WebAssembly. `powi` is not used; `sqrt` and the basic operations are
   correctly rounded everywhere.
5. **Counter-based randomness** keyed by seed, game counter, position hash, and
   ply (04 §2).
6. **Parameter hash:** FNV-1a (64-bit) over the canonical `name=value`
   serialisation of the parameter set, printed as 16 hexadecimal digits. It
   identifies a parameter set; it is not a security hash.

---

## 7. Testing strategy

All tests run with `cargo test --release` (the random-position tests are heavy in
debug builds).

| Layer | Test (v0.1) | File |
| --- | --- | --- |
| Parameters | 57 tunable coefficients; hash changes with any coefficient; $`\mathrm{NPM}_0 = 32`$ | `tests/params.rs` |
| SEE | Reference positions (undefended capture; defended capture losing 2 through X-ray recaptures); the king cannot capture a defended piece | `tests/exchange_and_fields.rs` |
| Transport | Field support within the attack sets; battery and blocker transmission values | `tests/exchange_and_fields.rs` |
| Pawns | Front-span predicate equals the attack-based characterisation of Eq. (21) on random positions; an adjacent defending king with the move stops an unstoppable passer | `tests/exchange_and_fields.rs`, `tests/selection.rs` |
| Exchange | Capture and parry are exclusive; a side in check cannot parry; Level ≥ 1 reduces to the fork term | `src/energy/exchange.rs` (unit) |
| Symmetry | Exact per-term colour antisymmetry on more than 10,000 random positions, with and without the realisable-capture term; file-mirror invariance to $10^{-4}$ | `tests/symmetry.rs` |
| Selection | Mate in one found at every level; no stalemate when winning; Level 2 never allows an avoidable mate in one; Level 0 finds a checking fork; repetition scored as a draw with contempt; a node budget is respected and deterministic | `tests/selection.rs` |
| Explanations | Per-term gradients sum to $`Q(m) - e(S)`$ at every level | `tests/selection.rs` |
| Policy | Deterministic at $\tau = 0$; reproducible with a seed; sample frequencies match $\pi_\tau$; the gap cap keeps mate distances ordered | `tests/selection.rs` |
| Protocol | UCI compliance: `fastchess --compliance` passes all 40 checks (fastchess 1.8.3) | Run manually; CI from Milestone 1 close |
| Regression | Level 2 `bench` checksum stated in behaviour-changing commits | Commit messages |
| Cross-target | Native and WebAssembly analyses bit-identical on a golden set | Milestone 6 |
| Calibration | `elo-map.toml` hash equals the current parameter hash | Milestone 5 |

`cargo fmt --all` and `cargo clippy --all-targets -- -D warnings` must pass. The
continuous-integration workflow (`.github/workflows/ci.yml`) runs formatting,
linting, the tests, the bench, and the fastchess compliance check.

---

## 8. Performance budget

| Quantity | Budget (native, one thread) | Measured, v0.1 | Hypothesis |
| --- | --- | --- | --- |
| One visited position (fields + energy + move generation) | ≤ 10 µs | ≈ 7 µs | P-1 |
| Level 0 decision | ≤ 1 ms | 0.3 ms | P-2 |
| Level 1 decision | ≤ 10 ms | 7.8 ms | P-2 |
| Level 2 decision | ≤ 100 ms | 14.6 ms | P-2 |
| WebAssembly slowdown vs native | ≤ 3× | — | P-3 |
| Lab re-analysis at Level 0 after a slider change | ≤ 16 ms (one frame at 60 Hz) | — | P-3 |

Measured with `nabla bench <level>` on an Intel i7-7700HQ (2017 laptop CPU) under
WSL2. Incremental field updates are **not** planned: full recomputation fits the
budget, and incremental schemes would complicate exactness (A2).

---

## 9. Error handling

- **UCI:** malformed input (invalid FEN, illegal move, unknown or out-of-range
  option) produces `info string error: <reason>` and leaves the previous state
  unchanged. The loop never panics on external input; all parsing returns `Result`.
- **WebAssembly:** errors will surface as JavaScript exceptions with the same messages.
- **Core:** functions take validated positions (the adapter enforces legality), so
  the core has no error paths for impossible states.

---

## 10. Dependencies

| Crate | Role | Licence | Status (2026-11-17) |
| --- | --- | --- | --- |
| `shakmaty` 0.30.2 | Rules, attacks, FEN/SAN/UCI parsing, Zobrist hashing | GPL-3.0-or-later | In use; maintained; `no_std`-capable |
| `libm` 0.2 | Portable `exp`, `log1p`, `tanh` (rule 4 of §6) | MIT / Apache-2.0 | In use |
| `wasm-bindgen`, `js-sys` | WebAssembly bindings | MIT / Apache-2.0 | Milestone 6 |
| `serde`, `toml` | Parameter files | MIT / Apache-2.0 | Milestone 4 |

All licences are compatible with GPL-3.0-or-later (decision D-008). New
dependencies require a decision-log entry.
