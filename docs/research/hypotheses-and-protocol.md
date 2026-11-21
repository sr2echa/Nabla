# Hypotheses and Evaluation Protocol

> **Status:** Draft v0.2 · **Intent:** pre-registration. Hypotheses, success
> criteria, and analysis plans are fixed here **before** experiments run. Any later
> change is recorded in §12 with its date and reason, so the paper can distinguish
> confirmatory from exploratory results.

---

## 1. Research questions

| ID | Question |
| --- | --- |
| RQ1 | How strongly can an interpretable field energy play with no lookahead beyond one ply (Level 0)? |
| RQ2 | How much does each structural element (X-ray transport, side-to-move-aware exchange, breakdown king model, pawn transport) contribute? |
| RQ3 | How much do capture-only quiescence (Level 1) and a single reply (Level 2) add? |
| RQ4 | Can strength be controlled continuously and calibrated accurately with a temperature? |
| RQ5 | Given the same search, does the field energy encode chess knowledge comparably to a classical evaluation? |

---

## 2. Hypotheses

### 2.1 Confirmatory

| ID | Statement | Test | Success criterion |
| --- | --- | --- | --- |
| H1 | The field model of 02 beats the as-proposed formulation (Nabla-P) at Level 0. | Head-to-head, ≥ 1,000 games | Elo difference > 0, 95 % CI excludes 0 |
| H2 | X-ray transport beats hard-blocking rays ($\chi = 0$, as in FFCE). | SPRT at Levels 0 and 1 | SPRT accepts H₁ with bounds [0, 10] |
| H3 | The side-to-move-aware exchange energy (02 Eq. (16)) beats summed SEE over all pieces. | SPRT at Level 0 | SPRT accepts H₁ with bounds [0, 10] |
| H4 | Strength increases with level at $\tau = 0$: Elo(L2) > Elo(L1) > Elo(L0). | Gauntlet ratings | Each adjacent difference has a 95 % CI excluding 0 |
| H5 | Texel-tuned coefficients beat the initial values of 02 §9. | SPRT at Level 1 | SPRT accepts H₁ with bounds [0, 10] |
| H6 | Rating decreases monotonically in $\tau$ for each level, and the calibrated `UCI_Elo` is accurate. | Calibration (04 §4) | Isotonic fit without violations beyond CI overlap; RMS error ≤ 50 Elo in the anchored range |
| H7 | The momentum term adds no strength once repetition-aware boundary conditions exist. | Equivalence test (TOST), about 7,700 games for 80 % power at Holm–Bonferroni $\alpha = 0.00625$ | 98.75 % CI of the difference within ±15 Elo |
| H9 | Nabla at Level 0 beats FFCE (default settings). | Head-to-head, ≥ 400 games | Elo difference > 0, 95 % CI excludes 0 |

### 2.2 Exploratory

| ID | Question | Measurement |
| --- | --- | --- |
| H8 | At equal alpha-beta depth (AB-*d*, $`d \in \lbrace 2, 4 \rbrace`$), how does $E$ compare with a classical material-plus-piece-square evaluation (PeSTO tables)? | Elo difference with 95 % CI |
| H10 | At matched pool rating, does temperature-based weakening match human moves more often than ε-greedy weakening? | Move-matching accuracy against Lichess games at the corresponding rating, the metric used for Maia |
| H11 | How does strength scale with compute, for Nabla's levels versus node-limited alpha-beta engines? | Elo against three compute axes measured identically for every engine: make-move nodes, static evaluations, and single-thread CPU time per move. Node counts are taken from the engines' own `info` lines (Stockfish overshoots small `go nodes` limits), with `Threads=1` and the hash cleared before every move. Nabla's own evaluation under AB-*d* is included to separate the evaluation from the selection regime. |

### 2.3 Performance

| ID | Statement | Criterion |
| --- | --- | --- |
| P-1 | One evaluation (fields + energy) is fast. | Median ≤ 10 µs native, single thread, on the bench suite |
| P-2 | Decisions are fast at every level. | Median ≤ 1 / 10 / 100 ms at Levels 0 / 1 / 2 |
| P-3 | The browser build is usable interactively. | WebAssembly ≤ 3× native; Level 0 lab re-analysis ≤ 16 ms |

---

## 3. Correctness gates

No strength result is recorded until all of the following hold for the exact
commit under test:

