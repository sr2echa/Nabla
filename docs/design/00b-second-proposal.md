# 00b — Second Proposal: "Physics-Informed Chess Engine" Audit (Archived)

> **Status:** Archived verbatim for provenance · **Received:** 2026-11-16
> · **Verified in:** [`01b-second-proposal-review.md`](01b-second-proposal-review.md)
>
> This text was submitted as an audit and refinement of
> [`00-initial-proposal.md`](00-initial-proposal.md). Each of its claims is
> checked in the linked review. The only edits are typographic, so that GitHub
> renders the text: display equations in fenced `math` blocks, some inline
> equations in GitHub's `` $`…`$ `` form, script and bold letters written as
> Unicode, and set braces written as `\lbrace \rbrace`.

---

This is a sharp, well-grounded architecture for a **Physics-Informed Chess Engine (PICE). Framing chess state evaluation as solving a discrete boundary-value problem on an $8 \times 8$ anisotropic lattice rather than searching a game tree is genuinely novel and hits the exact sweet spot for a systems/AI research paper (e.g., *ICGA Journal*, *IEEE Transactions on Games*, or a NeurIPS/AAAI workshop on non-tree-search game playing).

Below is a rigorous audit, mathematical refinement, full academic/engineering documentation blueprint, and interactive visualization plan so your codebase and your paper evolve in lockstep from Day 1.

---

## Part 1: Critical Audit & Mathematical Refinements

Before writing a line of Rust, we need to fix five subtle mathematical flaws in the baseline formulation that would otherwise cause pathological play or invalidate your paper's claims.

### 1. The Sign-Symmetry Bug in the Hamiltonian

Look closely at the proposed Hamiltonian:

```math
H(S') = \sum_{i=0}^{63} \Phi_{\text{total}}(S')_i + \dots
```

If White pieces emit $+q$ and Black pieces emit $-q$, then $\sum \Phi_{\text{total}}$ is positive when White is winning and negative when Black is winning.

