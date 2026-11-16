# 01 — Review of the Initial Proposal

> **Status:** Accepted · **Reviews:** [`00-initial-proposal.md`](00-initial-proposal.md)
> · **External claims verified on:** 2026-11-16

---

## Summary

The central intuition of the proposal is sound and publishable: an evaluation
built from physically structured, interpretable fields, used with little or no
search, and visualised live. Four problems prevent it from being built as written.

1. **The paradigm is prior art.** Flow Field Chess (FFCE; Koch, 2026) already
   selects moves by single-ply greedy descent on a field energy functional,
   already includes SEE-based hanging-piece terms, king-zone pressure, and a
   momentum ("trace") field, and already ships as Rust → WebAssembly. Three
   of the proposal's statements about FFCE are refuted by its source code (§2).
2. **The energy functional has five critical defects.** As written, it would play
   badly at any parameter setting, because tuning cannot repair structural
   errors (§3, C-1 to C-5).
3. **Several quantitative claims are wrong**, some by more than an order of
   magnitude (§3, M-6), and the Elo pipeline mixes incompatible rating scales (M-7).
4. **The terminology would not survive physics review** (m-3).

Every finding has a concrete resolution, adopted in documents 02–04. Severity
counts: **5 critical**, **9 major**, **7 minor**. Finding C-5 was missed in the
first version of this review and added after the second proposal raised it
(see [`01b-second-proposal-review.md`](01b-second-proposal-review.md)).

| Severity | Meaning |
| --- | --- |
| **Critical** | Causes systematically wrong play or an invalid scientific claim; no parameter setting fixes it. |
| **Major** | Causes wrong play in common situations, wastes significant effort, or creates legal/ethical risk. |
| **Minor** | Ambiguity, notation, or presentation; fix before publication. |

---

## 1. Method

1. **Structural analysis.** Each term of $`H(S')`$ was analysed for what it rewards,
   which board quantities it depends on, and its magnitude on canonical positions.
   Numerical values below were computed with the proposal's own constants.
2. **Arithmetic re-check** of every performance and cost figure.
3. **Primary-source verification** of every external claim: the crates.io API,
   Stockfish source (`src/search.h`), the `official-stockfish/books` listing,
   the Maia and fastchess READMEs, the FFCE Zenodo record, and FFCE source files
   (`fields.rs`, `eval.rs`, `ai.rs`) on its `main` branch.

---

## 2. Prior art: Flow Field Chess