1. Every test of 05 §7 passes, including exact colour antisymmetry and
   native/WebAssembly bit-identity.
2. `fastchess --compliance` passes.
3. 1,000 self-play games at each level finish with zero illegal moves, crashes, or
   time losses.

---

## 4. Match conditions

| Setting | Value | Rationale |
| --- | --- | --- |
| Runner | fastchess, game pairs with colours reversed | Pairing cancels opening bias. |
| Openings | `8moves_v3.pgn` (primary); `noob_3moves.epd` (robustness) from `official-stockfish/books` | Balanced books suit sub-2000 engines; UHO books target strong engines (review m-6). |
| Opening sampling | Without replacement, fixed seed per experiment | Reproducible and non-overlapping. |
| Time control | 10 s + 0.1 s per move for all engines | Nabla's levels finish well within it; it mainly governs opponents. |
| Concurrency | At most physical cores − 1 | Prevents opponents from losing strength to CPU contention. |
| Adjudication | None; games are played to the end | Converting won endgames is part of what is measured (§8). |

### 4.1 Opponent pool

| Member | Configuration | Role |
| --- | --- | --- |
| Stockfish | `UCI_LimitStrength = true`, `UCI_Elo` ∈ {1320, 1500, 1700, 1900, 2100} | **Anchors** at nominal ratings (CCRL Blitz scale) |
| Maia | `maia-1100`, `maia-1500`, `maia-1900` via `lc0`, `go nodes 1` | Human-like members, rated within the pool |
| Random mover | Uniform over legal moves | Floor of the scale |
| Material-greedy | One ply, material only, random tie-break | Low baseline |
| FFCE | Default settings, through a UCI adapter around its Rust crate | Prior-art baseline (H9) |
| AB-PeSTO-*d* | Alpha-beta to depth $d$ with PeSTO evaluation, implemented in `tools/` | Classical-evaluation control (H8) |

`maia-1500` is held out of all tuning and used only for final ratings, as a check
against over-fitting to the pool.

### 4.2 Development matches

`node tools/gauntlet.mjs` runs one of three opponents under the clock in §4,
with Nabla at temperature 0:

| `--opponent` | Engine | What it is |
| --- | --- | --- |
| `stockfish` | Native Stockfish, `UCI_LimitStrength`, `UCI_Elo` 1320 to 3190, one thread | An anchor from §4.1 |
| `maia` | `lc0` with `--weights` pointing at a Maia network, `nodes=1`, one thread | A human-like member from §4.1 |
| `self` | A second Nabla at `--other-level` | A level comparison, not an anchor |

`--book` must be the protocol book before a score is treated as protocol data.
Without it, every game is the opening position, and the result is only a check
that the engines move. The script prints the 95 % half-width from Eq. (1) for
the game count it asks for. The browser's Stockfish 19 lite is a different
program from the native binary in this table, and the `/play` UI does not
expose Maia in its opponent roster (even though `onnxruntime-web` is in `web/package.json`).
Neither browser game is a row in §13.

---

## 5. Statistics

**Rating from score.** A score fraction $p$ corresponds to an Elo difference
$`-400 \log_{10}(1/p - 1)`$. Pool ratings are fitted jointly with **Ordo**, with the
Stockfish anchors fixed, and 95 % confidence intervals from Ordo's simulation.

**Sample size.** Near $p = \tfrac12$, the 95 % half-width of a rating difference
is approximately

```math
h \approx 1.96 \cdot \frac{\sigma}{\sqrt{n}} \cdot \left. \frac{d\,\mathrm{Elo}}{dp} \right|_{p = 1/2}
= 1.96 \cdot \frac{0.5}{\sqrt{n}} \cdot \frac{1600}{\ln 10}
\approx \frac{681}{\sqrt{n}},
\qquad \text{(1)}
```

assuming no draws ($`\sigma = 0.5`$). Draws and game pairing reduce variance, so the
table is conservative.

| Games $n$ | 100 | 200 | 400 | 1,000 | 2,000 | 4,000 |
| --- | --- | --- | --- | --- | --- | --- |
| 95 % half-width (Elo) | ±68 | ±48 | ±34 | ±22 | ±15 | ±11 |

The half-width applies to one rating against a fixed reference. The difference
between two separately rated configurations is wider by a factor of about $\sqrt 2$.