* **The Bug:** If Black is searching for a move to maximize $`H(S')`$, Black will try to make $`\sum \Phi_{\text{total}}`$ *more positive*—meaning Black will intentionally blunder its own Queen to help White!
* **The Fix (Side-to-Move Canonicalization):** Always define the Hamiltonian from the perspective of the moving side $`c \in \lbrace +1, -1 \rbrace`$, OR define $`\Phi`$ strictly in **Ego-Centric Coordinates** (Friendly = $`+q`$, Enemy = $`-q`$). Using Ego-Centric coordinates is cleaner for both code and paper notation: every square's potential $`\Phi_i`$ represents net friendly control, and the solver *always* maximizes $`H(S')`$ regardless of whether it plays White or Black.

### 2. The "Suicide by Field" Paradox (Self-Attenuation)

In Step A, a friendly piece on square $i$ has $\varepsilon_i = 0.42$, while an empty square has $\varepsilon_i = 1.0$.

* **The Bug:** Suppose White has a Rook on `e1` radiating down the open `e`-file ($\varepsilon = 1.0$ on all squares). If White moves a Knight to `e4`, $\varepsilon_{e4}$ drops from $1.0$ to $0.42$. The total downstream sum $\sum \Phi$ behind `e4` drops by $58\%$, penalizing the engine for developing pieces into the center!
* **The Fix (Decoupled Material + Field Conservation):**
  1. Include explicit **Intrinsic Material Potential** $\Phi_{\text{mat}}(S') = \sum_{p} s_p q_p$ directly inside the Hamiltonian so developing a piece never "loses" charge simply because it blocks its own ray.
  2. Set friendly piece permittivity higher ($`\varepsilon_{\text{friendly}} \approx 0.70`$) for sliding pieces aligned with the ray (batteries) and lower ($`\varepsilon_{\text{friendly}} \approx 0.25`$) for non-aligned blockers (like blocking your own Bishop with a Pawn).

### 3. Replacing Ad-Hoc Kernel Gradients with Discrete Graph Laplacians

Computing $`\nabla \Phi(x,y)`$ via a Cartesian Sobel kernel (`x+1`, `x-1`) treats the chessboard as Euclidean 2D space. Chess is **non-Euclidean**: `a1` and `b2` are connected for a Bishop, `a1` and `b3` are connected for a Knight, and `a1` and `b1` are disconnected for a Bishop.

* **Paper-Worthy Upgrade:** Define the spatial gradient over the **Piece-Mobility Graph Laplacian** $L_G = D - A$ (or separate mobility adjacency matrices $`A_R, A_B, A_N`$).
* Keep the Cartesian Sobel gradient $\nabla_{\text{cart}}\Phi$ strictly for the **UI Streamline Visualizer** (where smooth 2D arrows look intuitive to humans).
* Use **Flux Divergence** $`\nabla \cdot \vec{J}_i`$ over legal attack graphs in the actual physics solver so "energy flow" obeys chess geometry rather than Euclidean proximity.

### 4. Exact King Safety vs. Static Gravitational Sink

A static inverse-square sink $`\Phi_{\text{king}}(i) = -G_K / (1 + \Vert{}\vec{r}_i - \vec{r}_K\Vert{}^2)`$ pulls pieces toward the enemy King even when the enemy King is safely tucked behind three unmoved pawns (`g2, h2, f2`).

* **The Fix (Shield-Modulated Permeability):** Measure the average permittivity $`\bar{\varepsilon}_{\text{shield}}`$ of the 3 squares directly in front of the enemy King. Scale the effective gravitational constant dynamically:

```math
G_K^{\text{eff}} = G_K^{(0)} \cdot \left(0.2 + 0.8 \cdot (1 - \bar{\varepsilon}_{\text{shield}})\right) \cdot \text{Phase}(S')
```

When the enemy's pawn shield is intact ($`\bar{\varepsilon}_{\text{shield}}`$ is low, high dielectric insulation), $G_K^{\text{eff}}$ stays moderate—telling the engine to maneuver and crack the shell rather than launching premature sacrifices. Once a file opens ($`\bar{\varepsilon}_{\text{shield}} \to 1`$), gravity spikes and pieces flood the zone.

### 5. Maintaining the "Pure Zero-Search" Thesis for Your Paper

If you add a 2-ply mini-minimax search right away, reviewers will dismiss the work as *"just a weird evaluation function inside a shallow minimax tree."*

* **Research Strategy:** Keep **Mode A (Pure 1-Ply Field Action — Zero Tree Search)** as your primary scientific contribution. Prove how far pure field physics + static exchange barriers ($`V_{\text{rep}}`$) + post-move tension (`w_hang`) can go with **0 tree nodes searched**.
* **Mode B (Quiescence / Exchange Relaxation — Optional Ablation):** Instead of minimax, frame capture resolution as **Energy Relaxation** (settling unstable high-tension squares until $`\partial \Phi / \partial t \to 0`$). That preserves your physics metaphor 100% while solving horizon blunders!

---

## Part 2: Complete Formal Specification (Paper-Ready Notation)

You can lift this exact mathematical formulation directly into Section 3 (*Methodology*) of your paper.

### 1. State Space & Tensor Definitions

Let a chess position $`S = (𝒫, c, 𝒞, \text{ep})`$ be mapped onto an $8 \times 8$ discrete lattice $\Omega = \lbrace 0, 1, \dots, 63 \rbrace$, where each square $i = 8r + f$ has rank $r \in \lbrace 0..7 \rbrace$ and file $f \in \lbrace 0..7 \rbrace$. Let $c \in \lbrace +1, -1 \rbrace$ denote the active side to move.

We define four core lattice tensors:

1. **Charge Density Tensor $\rho \in ℝ^{64}$:** Intrinsic piece charge at square $i$, signed relative to active player $c$:

   ```math
   \rho_i = \begin{cases} +q(p_i) & \text{if } p_i \text{ belongs to } c \\ -q(p_i) & \text{if } p_i \text{ belongs to } -c \\ 0 & \text{if } i \text{ is empty} \end{cases}
   ```

   with baseline charges $q = \lbrace P: 1.0, N: 3.15, B: 3.30, R: 5.00, Q: 9.20, K: 2.50 \rbrace$.
2. **Anisotropic Permittivity Tensor $\varepsilon \in (0, 1]^{64}$:** Governs ray transmittance across square $i$:

   ```math
   \varepsilon_i = \begin{cases} 1.00 & \text{empty square} \\ \varepsilon_{\text{ally}} \in [0.45, 0.75] & \text{friendly piece (X-ray / battery coupling)} \\ \varepsilon_{\text{opp\_piece}} \in [0.12, 0.25] & \text{enemy non-pawn piece (pin potential)} \\ \varepsilon_{\text{opp\_pawn}} \in [0.05, 0.12] & \text{enemy pawn (dielectric barrier)} \end{cases}
   ```

3. **Propagated Scalar Field $\Phi_{\text{field}} \in ℝ^{64}$:** Superposition of attenuated ray fields, leaper impulses, and pawn promotion gradients:

   ```math
   \Phi_{\text{field}}(i) = \sum_{p \in 𝒫} \text{sgn}(p) \cdot q_p \cdot 𝒦_p(\text{pos}(p) \to i; \varepsilon)
   ```

   where the propagation kernel $𝒦_p$ is:
   * **Sliding Rays ($`R, B, Q`$):** Along ray $\vec{d}$ at step $k \ge 1$ visiting $i_1, \dots, i_k$:

     ```math
     𝒦_p(i_k) = \frac{\prod_{j=1}^{k-1} \varepsilon_{i_j}}{1 + \lambda (k - 1)}
     ```

   * **Knights ($`N`$):** Direct impulse $1.0$ on 1-hop squares $`j \in 𝒩_1(p)`$, plus second-order outpost halo $\alpha_2 = 0.22$ on 2-hop squares $`m \in 𝒩_2(p)`$ scaled by local square safety.
   * **Pawns ($`P`$):** Attack impulse $1.35$ on diagonal capture squares, plus forward advancement potential along the file:

     ```math
     \Phi_{\text{promo}}(i) = \text{sgn}(p) \cdot \beta_0 e^{\beta_1 \cdot \text{adv}(i)} \cdot 𝕀[\text{passed}(p)]
     ```

4. **King Gravitational Potential $\Phi_{\text{king}} \in ℝ^{64}$:**

   ```math
   \Phi_{\text{king}}(i) = +\frac{G_K^{\text{eff}}}{1 + \Vert{}\vec{r}_i - \vec{r}_{K_{-c}}\Vert{}_2^2} - \frac{G_{\text{self}}}{1 + \Vert{}\vec{r}_i - \vec{r}_{K_c}\Vert{}_2^2}
   ```

   *(Positive attractive well around the enemy King $`K_{-c}`$; mild repulsive pressure if enemies crowd our own King $`K_c`$).*

### 2. Action Selection via the Discrete Field Hamiltonian

For every legal move $`m \in ℳ(S)`$, let $`S' = 𝒯(S, m)`$ be the resulting state. We evaluate the total system energy $`H(S')`$:

```math
H(S') = \underbrace{\sum_{i=0}^{63} \rho_i(S')}_{\text{Material Conservation}} + w_1 \underbrace{\sum_{i=0}^{63} \Phi_{\text{field}}(S')_i}_{\text{Territorial Flux}} + w_2 \underbrace{\sum_{i \in 𝒵(K_{-c})} \Phi_{\text{field}}(S')_i}_{\text{King-Zone Convergence}} - w_3 \underbrace{\sum_{p \in 𝒫_c} \max\big(0, -\text{SEE}_{S'}(p)\big)}_{\text{Exchange Repulsion } V_{\text{rep}}} + w_4 \underbrace{(\vec{v}_m \cdot \vec{M}_p)}_{\text{Momentum}}
```

The policy distribution over legal moves is given by the Boltzmann-Gibbs distribution at temperature $\tau$:

```math
\pi_\tau(m \mid S) = \frac{\exp\big(H(𝒯(S, m)) / \tau\big)}{\sum_{m' \in ℳ(S)} \exp\big(H(𝒯(S, m')) / \tau\big)}
```

---

## Part 3: Repository & Documentation Architecture

To ensure writing the research paper is effortless at the end, structure your repository as a **Literate Research Monorepo** where documentation, mathematical specs, experiment logs, and Rust/TypeScript code live together.

```text
field-chess/
├── docs/                                # Paper-ready living documentation
│   ├── 01_PROBLEM_AND_THESIS.md         # Core hypothesis: Zero-search physics vs tree search
│   ├── 02_MATHEMATICAL_FORMULATION.md   # LaTeX equations, tensor definitions, boundary conditions
│   ├── 03_ARCHITECTURE_AND_RUST_SPEC.md # Bitboard layouts, SIMD/cache design, WASM ABI
│   ├── 04_ABLATION_AND_ELO_BENCHMARKS.md# Auto-populated tables from fastchess gauntlets
│   └── 05_VISUALIZATION_SPEC.md         # Shader/Canvas mapping from tensors to RGBA/vectors
├── crates/
│   ├── field-core/                      # Pure no_std-compatible physics & chess engine
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── board.rs                 # Wrapper over cozy-chess + bitboard helpers
│   │   │   ├── tensors.rs               # Aligned #[repr(C, align(32))] 64-float arrays
│   │   │   ├── permittivity.rs          # ε[64] computation
│   │   │   ├── propagator.rs            # Ray, Knight halo, Pawn & King sink solvers
│   │   │   ├── exchange.rs              # Bitboard Static Exchange Evaluation (SEE)
│   │   │   ├── hamiltonian.rs           # H(S') scorer, Momentum tracker, Softmax sampler
│   │   │   └── params.rs                # Serializable PhysicsConfig (for SPSA tuning)
│   │   └── benches/
│   │       └── field_bench.rs           # Criterion microbenchmarks (ns/eval, nodes/sec)
│   ├── field-uci/                       # Native CLI binary speaking UCI protocol
│   │   └── src/main.rs                  # uci, setoption, position, go, bench, eval-trace
│   └── field-wasm/                      # wasm-bindgen bridge for the interactive web lab
│       └── src/lib.rs                   # Exports typed Float32Arrays + move breakdown
├── experiments/
│   ├── spsa_tuner.py                    # Parameter optimizer driving fastchess
│   ├── gauntlet.sh                      # Automated Stockfish/Maia Elo ladder script
│   └── results/                         # CSV/JSON logs & matplotlib plots for the paper
└── web-visualizer/                      # React + Vite + HTML5 Canvas interactive lab
    ├── src/
    │   ├── components/
    │   │   ├── PhysicsBoard.tsx         # Chessground + multi-layer Canvas overlay
    │   │   ├── VectorStreamlines.tsx    # RK2 particle flow renderer for ∇Φ
    │   │   ├── HamiltonianInspector.tsx # Live bar breakdown of H(S') per candidate move
    │   │   └── PhysicsControls.tsx      # Real-time sliders for G_K, ε, λ, w_hang, τ
    │   └── workers/engine.worker.ts     # Non-blocking WASM execution thread
```

---

## Part 4: Designing the "How It Thinks" Interactive Visualizer

For both your own debugging and your paper's qualitative figures (e.g., *"Figure 4: Scalar Potential and Flux Convergence Prior to a Greek Gift Sacrifice"*), the web visualizer needs to expose **why** the engine picked a move—not just show pretty colors.

### 1. Four Toggleable Physics Layers (Canvas Overlay)

1. **Scalar Potential Heatmap ($`\Phi_{\text{field}} + \Phi_{\text{king}}`$):**
   * Diverging perceptually uniform colormap (**Cool Cyan/Blue** for negative/enemy dominance $\to$ **Transparent** at equilibrium $\to$ **Warm Amber/Crimson** for positive/friendly dominance).
   * Renders at $60\text{ fps}$ using bilinear interpolation upscaled from the $8 \times 8$ `Float32Array` onto an offscreen canvas so the field looks like a smooth continuous fluid rather than blocky squares.
2. **Gradient Flow Streamlines ($`\nabla_{\text{cart}}\Phi`$):**
   * Spawn ~250 lightweight massless tracer particles on the board that advect along the 2D gradient vector field using 2nd-order Runge-Kutta (RK2) integration, leaving fading comet trails toward high-potential wells (like the enemy King or weak dark squares).
3. **Dielectric & X-Ray Conduit Overlay ($`\varepsilon`$):**
   * Draws glowing dashed **X-Ray beams** whenever a sliding piece's ray passes through a semi-permeable piece ($`\varepsilon \in (0.1, 0.8)`$), visually highlighting hidden pins and Rook/Queen batteries.
   * Renders enemy pawn chains as thick **insulating walls** whose visual opacity scales with $1 - \varepsilon_i$.
4. **Exchange Repulsion & Tension Rings ($`V_{\text{rep}}`$):**
   * Any piece with $\text{SEE}(p) < 0$ gets a pulsing red/orange **instability halo**, immediately showing the viewer what the engine perceives as "under tension" or hanging.

### 2. The "Thought Process" X-Ray Inspector (Side Panel)

When hovering over any legal candidate move $m$ in the move list:

* **Ghost Preview:** Temporarily evaluates $`S' = 𝒯(S, m)`$ in WASM (< 0.05 ms) and morphs the board's heatmap and streamlines to show the **post-move universe**.
* **Hamiltonian Energy Waterfall Chart:** Displays the exact term-by-term equation for that candidate move:

  ```math
  \Delta H(m) = \underbrace{+0.00}_{\Delta \text{Mat}} + \underbrace{+1.42}_{\Delta \text{Flux}} + \underbrace{+2.15}_{\Delta \text{KingZone}} - \underbrace{0.00}_{V_{\text{rep}}} + \underbrace{+0.30}_{\text{Momentum}} = \mathbf{+3.87}
  ```

* **One-Click Paper Figure Export:** A button (`Export SVG/PNG Diagram`) that freezes the board, strips UI chrome, adds coordinate labels and a calibrated colorbar legend, and downloads a 300-DPI publication-ready figure for your LaTeX manuscript.

---

## Part 5: Experimental Validation Plan (For the Paper)

To turn this from a cool engineering project into a publishable study, bake four concrete experiments into `docs/04_ABLATION_AND_ELO_BENCHMARKS.md`:

1. **Ablation Study (Component Necessity):** Measure Elo across 500-game gauntlets (`tc=10+0.1`) starting from a raw electrostatic field and adding one physical law at a time:
   * *Baseline 0:* Pure isotropic potential ($\varepsilon = 1$ everywhere, no SEE)
   * *+ Anisotropic Permittivity ($`\varepsilon`$):* Quantifies the Elo gain of modeling pawn walls, pins, and X-ray batteries.
   * *+ King Gravitational Sink ($`\Phi_{\text{king}}`$):* Quantifies global coordination without a search tree.
   * *+ Exchange Repulsion Barrier ($`V_{\text{rep}}`$ + full-board `w_hang`):* Quantifies blunder elimination.
   * *+ Piece Momentum ($`\vec{M}_p`$):* Quantifies reduction in positional shuffling/draws.
2. **Compute & Node-Efficiency Pareto Frontier:** Plot **Elo vs. Evaluated States per Move** comparing your zero-search engine (~35 evaluations/move) against Stockfish/classical alpha-beta engines constrained to `nodes=35`, `nodes=100`, `nodes=500`, and `nodes=1000`. Demonstrating that a continuous field solver beats discrete tree search at equal node budgets ($`N \approx 35`$) is a compelling headline result.
3. **Tactical Motif Emergence (Zero-Rule Verification):** Test the engine on curated tactical test suites (pins, discovered attacks, batteries, passed-pawn races) and log the tensor activations to prove these tactical concepts emerge purely from continuous field equations rather than discrete `if/else` heuristics.
4. **Human Alignment (Maia Correlation):** Compare move-matching accuracy against human games across rating bands (`1100–1900` Elo) to see whether human intuition correlates more closely with spatial field pressure than brute-force minimax.

---

## Immediate Next Step: Bootstrapping the Project

We can start building right now in clean, documented increments:

1. **Step 1:** Draft the complete `docs/01_PROBLEM_AND_THESIS.md` and `docs/02_MATHEMATICAL_FORMULATION.md` markdown files plus the `Cargo.toml` workspace and `field-core` Rust implementation (Board, Permittivity, Ray/Knight/King Field Solver, Bitboard SEE, and Ego-Centric Hamiltonian).
2. **Step 2:** Wire up `field-uci` so you can immediately run it in `fastchess` or Arena/BanksiaGUI against Stockfish.
3. **Step 3:** Build the `field-wasm` + React/Canvas interactive visualizer so you can inspect the heatmaps, streamlines, and Hamiltonian energy waterfall live in your browser.
