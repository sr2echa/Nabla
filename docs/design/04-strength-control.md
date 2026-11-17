# 04 — Strength Control and Elo Calibration

> **Status:** Draft v0.2 · **Implemented in:** `crates/nabla-core/src/policy.rs` (policy;
> calibration is Milestone 5) · **Depends on:** [`03-move-selection.md`](03-move-selection.md)
> · **Resolves:** m-1, and the strength-scale part of M-7, of
> [`01-proposal-review.md`](01-proposal-review.md)

Nabla exposes strength the way established engines do (`UCI_LimitStrength`,
`UCI_Elo`) but implements it with one physically meaningful knob, a Boltzmann
**temperature**, combined with the selection level of 03. This document specifies
the policy, how requested Elo is mapped to settings, how that mapping is
calibrated, and what rating scale the numbers refer to.

---

## 1. Requirements

| ID | Requirement |
| --- | --- |
| R1 | **Monotone:** a higher requested strength yields a higher measured rating. |
| R2 | **Smooth:** adjacent settings differ by small rating steps. |
| R3 | **Reproducible:** identical seed, options, and move history yield identical games. |
| R4 | **Calibrated:** a requested `UCI_Elo` yields a measured rating on a **stated scale** within a **stated error**. |
| R5 | **Standard:** UCI option names and semantics match common practice. |
| R6 | **Interpretable:** the control has a direct meaning in terms of move quality. |

---

## 2. Boltzmann policy

At the root, Nabla samples a move from

```math
\pi_\tau(m) = \frac{\exp\!\big(\hat Q(m) / \tau\big)}{\sum_{m' \in ℳ(S)} \exp\!\big(\hat Q(m') / \tau\big)},
\qquad
\hat Q(m) = \max\!\Big(Q_L(m),\ \max_{m'} Q_L(m') - Q_\text{cap}\Big), \qquad \text{(1)}
```

where $Q_L$ is the level-$`L`$ root score (03 §4) and $\tau \ge 0$ is in pawn units.
As $\tau \to 0$ the policy becomes the deterministic argmax of 03 §5.

**Properties.**

- *Only differences matter.* Adding a constant to every $Q$ leaves $\pi_\tau$
  unchanged; the implementation subtracts the maximum before exponentiating.
- *Direct meaning (R6).* A move $\Delta Q$ pawns worse than the best is chosen
  $e^{-\Delta Q / \tau}$ times as often as the best move. At $\tau = 0.5$, a
  one-pawn mistake is chosen $e^{-2} \approx 13.5$ % as often as the best move;
  large blunders become rare much faster than small inaccuracies, which is closer
  to human error patterns than uniform random moves.
- *Gap cap.* No move is treated as more than $Q_\text{cap} = 20$ pawns worse than the
  best, so very high temperatures can miss even a mate in one (realistic at the
  lowest strengths). At $\tau \le 2$, a mate in one in an otherwise level position
  (30 alternatives scoring about 0) is still chosen with probability
  $1/(1 + 30e^{-10}) > 99.8$ %. Capping the gap rather than the score keeps the
  $\tau \to 0$ limit intact (an absolute cap would make a mate in one and any
  20-pawn win tie, and sample them uniformly at every temperature) and keeps mates
  of different lengths in order.
- *Measurable randomness.* The policy entropy $`H_\pi = -\sum_m \pi_\tau(m)\ln \pi_\tau(m)`$
  is reported in an `info string` line.

**Reproducibility (R3).** Each decision draws its random number from a
counter-based generator (SplitMix64) keyed by
$`(\text{Seed},\ \text{game},\ \text{Zobrist}(S),\ \text{ply})`$, where the game counter
increases on every `ucinewgame`. A decision therefore depends only on these
values, not on previous queries or thread timing, and native and WebAssembly builds
sample identically. The game counter matters for calibration: without it, every
game against a deterministic opponent (Maia at one node, the alpha-beta controls)
from the same opening would repeat move for move and inflate the sample size.

---

## 3. Strength surface

Two controls determine strength: the level $L \in \lbrace 0, 1, 2 \rbrace$ and the
temperature $\tau$. Their measured ratings form the **strength surface**
$`\mathrm{Elo}(L, \tau)`$, expected to decrease in $\tau$ for each level (hypothesis
H6) and to increase with $L$ at $\tau = 0$ (H4).

---

## 4. Calibration

### 4.1 Strength path

A one-dimensional **strength path**, parameterised by $\eta \in [0, 1]$, runs
through the surface in three segments:

| Segment | Level | Temperature |
| --- | --- | --- |
| 0 | 0 | $\tau_\text{max} \to 0$ |
| 1 | 1 | $\tau_1 \to 0$ |
| 2 | 2 | $\tau_2 \to 0$ |

The breakpoints $\tau_1$ and $\tau_2$ are chosen from the fitted curves so that the
path is continuous: $`\mathrm{Elo}(1, \tau_1) = \mathrm{Elo}(0, 0)`$ and
$`\mathrm{Elo}(2, \tau_2) = \mathrm{Elo}(1, 0)`$. A requested rating is therefore
served by the **highest level that can reach it**, with temperature supplying the
weakening. Rationale: a deterministic low level fails on the same tactics every
time, which an opponent can exploit repeatedly; a higher level with temperature
errs randomly and in proportion to the size of the error.