**Sequential tests.** A/B changes (H2, H3, H5) use Wald's SPRT on logistic Elo with
bounds $`[\mathrm{elo}_0, \mathrm{elo}_1] = [0, 10]`$ and the pentanomial model over
game pairs (fastchess `-sprt elo0=0 elo1=10 alpha=0.00625 beta=0.05 model=logistic`,
always with an explicit `-rounds`), setting $\alpha = 0.05 / 8 = 0.00625$ in
advance for the eight confirmatory tests rather than adjusting afterwards.

**Equivalence.** H7 uses two one-sided tests (TOST) with a ±15 Elo margin at the
Holm–Bonferroni adjusted level $\alpha = 0.00625$ per side (requiring the
$`1 - 2\alpha = 98.75\%`$ two-sided confidence interval to lie within `[-15, +15]`
Elo, about $n \approx 7{,}700$ games for 80 % power at $p = \tfrac12$).

**Multiple comparisons.** Holm–Bonferroni correction across the eight confirmatory
hypotheses (H1–H7, H9), with worst-case family-wise significance level
$`\alpha_{\text{adj}} = 0.05 / 8 = 0.00625`$ fixed upfront for sequential/TOST
designs. Exploratory results are labelled as such and not corrected.

---

## 6. Tuning procedure

### 6.1 Stage 1 — Texel tuning (coefficients marked T in 02 §9)

1. **Data.** Quiet positions (static evaluation equals the Level 1 quiescence value)
   labelled with game results $r \in \lbrace 0, \tfrac12, 1 \rbrace$, drawn from the
   Lichess open database (games with both players rated ≥ 1800) and from Nabla
   self-play. Positions from opening books and test suites are excluded.
2. **Loss.** Mean squared error between $r$ and $`\sigma_\text{L}(k E)`$, with the scale
   $k$ fitted once on the initial coefficients and then frozen.
3. **Optimiser.** Gradient descent with ranges enforced by projection. $E$ is
   differentiable almost everywhere in its coefficients; gradients are analytic
   where available and central differences otherwise.
4. **Validation.** 10 % hold-out; early stopping on hold-out loss; loss curves
   reported.

### 6.2 Stage 2 — SPSA (coefficients marked S)

$\beta_1$, $\beta_2$, and $\delta_\text{draw}$ act through play and are tuned by SPSA
over at least 20,000 games. The result is confirmed by SPRT against the Stage 1
parameter set.

---

## 7. Ablation matrix

| ID | Change | Tests | Levels |
| --- | --- | --- | --- |
| A1 | As-proposed functional (Nabla-P) | H1 | 0 |
| A2 | No X-ray channel ($`\chi = 0`$) | H2 | 0, 1 |
| A3 | Summed SEE over both colours in place of Eq. (16) | H3 | 0 |
| A4 | Linear king pressure ($`x_0 = 0, D_\text{max} \to \infty`$) | RQ2 | 0, 1 |
| A5 | No tropism ($`g_t = 0`$) | RQ2 | 0, 1 |
| A6 | Passage opacity fixed at $\theta_\text{pp} = 1$ (effective post-tuning, since default $\theta_\text{pp} = 1.0$) | RQ2 | 1 |
| A7 | No confinement ($`\zeta_1 = \zeta_2 = 0`$) | RQ2, endgame suite | 0, 1 |
| A8 | Momentum term enabled | H7 | 0 |
| A9 | Charge-proportional control weights ($`\alpha_t \propto q_t`$) | RQ2 | 0, 1 |
| A10 | Knight halo enabled | RQ2 | 0 |
| A11 | Repetition rule disabled | Sanity check | 0 |

Leave-one-out ablations (A2–A10) measure what each element contributes to the full
model. They are complemented by an **additive ladder**: starting from material and
mobility only, add transport, the exchange term, king safety, the pawn terms, and
confinement, one at a time. Because the order of addition confounds each step,
ladder steps are reported alongside, not instead of, the leave-one-out results.

---

## 8. Test suites

