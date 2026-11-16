# 00 — Initial Proposal (Archived)

> **Status:** Superseded — kept verbatim for provenance.
> **Superseded by:** [`02-field-model.md`](02-field-model.md),
> [`03-move-selection.md`](03-move-selection.md),
> [`04-strength-control.md`](04-strength-control.md).
> **Review:** [`01-proposal-review.md`](01-proposal-review.md) lists every defect
> found in this text and how it was resolved.
>
> This text is also the definition of the **as-proposed baseline** ("Nabla-P")
> used in the ablation study (hypothesis H1 in
> [`../research/hypotheses-and-protocol.md`](../research/hypotheses-and-protocol.md)).
> It is reproduced as submitted on 2026-11-16. The only edits are typographic, so
> that GitHub renders the text: heading levels, list indentation, display
> equations in fenced `math` blocks, and set braces written as `\lbrace \rbrace`.

---

## The Potential-Field / Physics-Simulation Engine (No Tree Search)

- The CS Shift: Replace discrete if/else chess heuristics with continuous field equations (like electrostatic potential or fluid dynamics).
- How it works: Treat every piece as a charge emitter that radiates an influence field across legal ray/knight vectors:
  - Your pieces emit positive potential; enemy pieces emit negative potential.
  - The enemy King acts as a massive gravitational sink / attractor.
  - Pawns act as dielectric barriers / walls that attenuate fields unless pierced by open files.
- Why it's mind-boggling: You compute a 64-square scalar potential tensor (and a gradient vector field) for the board. Moves are chosen by following the gradient of maximum energy convergence around the enemy king while minimizing local tension instability—essentially playing chess like a physics simulation rather than a tree search. Even cooler: you can render the live heatmaps and force vectors directly on the Chess.com board in your extension.

Interestingly, a niche project called **Flow Field Chess** (`gamedev.tech/games/ffce`) explores a related fluid-diffusion concept in Rust/WASM, confirming that Rust → WebAssembly is the ideal stack for real-time field simulation in the browser. However, modeling chess strictly via **electrostatic ray-permittivity tensors, Static Exchange repulsion barriers, and Hamiltonian energy minimization** with a full **UCI protocol interface** (so you can pit it directly against Stockfish, Maia, and human players across Elo brackets) is completely yours to build from the ground up.

---

### 1. System Architecture Overview

To support both an interactive web playground (with live field visualizations) and automated Elo gauntlet matches against Stockfish/Maia bots, design the engine around two decoupled layers:

```text
┌────────────────────────────────────────────────────────────────────┐
│                        FRONTEND / ARENA RUNNER                     │
│  ┌──────────────────────────────┐  ┌────────────────────────────┐  │
│  │   Web UI + Canvas Renderer   │  │  Automated Gauntlet Runner │  │
│  │  (Live Heatmaps & Vectors)   │  │  (vs Stockfish / Maia /    │  │
│  └──────────────┬───────────────┘  │   Lichess / Cutechess)     │  │
│                 │                  └─────────────┬──────────────┘  │
└─────────────────┼────────────────────────────────┼─────────────────┘
                  │ JSON / TypedArray              │ Standard UCI
                  ▼                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                  RUST CORE ENGINE (WASM + Native CLI)              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Legal Move & Bitboard Layer (`cozy-chess` / `shakmaty`)  │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  2. Tensor Field Solver (Zero Tree Search)                   │  │
│  │     • Scalar Potential Φ[64]   • Gradient Vector Field ∇Φ[64]│  │
│  │     • Permittivity Matrix ε[64]• Exchange Barrier V_rep[64]  │  │
│  │     • Piece Momentum Memory M[32]                            │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  3. Move Selector (1-Ply Post-Move Action Principle / Softmax)│  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

* **Dual Compilation Targets:** Compiling the Rust core to both **`wasm32-unknown-unknown`** (for your website via `wasm-bindgen`) and a **native CLI binary** (speaking standard Universal Chess Interface — `uci`, `position fen`, `go`, `bestmove`) allows you to run thousands of automated headless games at native CPU speed using `cutechess-cli` or `fastchess` while serving the exact same engine on your website.

---

### 2. Mathematical Formulation of the Field Solver

Every board state $S$ is transformed into a set of continuous `f32` tensors over the 64 squares ($i \in \lbrace 0 \dots 63 \rbrace$).

#### Step A: Medium Permittivity Tensor ($\varepsilon[64] \in [0, 1]$)

In electrostatics, permittivity determines how easily an electric field penetrates a medium. On a chessboard, squares have anisotropic conductivity:

* **Empty square:** $\varepsilon_i = 1.0$ (free space — zero attenuation).
* **Friendly piece on square $i$:** $\varepsilon_i = 0.42$ (semi-permeable conductor — allows sliding pieces behind it to exert **X-ray pressure**, naturally incentivizing Rook/Queen batteries and Alekhine's guns).
* **Enemy Pawn on square $i$:** $\varepsilon_i = 0.08$ (strong dielectric barrier — blocks ray propagation unless broken open).
* **Enemy Minor/Major Piece on square $i$:** $\varepsilon_i = 0.15$ (models pin pressure on the piece behind it, such as pinning a Knight to a King or Queen).

#### Step B: Anisotropic Piece Charge Propagation ($\Phi_{\text{pieces}}[64]$)

Each piece $p$ of side $s \in \lbrace +1 \text{ (White)}, -1 \text{ (Black)} \rbrace$ has an intrinsic charge $q_p$:

```math
q_P = 1.0, \quad q_N = 3.2, \quad q_B = 3.3, \quad q_R = 5.0, \quad q_Q = 9.0, \quad q_K = 2.5
```

* **Sliding Pieces (Rook, Bishop, Queen):** Emit charge along each legal ray direction $\vec{d}$. At step $k$ along the ray (square $i_k$), the cumulative transmittance $T_k$ is the product of permittivities of all intermediate squares:

```math
T_k = \prod_{j=1}^{k-1} \varepsilon_{i_j}, \qquad \Delta\Phi(i_k) = s \cdot q_p \cdot \frac{T_k}{1 + \lambda k}
```

  where $\lambda \approx 0.12$ is a gentle distance-decay constant so closer threats exert stronger pressure than distant ones. Stop propagating along a ray once $T_k < 0.02$.
* **Leapers (Knights & Kings):** Emit unattenuated charge $s \cdot q_p$ directly onto their target squares (plus a second-order "halo" of $0.25 \cdot s \cdot q_p$ onto squares 2 knight-hops away, giving Knights a natural sense of outpost convergence).
* **Pawns:** Emit directional diagonal attack charge ($s \cdot 1.4$) on their two capture squares, plus a forward promotion potential gradient scaled exponentially by rank:

```math
\Delta\Phi_{\text{promo}}(i) = s \cdot 0.35 \cdot e^{0.55 \cdot \text{rank}_s(i)}
```

  This automatically drives passed pawns toward promotion in endgames without a single hardcoded endgame rule.

#### Step C: The King Gravitational Sink ($\Phi_{\text{king}}[64]$)

To give the engine a unified global objective without tree search, each King creates an attractive potential well centered on its square $\vec{r}_K$:

```math
\Phi_{\text{king}}(i) = -s_K \cdot \frac{G_K}{1 + \Vert \vec{r}_i - \vec{r}_K \Vert_2^2}
```

where $G_K$ scales inversely with the opponent's remaining material (high $G_K$ in the middlegame to drive mating attacks; lower $G_K$ in stripped endgames so the engine prioritizes pawn promotion and centralizing its own King).

#### Step D: Short-Range Nuclear Repulsion (Static Exchange Stability $V_{\text{rep}}[64]$)

Without this term, a pure potential engine will sacrifice its Queen onto a square next to the enemy King simply because $\Phi_{\text{king}}$ is huge there.
For every square $i$, compute the **Static Exchange Evaluation (SEE)** balance $\text{SEE}_s(i)$ using bitboard attacker sets sorted from lowest charge ($P$) to highest ($Q$):

* If moving a piece of charge $q_p$ to square $i$ yields $\text{SEE}_s(i) < 0$, apply a steep repulsive potential barrier:

```math
V_{\text{rep}}(i, p) = \kappa \cdot \text{SEE}_s(i) \quad (\text{with } \kappa \approx 2.5)
```

This acts like the **Pauli exclusion principle**: pieces can orbit the enemy King at high potential, build batteries, and launch sacrifices *only* when the combined friendly field overwhelms the enemy defenders ($\text{SEE}_s(i) \ge 0$).

#### Step E: Spatial Gradient Vector Field ($\nabla\Phi[64]$)

For every square $(x, y)$, compute the 2D discrete spatial gradient using a Sobel/central-difference kernel over $\Phi_{\text{total}} = \Phi_{\text{pieces}} + \Phi_{\text{king}}$:

```math
\nabla\Phi(x, y) = \left( \frac{\Phi(x+1, y) - \Phi(x-1, y)}{2}, \; \frac{\Phi(x, y+1) - \Phi(x, y-1)}{2} \right)
```

This vector field tells you at a glance which way tactical energy is flowing across the board—and renders directly onto your website's HTML5 Canvas as animated streamlines.

---

### 3. Move Selection: The Principle of Least Action (No Tree Search)

In physics, a system evolves along the path that optimizes its **Lagrangian** ($\mathcal{L} = T - V$). Instead of searching a minimax tree, your engine generates all legal moves $m \in \mathcal{M}(S)$ (typically ~30 moves), applies each move to produce state $S' = \text{apply}(S, m)$ in microseconds, recomputes the post-move field $\Phi(S')$, and scores the resulting state using a single global **Field Hamiltonian** $H(S')$:

```math
H(S') = \underbrace{\sum_{i=0}^{63} \Phi_{\text{total}}(S')_i}_{\text{Net Field Dominance}} + \underbrace{w_{\text{king}} \sum_{i \in \text{Zone}(K_{\text{opp}})} \Phi_{\text{pieces}}(S')_i}_{\text{King Zone Convergence}} - \underbrace{w_{\text{hang}} \sum_{p \in \text{Friendly}} \max\left(0, -\text{SEE}(p)\right)}_{\text{Unprotected Piece Tension}} + \underbrace{w_{\text{mom}} \cdot (\vec{v}_m \cdot \vec{M}_p)}_{\text{Piece Momentum}}
```

1. **Unprotected Piece Tension (`w_hang`):** Checks every friendly piece on the board in $S'$ (not just the moved piece!). If a move leaves another piece hanging to a newly opened line or fails to defend an attacked piece, its SEE tension penalty spikes—giving the engine full 1-ply defensive awareness across the entire board.
2. **Piece Momentum ($\vec{M}_p$):** Stores a decaying exponential moving average of each piece's displacement vector over the last 3 turns. Multiplying the move vector $\vec{v}_m$ by $\vec{M}_p$ prevents pieces from oscillating back and forth in local potential minima (`Nf3 -> Ng1 -> Nf3`) and encourages sustained, multi-move maneuvers (like transferring a Rook from `a1` → `e1` → `e6`).
3. **Temperature / Elo Calibration ($\tau$):** Sample the chosen move via a Softmax over $H(S')$:

```math
P(m) = \frac{\exp(H(S') / \tau)}{\sum_{m'} \exp(H(S'') / \tau)}
```

* $\tau \to 0.01$: Deterministic peak gradient ascent (strongest play).
* $\tau \in [0.5, 4.0]$: Stochastic, exploratory play that lets you tune the engine's strength and unpredictability smoothly.

---

### 4. Performance & Implementation Stack (Rust → WASM + Native)

* **Board & Move Generation:** Use **`cozy-chess`** (v0.3.4) or **`shakmaty`** (v0.30.2) in Rust. Both use precomputed magic bitboards, execute zero heap allocations during move generation, and compile cleanly to `wasm32-unknown-unknown`.
* **Execution Speed:** Computing $\Phi[64]$, $\nabla\Phi[64]$, and bitboard SEE across 64 squares takes **~3–5 microseconds** in optimized Rust (`--release`). Evaluating all ~35 legal candidate moves takes **~0.15 milliseconds per turn** (~6,500 full field evaluations per second on a single thread)—meaning moves feel instantaneous on the web and a 1,000-game automated benchmark finishes in seconds.
* **WASM Bridge (`wasm-bindgen`):** Expose a single struct `FieldEngine` to JavaScript with:
  * `evaluate_fen(fen: &str, tau: f32) -> JsValue` returning `{ best_move, candidate_scores, scalar_field: Float32Array(64), gradient_x: Float32Array(64), gradient_y: Float32Array(64), tension_field: Float32Array(64) }`.

---

### 5. Website & Automated Gauntlet Setup

#### A. Interactive Web Lab

Build a clean split-screen web app (React/Svelte + Canvas/SVG overlay):

* **Left Panel (Interactive Board):** Play against your engine with toggleable physics layers rendered directly over the squares:
  * *Scalar Potential Heatmap:* Blue/Red radial glow showing territorial dominance.
  * *Gradient Vector Field:* Animated arrows showing the directional force pulling pieces toward weak zones.
  * *Dielectric & Tension View:* Highlights pinned/X-rayed pieces and high-tension flashpoint squares.
* **Right Panel (Live Physics Sliders):** Let users tweak the laws of physics mid-game—crank up **King Gravity ($G_K$)** for reckless sacrifices, increase **Pawn Permittivity ($\varepsilon_P$)** so pieces ignore closed pawn chains, or raise **Temperature ($\tau$)** for chaotic play—and watch the gradient arrows shift in real time.

#### B. Automated Elo Benchmarking Pipeline

Because your Rust core also compiles to a native CLI binary speaking **UCI**, you can automate round-robin gauntlets locally using **`fastchess`** (the modern, high-speed successor to `cutechess-cli`):

1. **Opponent Pool:**
   * `stockfish` configured with `UCI_LimitStrength=true` at `1320`, `1500`, `1700`, `1900`, and `2100` Elo.
   * `maia` weights (`maia-1100`, `maia-1500`, `maia-1900`) run via `lc0` for human-like baselines.
   * Baseline classical engines (`js-chess-engine` or depth-1/depth-2 alpha-beta bots) for the `600–1200` Elo bracket.
2. **Fitness Tuning Loop:** Run 500-game gauntlets (`tc=10+0.1`) across diverse opening books (e.g., `UHO_Lichess_4852_v1.epd`) and use **SPSA (Simultaneous Perturbation Stochastic Approximation)** to automatically tune your physics constants ($\lambda, G_K, \kappa, w_{\text{king}}, w_{\text{hang}}, w_{\text{mom}}$) to maximize Elo without ever adding a search tree.

---

### Recommended Build Order

1. **Milestone 1 (Core CLI + UCI):** Create a Cargo workspace with `field-core` (library) and `field-uci` (CLI binary) using `cozy-chess`. Implement $\Phi_{\text{pieces}}$, $\Phi_{\text{king}}$, and bitboard SEE, then verify it completes full legal games against Stockfish 1320 in `fastchess`.
2. **Milestone 2 (Physics Tuning):** Add the permittivity matrix $\varepsilon$, piece momentum $\vec{M}_p$, and `w_hang` full-board tension check; run a 200-game gauntlet to measure its baseline Elo.
3. **Milestone 3 (WASM + Web Visualizer):** Add `field-wasm` via `wasm-pack`, export the `Float32Array` field tensors, and build the interactive board with live gradient streamlines and physics parameter sliders.

### Why Flow Field Chess Fails (And Why Our Approach Fixes It)

1. **No Defensive Awareness (Hanging Pieces):** Flow Field Chess pushes pieces along fluid vectors without checking if the target square is defended. Our architecture introduces **Layer 2 (Static Exchange Evaluation / SEE Repulsion Barriers)**, which acts like the Pauli exclusion principle: no piece can move to a square where it loses the exchange. If an opponent threatens a piece, the local tension spike forces an immediate defense or retreat.
2. **No Ray Permittivity (Blindness to Batteries & Pins):** Fluid models treat the board as an open medium, ignoring the tactical geometry of ray pieces. Our **Permittivity Matrix ($\varepsilon$)** models pawns as dielectric barriers and friendly pieces as semi-permeable conductors, giving your engine a natural understanding of Rooks and Queens forming batteries and pinning enemy pieces.
3. **No Global Goal Alignment:** Flow field models lack a focused objective. Our **King Gravitational Sink ($\Phi_{\text{king}}$)** creates a dynamic attractive well that scales with game phase, ensuring every piece coordinates to pressure the enemy king.

### How to Make Our Physics Engine Truly Dangerous

If you want to push our electrostatic/gradient approach from a cool toy into a genuinely formidable engine without adding a heavy minimax tree, you can add one minor upgrade: **A 2-Ply Tactical Lookahead (Mini-Minimax)**.

* Instead of evaluating just the immediate next state ($S'$), let the engine look 1 ply deeper for the opponent's *forced recapture* (`apply -> opponent's best response -> evaluate`).
* Because the field evaluation takes only ~3 microseconds, running a 2-ply check across 30 legal moves takes **< 0.1 milliseconds**, letting you weed out 1-move blunders completely while keeping the core physics-driven personality intact.