### 4.2 Procedure

1. **Grid.** $\tau \in \lbrace 0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0 \rbrace$
   pawns for each $L \in \lbrace 0, 1, 2 \rbrace$: 33 configurations.
2. **Games.** Each configuration plays at least 400 games against the anchored
   pool (protocol §4), giving a 95 % confidence half-width of about ±34 Elo
   (protocol §5).
3. **Rating.** All games are rated jointly with Ordo, with the Stockfish anchors
   fixed at their nominal `UCI_Elo` values.
4. **Fit.** For each level, an isotonic (monotone decreasing) regression of rating
   on $\tau$, then monotone piecewise-cubic (PCHIP) interpolation for inversion.
5. **Compose and invert** the path to obtain the map $`\mathrm{Elo} \mapsto (L, \tau)`$.
6. **Validate.** Five held-out target ratings across the range each play at least
   400 games against the pool. **Acceptance:** RMS calibration error ≤ 50 Elo
   within the anchored range; targets below the lowest anchor are reported as
   extrapolated.
7. **Store** the map as `calibration/elo-map.toml` with metadata: engine commit,
   parameter-set hash, time control, opening book, pool composition, game counts,
   and date. The table is compiled into the binary.

**Staleness rule.** A calibration table is valid only for the parameter-set hash it
records. If the hash differs, the engine does not advertise `UCI_Elo`, and a CI
check fails (05 §7). Every change to the evaluation therefore forces recalibration
before strength claims are made.

---

## 5. UCI options

UCI `spin` options are integers, so temperatures and contempt are given in
centipawns.

| Option | Type | Range | Default | Meaning |
| --- | --- | --- | --- | --- |
| `Level` | spin | 0–2 | 2 | Selection level (03 §4). |
| `Temperature` | spin | 0–500 | 0 | $\tau$ in centipawns. |
| `UCI_LimitStrength` | check | — | false | When true, `UCI_Elo` overrides `Level` and `Temperature`. Advertised only with a valid table. |
| `UCI_Elo` | spin | Range of the compiled calibration table | Table maximum | Target rating on the scale of §6. Advertised only with a valid table (§4.2). |
| `Seed` | spin | 0–2147483647 | 0 | Random seed for the policy (§2). |
| `Contempt` | spin | −100–100 | 15 | $\delta_\text{draw}$ in centipawns (03 §3). |
| `MultiPV` | spin | 1–256 | 1 | Number of candidates reported. |
| `Move Overhead` | spin | 0–5000 ms | 30 | Time reserved for process and protocol overhead when computing the node budget (03 §7). |

In v0.1 no calibration table exists yet, so neither strength-limiting option is
advertised; `setoption` for either replies with an `info string` saying so.
Evaluation coefficients are additionally exposed as hidden options for automated
tuning (05 §4).

---

## 6. Rating scale

Strength numbers are meaningless without a scale. Nabla states its scale as
follows.

1. **Anchors.** The pool is anchored by Stockfish with `UCI_LimitStrength`. Stockfish
   documents its `UCI_Elo` range (1320–3190) as approximately **CCRL Blitz**, fitted
   against the Stash engine (`src/search.h`). Nabla's `UCI_Elo` is therefore
   *CCRL-Blitz-anchored pool Elo at the calibration time control*.
2. **Not human ratings.** These numbers are not comparable to Lichess or Chess.com
   ratings. A human-scale calibration requires rated games against people and is
   future work.
3. **Below 1320.** No Stockfish anchor exists there. Ratings come from the
   connected pool (random mover, material-greedy baseline, Nabla configurations,
   Maia) and are extrapolations with wider confidence intervals, flagged as such in
   the table metadata.
4. **Maia.** Maia models are rated *within* the pool. Their names (1100 … 1900) are
   Lichess training targets, not pool ratings.

---

## 7. Alternatives considered

| Method | Used by | Why it is not Nabla's primary control |
| --- | --- | --- |
| MultiPV-based random weakening | Stockfish (`Skill Level`) | Tied to iterative-deepening depth, which Nabla does not have. |
| Depth or node limits | Many engines | Nabla's levels are already discrete; too coarse on their own. |
| Gaussian noise on evaluation weights | FFCE | Perturbs the model rather than the decision; its magnitude has no direct meaning; explanations no longer describe the model that chose the move. |
| ε-greedy random moves | Simple bots | Blunders unrelated to move quality. |

The Boltzmann temperature has one interpretable parameter, error probabilities that
fall with error size, measurable entropy, and unchanged per-candidate explanations.

---

## 8. Out of scope for version 1

**Style presets** (for example, a higher king-danger scale $G_0$ for an "attacking"
personality) change how Nabla plays rather than how well. Each preset would need its
own calibration, so presets are deferred until the default calibration is accepted.