| Suite | Content | Metric |
| --- | --- | --- |
| Tactics | Win At Chess (300 positions); Bratko–Kopec (24 positions) | Best-move solve rate per level |
| Endgame conversion | 200 random won positions each of KQK, KRK, KPK, winning side to move, against full-strength Stockfish | Fraction converted within 50 moves |
| Evaluation agreement | 10,000 quiet positions | Spearman correlation of $E$ with a fixed-depth Stockfish evaluation; sign agreement |
| Blunder profile | All moves from the calibration games | Fraction of moves losing ≥ 2 pawns by Stockfish analysis, per level and $\tau$ |
| Motif suites (exploratory) | Positions labelled by motif: pin, skewer, battery, discovered attack, fork, passed-pawn race | Solve rate per level, and its change under targeted ablations ($\chi = 0$ removes X-rays; $\theta_\text{en} = 0$ removes the pin channel). This replaces the second proposal's "zero-rule verification", which is impossible because SEE and several predicates are discrete rules. |

---

## 9. Performance benchmarks

1. Record reference hardware: CPU model and frequency, operating system, `rustc`
   version, target features, and, for WebAssembly, browser and version.
2. Micro-benchmarks with `criterion`: nanoseconds per evaluation on the bench suite
   (median and inter-quartile range).
3. Macro-benchmarks with the `bench` command: decision latency per level.
4. Native versus WebAssembly ratio on the same suite.

---

## 10. Reproducibility

1. **Manifests.** Every experiment has a manifest: engine commit, parameter hash,
   opponents and versions, book and seed, time control, game count, hardware.
2. **Raw data.** PGNs and fastchess logs are archived and deposited (for example on
   Zenodo) at submission.
3. **Regeneration.** Scripts regenerate every table and figure from raw data;
   tables in the paper cite manifest identifiers.

---

## 11. Threats to validity

| Kind | Threat | Mitigation |
| --- | --- | --- |
| Internal | Elo is not perfectly transitive across very different engines. | Report head-to-head results alongside pool ratings. |
| Internal | Stockfish's anchor ratings were calibrated under conditions that may differ from ours. | Treat anchors as nominal; state this wherever ratings appear. |
| Internal | CPU contention weakens time-using opponents. | Concurrency limit (§4). |
| Internal | Over-fitting coefficients to the pool. | Hold-out pool member (§4.1); disjoint tuning data (§6.1). |
| Construct | "Search-free" can be read more broadly than intended. | Use the positioning statement of 03 §9 verbatim. |
| Construct | Interpretability is argued from exact decompositions, not user studies. | State this limitation; user studies are future work. |
| External | CCRL-anchored ratings do not transfer to human rating scales. | State the scale (04 §6) with every number. |

---

## 12. Change log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-11-16 | Initial version. | — |
| 2026-11-17 | Added H11 with a fair compute axis; TOST sample size; the √2 note for differences; SPRT error rates fixed in advance under Holm; additive ladder as a complement; motif suites; preliminary observations (§13). No confirmatory hypothesis or success criterion changed. | Audits of the second proposal (01b). |
| 2026-11-17 | Added §4.2, the `tools/gauntlet.mjs` runner. No confirmatory hypothesis, success criterion, or opponent configuration changed. | The lab can play Stockfish lite. Rating matches stay on the native engines named in §4.1. |
| 2026-11-21 | Specified Holm–Bonferroni $\alpha = 0.05 / 8 = 0.00625$ for pre-planned SPRT and H7 TOST (98.75 % CI, $n \approx 7{,}700$); clarified A4 ($`x_0 = 0, D_\text{max} \to \infty`$); tagged 2026-11-17 §13 rows as pre-fix (`8ef4857`). | Audit reconciliation and statistical consistency across core, UCI, WASM, lab, and tuner fixes. |

---

## 13. Preliminary observations (exploratory)

Recorded for transparency; none of these is a confirmatory test. Rows dated
2026-11-17 reflect the pre-fix baseline (`8ef4857`, before the SEE, ray-transport,
selection-fallback, delta-pruning, and UCI node-budget fixes).