FFCE (Koch, 2026; DOI [10.5281/zenodo.21028769](https://doi.org/10.5281/zenodo.21028769);
code: [cronos3k/FFCE](https://github.com/cronos3k/FFCE), GPL-3.0) is the closest
prior work. Its paper describes it as selecting moves "by greedy descent on an
energy functional defined over those fields", using "no lookahead search", and
explicitly makes **no strength claim**.

### 2.1 Verified properties of FFCE

| Property | FFCE (verified in source) |
| --- | --- |
| Move selection | Single-ply argmax of the evaluation over all legal moves (`ai.rs::choose_move`). |
| Randomness | Gaussian noise on evaluation weights, plus extra noise on move 1. |
| Oscillation control | A repetition watchdog that re-evaluates when a move would revisit a position (`choose_move_avoiding`). |
| Ray geometry | Slider rays stop at the first occupied square, with per-type geometric decay (`fields.rs::compute_attack`). **No X-ray channel.** |
| Exchange evaluation | Swap-algorithm SEE (`see_exchange`) over attacker lists that **omit X-ray attackers**. |
| Use of SEE | Gains summed over **all** pieces of **both** colours, independent of the side to move (`eval.rs::compute_score`). |
| Control term | $`\sum_i w(i)\tanh(\beta_p P_i)`$ over a signed pressure field $P = F_w - F_b$. |
| King safety | King-zone-masked pressure, **linear** in the field. |
| Momentum | "Trace" field with quaternion heading. |
| Stack | Rust → `wasm32-unknown-unknown`, plain C ABI (no `wasm-bindgen`). |

### 2.2 Assessment of the proposal's claims about FFCE

| Proposal claim | Verdict | Correct statement |
| --- | --- | --- |
| "No defensive awareness (hanging pieces)" | **Refuted** | FFCE computes SEE for every piece and penalises hanging material. Its SEE does, however, ignore X-ray attackers and the side to move. |
| "No ray permittivity (blind to batteries and pins)" | **Partly true** | Rays respect blocking, but stop at the first blocker, so batteries, pins, and X-rays are invisible. |
| "No global goal alignment" | **Largely refuted** | FFCE has king-zone pressure and king-zone-weighted extra fields; what it lacks is a non-linear king-safety model. |
| "Rust → WASM is the ideal stack, confirmed by FFCE" | **Overstated** | FFCE demonstrates feasibility (its README reports ~20 ms per move in the browser with all extra fields), not optimality. |

### 2.3 Consequence: repositioned contribution

Nabla cannot claim the paradigm ("single-ply descent on a field energy, rendered
live"). Its defensible contributions are:

1. **Chess-exact ray transport** with blocker-dependent transmittance that
   separates direct control from an X-ray channel (batteries, pins, skewers), and
   an X-ray-consistent SEE.
2. **A side-to-move-aware exchange energy** (largest realisable capture, plus
   the opponent's second threat for forks) instead of summed SEE.
3. **A non-linear king-safety model** (breakdown threshold) and a small set of
   further terms that each reduce to a classical heuristic in a stated limit.
4. **A strength-oriented regime study:** levels with no lookahead, capture-only
   quiescence, and a single reply, with every claim measured, not asserted.
5. **Learned, low-dimensional, interpretable parameters** (Texel tuning, then SPSA).
6. **Calibrated strength control** via a Boltzmann temperature mapped to Elo.
7. **A rigorous, reproducible evaluation**, including head-to-head games against
   FFCE and an ablation back to the as-proposed formulation.

---

## 3. Findings

### Critical

#### C-1 · The king "gravitational sink" does not attract pieces

**Claim.** $\Phi_\text{king}$ "creates a dynamic attractive well … ensuring every
piece coordinates to pressure the enemy king."

**Problem.** $\Phi_\text{king}$ enters $H$ only through $`\sum_i \Phi_\text{total}(i)`$:

```math
\sum_{i=0}^{63}\Phi_\text{king}(i)
= -\sum_{c} s_c\,G_c \sum_{i}\frac{1}{1+\lVert 𝐫_i-𝐫_{K_c}\rVert_2^2}
= -\sum_c s_c\,G_c\,Z(K_c).
```

$Z$ depends **only on the king's own square**; its derivative with respect to
every other piece's position is zero, so no piece is attracted by this term. Worse,
$Z$ is largest in the centre ($`Z(\text{d4}) = 9.54`$) and smallest in the corner
($`Z(\text{a1}) = 5.05`$). The term therefore rewards White by $4.48 G_K$ when
Black's king stands in the centre rather than the corner, the opposite of endgame
technique, which drives the defending king to the edge.

**Resolution.** Replace the well with interaction energies that couple pieces to
the enemy king: a non-linear king-zone pressure term (02, §5.5), a weak long-range
tropism term with a softened inverse-square kernel (02, §5.6), and an endgame
confinement term (02, §5.8).

#### C-2 · No material term; the field term reduces to charge-weighted mobility

**Problem.** Because $H$ sums a **linearly superposed** field over all squares,
the location of influence is irrelevant:

```math
\sum_{i}\Phi_\text{pieces}(i) = \sum_{p} s_{c(p)}\, q_{t(p)}\, M_p,
\qquad M_p = \sum_{\text{rays}}\sum_{k} \frac{T_k}{1+\lambda k}.
```

Each piece contributes its charge times its transmittance-weighted reach $M_p$.
Material appears only by removing a piece's emission, so a trapped piece
($`M_p \approx 0`$) is valued at about zero. The scale is also distorted: a queen on
d4 of an empty board emits $9 \times 21.5 = 193.5$ units, while a pawn emits
$2 \times 1.4 = 2.8$ units plus its promotion term, a ratio of roughly $69{:}1$
against the material ratio of $9{:}1$. A king emits $2.5$ onto each of up to 8
squares, so walking it from a corner (3 squares) to the centre (8 squares) gains
$12.5$ units in the middlegame.

**Resolution.** An explicit tapered rest-mass term $E_\text{mat}$; influence
enters only through bounded, square-weighted, non-linear terms (control, safe
mobility, king pressure), all in pawn units (02, §5.1–5.3).

#### C-3 · The hanging-piece term double-counts and ignores the side to move

**Problem.** $`w_\text{hang}\sum_{p}\max(0,-\mathrm{SEE}(p))`$ sums the loss over
**all** friendly pieces. In $S'$ the opponent is to move and can capture only
one piece; with two pieces each hanging 3 pawns, the penalty is 6 while the
realisable loss is about 3. The term also never rewards the mover's own double
attacks (forks), which are the main way a one-ply engine wins material.

**Resolution.** A side-to-move-aware exchange energy: the side to move realises
its **largest** SEE gain; the side not to move threatens only its **second**
largest, because one threat can be parried (02, Eq. (16)). FFCE shares this
defect (§2.1), so the correction is also a measurable difference from prior work.

#### C-4 · "Following the gradient" misdescribes the algorithm

**Problem.** The procedure in §3 of the proposal evaluates $`H(S'_m)`$ for every
legal move and takes the argmax (or a softmax sample). That is a depth-one search
with static evaluation $H$. The spatial gradient $\nabla\Phi$ of Step E never
enters $H$ and plays no role in move choice. "No tree search" is accurate only in
the narrow sense of "no adversarial reply", and the rule is identical to FFCE's.

**Resolution.** Define the gradient where moves actually live: on the edges of the
game graph. The discrete gradient $\nabla_m E$ (03, Eq. (2)) makes the engine's
name literal (steepest ascent of the energy over the position's neighbours). The
spatial gradient is kept as a **diagnostic visualisation only**.

#### C-5 · The side-to-move sign convention is missing

**Claim.** The engine "scores the resulting state using a single global Field
Hamiltonian $`H(S')`$" and samples $`P(m) \propto \exp(H(S')/\tau)`$.

**Problem.** $H$ is White-positive: Step B signs every piece by colour
($s = +1$ for White, $-1$ for Black). If both colours maximise $`H(S')`$, Black
chooses moves that are best for White. This also contradicts the proposal's own
prose ("your pieces emit positive potential"). Added on 2026-11-16 after the second
proposal (00b, Part 1.1) raised it; confirmed by the mathematical audit.

**Resolution.** The negamax convention: every child is scored from the mover's
side, $`Q(m) = -e(S'_m)`$ with $`e(S) = s_{\text{stm}(S)} E(S)`$ (03 Eqs. (1)–(2)). The
second proposal's own fix, "ego-centric" charges signed relative to the active
player, is ill-defined, because the active player in $S'$ is the opponent.

### Major

#### M-1 · Linear superposition erases contested squares

A square attacked equally by both sides contributes $0$ to a signed field, which
is exactly the flashpoint the proposal wants to visualise ("tension"). **Resolution:**
fields are stored per side ($\Phi_W$, $`\Phi_B`$); signs are combined only inside
explicitly non-linear terms; tension $`\Theta = \min(\Phi_W, \Phi_B)`$ is a diagnostic,
and exchanges are resolved by SEE (02, §4).

#### M-2 · The permittivity model conflates control with X-ray influence

Three problems. (a) A ray continues through enemy pieces at 15 % strength, so
squares **behind** an enemy piece count as controlled, which they are not.
(b) "Friendly piece" means friendly **to the emitter**, so $\varepsilon$ cannot be a
single 64-vector as the architecture diagram states; it depends on the emitter's
colour and, for batteries, on direction. (c) Every friendly blocker transmits
42 %, so a rook behind its own knight is credited with a "battery" that does not
exist. **Resolution:** a direct channel equal to the exact attack set, plus a
separate X-ray channel whose transmission depends on whether the blocker can move
along the ray (02, §4).

#### M-3 · The promotion potential is unbounded and unconditional

With $`\mathrm{rank}_s \in \lbrace 0,\dots,7 \rbrace`$, $0.35 e^{0.55 \cdot \mathrm{rank}}$ is
$0.61$ on the second rank, $5.47$ on the sixth, and $9.49$ on the seventh,
more than a queen, for **any** pawn, passed or blocked. The text also leaves
open which squares receive the potential. **Resolution:** a bounded rank potential
multiplied by a passage transmittance that equals the classical passed-pawn
predicate in its limit, plus a light-cone (rule-of-the-square) term (02, §5.7).

#### M-4 · King gravity scaling contradicts its stated intent

"$`G_K`$ scales inversely with the opponent's remaining material" gives a **large**
$G_K$ in endgames, while the same sentence asks for a large $G_K$ in the middlegame.
**Resolution:** king danger scales with the **attacker's** non-pawn material and
queen presence (02, Eq. (19)).

#### M-5 · Terminal states are undefined

$H$ has no value for checkmate, stalemate, repetition, the fifty-move rule, or
insufficient material. A one-ply engine therefore cannot be relied on to play a
mate in one, to avoid stalemating when winning, or to avoid repetitions. The
momentum term treats one symptom (oscillation) of this missing definition.
**Resolution:** explicit boundary conditions, including repetition-aware draw
scoring (03, §3).

#### M-6 · Performance figures are inconsistent or wrong

| Claim | Check | Verdict |
| --- | --- | --- |
| ~3–5 µs per field evaluation | Plausible order of magnitude (estimated 2–10 µs for 02's model). | **Unverified**; hypothesis P-1. |
| ~0.15 ms per turn (~6,500 evaluations/s) | $35 \times 4 \mu\text{s} = 0.14$ ms per decision, i.e. ≈ 7,000 **decisions**/s ≈ 250,000 **evaluations**/s. | **Inconsistent** (decisions vs. evaluations). |
| 2-ply over 30 moves in < 0.1 ms | $30 \times 30 = 900$ evaluations × 4 µs ≈ 3.6 ms. | **Wrong by ~36×** (still fast). |
| 1,000-game benchmark "in seconds" | Game length is set by the **opponent's** clock: at 10+0.1 s, up to ~14 s per game, so 1,000 games ≈ 4 h of opponent time, ≈ 30 min at concurrency 8. | **Wrong.** |

#### M-7 · The Elo pipeline mixes rating scales

Stockfish's `UCI_Elo` is clamped to **1320–3190** and is anchored to the
**CCRL Blitz** scale via the Stash engine (verified in `src/search.h`). There is no
Stockfish anchor below 1320. Maia models are trained on Lichess games to match
**human** ratings at `go nodes 1`, and their README notes they play stronger than
their target rating. Engine-pool Elo, CCRL Elo, and human Lichess/Chess.com Elo are
different scales. **Resolution:** one anchored engine pool with explicit scale
statements; Maia used as a pool member and a human-likeness reference, not as a
rating anchor (04, §6; protocol §4).

#### M-8 · SPSA on 500-game gauntlets is under-powered

A 500-game match has a 95 % confidence half-width of about ±30 Elo (protocol §5),
larger than most single-parameter effects. SPSA runs in engine development
typically use tens of thousands of games. **Resolution:** two-stage tuning:
Texel tuning (logistic regression on labelled positions) for static coefficients,
then SPSA only for parameters that act through play (02 §9; protocol §6).

#### M-9 · Overlays on live third-party games create fair-play risk

Rendering engine fields "directly on the Chess.com board" during live play would
amount to engine assistance, which chess platforms' fair-play rules prohibit.
**Resolution:** the visualisation lab runs on Nabla's own board; any third-party
overlay is limited to analysis and finished games (06, §7; decision D-011).

### Minor

| ID | Issue | Resolution |
| --- | --- | --- |
| m-1 | The softmax denominator uses $`H(S'')`$ (undefined) and $\tau$ has no units, so "$`\tau \in [0.5, 4]`$" has no meaning. | $`\pi_\tau(m) \propto \exp(Q(m)/\tau)`$ with $Q$ and $\tau$ in pawn units (04, Eq. (1)). |
| m-2 | "Sobel/central-difference" names two different kernels; boundary handling is unspecified. | Central differences with one-sided differences at edges (02, §8). |
| m-3 | "Hamiltonian", "Lagrangian", "least action", "tensor", "permittivity", "Pauli exclusion" are physically inaccurate. | Terminology policy ([`../notation.md`](../notation.md) §6). |
| m-4 | Momentum makes the evaluation history-dependent, and useful manoeuvres (Nb1–d2–f1–g3) are not straight lines. | Repetition-aware boundary conditions; momentum kept as an ablation (H7). |
| m-5 | The knight "halo" (2-hop, 25 %) has no chess or physical justification. | Kept only as an ablation term. |
| m-6 | UHO books are built to reduce draw rates between strong engines; below ~2000 Elo draws are rare and unbalanced starts add variance. | Balanced books (`8moves_v3.pgn`, `noob_3moves.epd`; both verified to exist) with paired colours (protocol §4). |
| m-7 | Library choice: `cozy-chess` 0.3.4 (MIT) was last published 2024-04-05; `shakmaty` 0.30.2 (GPL-3.0-or-later) was updated 2026-10-07. | `shakmaty` behind a thin adapter (decision D-005). |

---

## 4. Fact-check of external claims

| Claim in proposal | Status | Evidence (retrieved 2026-11-16) |
| --- | --- | --- |
| `cozy-chess` v0.3.4 | **Verified.** Latest version; MIT; last published 2024-04-05. | crates.io API |
| `shakmaty` v0.30.2 | **Verified.** Latest version; GPL-3.0-or-later; updated 2026-10-07. | crates.io API |
| Stockfish `UCI_LimitStrength` at 1320–2100 | **Verified, with caveat.** Range 1320–3190, CCRL Blitz scale, anchored to Stash. | `src/search.h`, `struct Skill` |
| Maia 1100/1500/1900 via `lc0` | **Verified.** Nine models (1100–1900); must run with `go nodes 1`. | CSSLab/maia-chess README |
| fastchess as tournament runner | **Verified.** Includes a UCI compliance checker (`--compliance`). "Successor to cutechess-cli" is informal. | Disservin/fastchess README |
| `UHO_Lichess_4852_v1.epd` | **Verified** (distributed zipped). | `official-stockfish/books` listing |
| FFCE in Rust/WASM | **Verified.** GPL-3.0; paper CC-BY-4.0. | FFCE README, Zenodo record |
| FFCE lacks defensive awareness | **Refuted.** | `eval.rs`, `fields.rs` |
| `wasm-bindgen` / `wasm-pack` for the web build | **Verified.** The `rustwasm` organisation was archived in 2025; both projects moved to the `wasm-bindgen` organisation and are maintained (`wasm-pack` 0.15.1, 2026-10-30). | Inside Rust blog; release page |
| Zero heap allocation in move generation | **Not verified**; irrelevant to design, since evaluation cost dominates. | — |

---

## 5. Disposition of proposal elements

| Proposal element | Disposition | Where |
| --- | --- | --- |
| Pieces as emitters along legal rays | **Kept, made exact** (direct channel = attack set). | 02 §4 |
| Permittivity $\varepsilon$ | **Replaced** by blocker-dependent transmittance (X-ray channel). | 02 §4 |
| Charges $q_t$ | **Split** into rest masses $m_t$ and control weights $\alpha_t$; $q_t$ kept as an ablation setting. | 02 §5.1, §9 |
| Knight halo | **Ablation only.** | 02 §5.10 |
| Promotion potential | **Replaced** by passage transmittance, bounded rank potential, light cone. | 02 §5.7 |
| King gravitational sink | **Replaced** by king pressure (breakdown), tropism, confinement. | 02 §5.5, §5.6, §5.8 |
| SEE repulsion $V_\text{rep}$ | **Replaced** by side-to-move-aware exchange energy. | 02 §5.4 |
| Spatial gradient $\nabla\Phi$ | **Kept as diagnostic**; move choice uses the graph gradient. | 02 §8, 03 §2 |
| Field Hamiltonian $H$ | **Renamed and rebuilt** as energy functional $E$. | 02 §5 |
| Momentum $\vec M_p$ | **Ablation only.** | 02 §5.10, H7 |
| Softmax temperature | **Kept, corrected**, and calibrated to Elo. | 04 |
| 2-ply lookahead | **Kept** as Level 2, alongside Level 0 and a quiescent Level 1. | 03 §4 |
| UCI + WASM dual target | **Kept.** | 05 |
| Live heatmaps and sliders | **Kept and extended** (flux lines, move-gradient decomposition). | 06 |
| Gauntlets and SPSA | **Kept, re-designed** (anchored pool, Texel first). | 04, protocol |
