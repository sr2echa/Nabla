# Hypotheses and Evaluation Protocol

> **Status:** Draft v0.1 · **Intent:** pre-registration. Hypotheses, success
> criteria, and analysis plans are fixed here **before** experiments run. Any later
> change is recorded in §12 with its date and reason, so the paper can distinguish
> confirmatory from exploratory results.

---

## 1. Research questions

| ID | Question |
| --- | --- |
| RQ1 | How strongly can an interpretable field energy play with no lookahead beyond one ply (Level 0)? |
| RQ2 | How much does each structural element (X-ray transport, side-to-move-aware exchange, breakdown king model, pawn transport) contribute? |
| RQ3 | How much do capture-only relaxation (Level 1) and a single reply (Level 2) add? |
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
| H7 | The momentum term adds no strength once repetition-aware boundary conditions exist. | Equivalence test (TOST) | 90 % CI of the difference within ±15 Elo |
| H9 | Nabla at Level 0 beats FFCE (default settings). | Head-to-head, ≥ 400 games | Elo difference > 0, 95 % CI excludes 0 |

### 2.2 Exploratory

| ID | Question | Measurement |
| --- | --- | --- |
| H8 | At equal alpha-beta depth (AB-*d*, $d \in \lbrace 2, 4 \rbrace$), how does $E$ compare with a classical material-plus-piece-square evaluation (PeSTO tables)? | Elo difference with 95 % CI |
| H10 | At matched pool rating, does temperature-based weakening match human moves more often than ε-greedy weakening? | Move-matching accuracy against Lichess games at the corresponding rating, the metric used for Maia |

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

---

## 5. Statistics

**Rating from score.** A score fraction $p$ corresponds to an Elo difference
$-400 \log_{10}(1/p - 1)$. Pool ratings are fitted jointly with **Ordo**, with the
Stockfish anchors fixed, and 95 % confidence intervals from Ordo's simulation.

**Sample size.** Near $p = \tfrac12$, the 95 % half-width of a rating difference
is approximately

```math
h \approx 1.96 \cdot \frac{\sigma}{\sqrt{n}} \cdot \left. \frac{d\,\mathrm{Elo}}{dp} \right|_{p = 1/2}
= 1.96 \cdot \frac{0.5}{\sqrt{n}} \cdot \frac{1600}{\ln 10}
\approx \frac{681}{\sqrt{n}},
\tag{1}
```

assuming no draws ($\sigma = 0.5$). Draws and game pairing reduce variance, so the
table is conservative.

| Games $n$ | 100 | 200 | 400 | 1,000 | 2,000 | 4,000 |
| --- | --- | --- | --- | --- | --- | --- |
| 95 % half-width (Elo) | ±68 | ±48 | ±34 | ±22 | ±15 | ±11 |

**Sequential tests.** A/B changes (H2, H3, H5) use Wald's SPRT on logistic Elo with
bounds $[\mathrm{elo}_0, \mathrm{elo}_1] = [0, 10]$, $\alpha = \beta = 0.05$, and the
pentanomial model over game pairs.

**Equivalence.** H7 uses two one-sided tests with a ±15 Elo margin.

**Multiple comparisons.** Holm–Bonferroni correction across the eight confirmatory
hypotheses (H1–H7, H9). Exploratory results are labelled as such and not corrected.

---

## 6. Tuning procedure

### 6.1 Stage 1 — Texel tuning (coefficients marked T in 02 §9)

1. **Data.** Quiet positions (static evaluation equals the Level 1 quiescence value)
   labelled with game results $r \in \lbrace 0, \tfrac12, 1 \rbrace$, drawn from the
   Lichess open database (games with both players rated ≥ 1800) and from Nabla
   self-play. Positions from opening books and test suites are excluded.
2. **Loss.** Mean squared error between $r$ and $\sigma_\text{L}(k E)$, with the scale
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
| A2 | No X-ray channel ($\chi = 0$) | H2 | 0, 1 |
| A3 | Summed SEE over both colours in place of Eq. (16) | H3 | 0 |
| A4 | Linear king pressure ($x_0 \to -\infty$) | RQ2 | 0, 1 |
| A5 | No tropism ($g_t = 0$) | RQ2 | 0, 1 |
| A6 | Passage opacity fixed at $\theta_\text{pp} = 1$ | RQ2 | 1 |
| A7 | No confinement ($\zeta_1 = \zeta_2 = 0$) | RQ2, endgame suite | 0, 1 |
| A8 | Momentum term enabled | H7 | 0 |
| A9 | Charge-proportional control weights ($\alpha_t \propto q_t$) | RQ2 | 0, 1 |
| A10 | Knight halo enabled | RQ2 | 0 |
| A11 | Repetition rule disabled | Sanity check | 0 |

---

## 8. Test suites

| Suite | Content | Metric |
| --- | --- | --- |
| Tactics | Win At Chess (300 positions); Bratko–Kopec (24 positions) | Best-move solve rate per level |
| Endgame conversion | 200 random won positions each of KQK, KRK, KPK, winning side to move, against full-strength Stockfish | Fraction converted within 50 moves |
| Evaluation agreement | 10,000 quiet positions | Spearman correlation of $E$ with a fixed-depth Stockfish evaluation; sign agreement |
| Blunder profile | All moves from the calibration games | Fraction of moves losing ≥ 2 pawns by Stockfish analysis, per level and $\tau$ |

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