| Date | Observation | Conditions |
| --- | --- | --- |
| 2026-11-17 | P-1: about 7 µs per visited position (fields, energy, move generation) | `nabla bench 2`, Intel i7-7700HQ, WSL2, one thread |
| 2026-11-17 | P-2: mean decision time 0.3 / 7.8 / 14.6 ms at Levels 0 / 1 / 2 | `nabla bench <level>`, 16 positions, same machine |
| 2026-11-17 | Level 1 vs Level 0: +521 ± 120 Elo (189 wins, 8 losses, 3 draws) | Self-play, 200 games, 4+0.04 s, `noob_3moves.epd`, fastchess 1.8.3 |
| 2026-11-17 | Level 2 vs Level 1: +334 ± 76 Elo (170 wins, 21 losses, 9 draws) | Same |
| 2026-11-17 | No illegal moves, crashes, or time losses in 400 games; UCI compliance 40/40 | Same |
| 2026-11-17 | Correctness gate, protocol §3: 1,000 games per level at 2 s + 0.02 s, temperature 0.30, `noob_3moves.epd`, 7 concurrent games. Zero illegal moves, crashes, disconnections, or time losses at any level. | fastchess 1.8.3, Intel i7-7700HQ under WSL2. A first run lost 9 (Level 1) and 38 (Level 2) games on time, which is why decisions now have a node budget (03 §7); the retest after the budget change is the clean run recorded here. |
| 2026-11-17 | `nabla-tune`, 40 Level 0 self-play games, 1,988 quiet positions. Logistic loss 0.1145 to 0.1134. Every tried coefficient moved one step down (`w_c` 0.06 to 0.04, `mu_n` 0.04 to 0.03, `g_0` 0.6 to 0.4, `beta_2` 0.6 to 0.4, `psi_i` 0.15 to 0.09, `h_max_eg` 1.5 to 1.1). | Not installed. The labels are Nabla's own results, so this is not H5 and not a rating. |
| 2026-11-17 | `tools/gauntlet.mjs` can run Nabla against native Stockfish, against Maia through lc0, or against a second Nabla. No match from this harness is recorded yet. | The binaries were not run for a scored match in this change. A browser game against Stockfish lite is not a substitute. |
| 2026-11-21 | Post-audit compliance (`40/40`) and stress gate: 200 self-play games/level (`L0/L1/L2`, 600 total, `4+0.04 s`, `Temperature = 30`, `noob_3moves.epd`, `concurrency = 3`, Windows) finished with 0 time losses, 0 illegal moves, and 0 crashes. | Commit `4b32220`, [`manifest.json`](../../benchmarks/results/manifest.json) |
| 2026-11-21 | Anchored rating pool (4,840 games, `8moves_v3.pgn`, `10+0.1 s`, joint Ordo `-s 1000` pinned on Stockfish 19 `1320/1500/1700/1900`): **`Nabla-L2 = 1607.0 ± 24.2`**, **`Nabla-L1 = 1336.7 ± 29.4`**, **`Nabla-L0 = 963.9 ± 43.4`**, `AB-PeSTO-2 = 1547.6 ± 34.0`, `Maia-1900 = 1450.7 ± 31.0`, `Maia-1500 = 1356.0 ± 26.7`, `AB-PeSTO-1 = 1334.2 ± 34.2`, `Maia-1100 = 1235.6 ± 31.7`, `AB-PeSTO-0 = 119.7 ± 155.7`. Head-to-head `Nabla-L2`: 58–40–2 (`+63 ± 65`) vs `SF-1500`, 137–36–27 (`+193 ± 47`) vs `Maia-1500`, 105–73–22 (`+56 ± 45`) vs `AB-PeSTO-2`. Book check on `noob_3moves.epd` agrees within CIs. | Post-audit full report in [`benchmark-report.md`](benchmark-report.md); note `exp2_29` (`AB-PeSTO-2 vs SF-1500`) omitted due to host CPU starvation forfeits |
| 2026-11-21 | Leave-one-out ablations (200g/variant, `30+0.3 s`, `c=1`): Level 0 `ablate_ex = -919.5 ± 155.7`, `ablate_pawn = -90.6 ± 43.2`, `lambda=0 = -43.7 ± 34.8`, `chi=0 = -15.7 ± 20.0`; Level 1 `ablate_pawn = -70.4 ± 45.4` (Holm `p=0.017`), `ablate_king = -59.6 ± 39.9` (`p=0.024`), `ablate_ex = -52.5 ± 43.0`, `chi=0 = -3.5 ± 30.5`. Monotonic Boltzmann `T` curve (`0 → -135 → -346 → -512 → -798 → 0/100`), `WAC-300 = 28.3%`, `BK-24 = 20.8%`, `KQK/KRK/KPK` conversion `95.0% / 48.5% / 74.5%` (collapsing to `59.5% / 7.5% / 38.5%` without `conf`), quiet eval Spearman `ρ = 0.8645` (`0.9785` middlegame), `48/48` bit-identical WASM parity (`1.42×` L2 ratio). | Exploratory baseline prior to `M4` coefficient tuning; see [`benchmark-report.md`](benchmark-report.md) |
