# 01b — Review of the Second Proposal

> **Status:** Accepted · **Reviews:** [`00b-second-proposal.md`](00b-second-proposal.md)
> · **Verified on:** 2026-11-16 to 2026-11-17 · **Changes adopted in:** specification
> v0.2 (02–06) and engine v0.1

The second proposal audits the first one, proposes a formal specification, a
repository layout, a visualiser, and an experimental plan. This document checks
every claim, records what was adopted, and records what the same audits found
wrong in **our own** specification.

---

## Summary

1. **One real defect that our first review missed.** The original proposal never
   fixed whose point of view the score takes, so Black would have maximised
   White's score. This is now finding C-5 of
   [`01-proposal-review.md`](01-proposal-review.md). Our specification already
   handled it (negamax, 03 §2).
2. **Several useful ideas, all already covered or now adopted.** Self-blocking
   rays, a Cartesian gradient kept for display only, shelter-modulated king
   danger, reporting the search-free level separately, exchange-threat halos, and
   X-ray beams.
3. **Many claims are wrong.** Among them:
   - A boundary-value problem is "solved": no.
   - The approach is "genuinely novel": prior art exists.
   - One ply means "zero tree nodes".
   - Quiescence is "energy relaxation".
   - The graph Laplacian is a gradient.
   - The shield formula is inverted.
   - Equal node budgets make a fair comparison with Stockfish.
   - "Zero-rule" emergence can be verified.
   - Its formal specification (Part 2) repeats most defects of the original.
4. **The audits also found defects in our specification v0.1.** Seventeen are
   listed in §4, together with an eighteenth found by our own correctness gate;
   all are fixed in v0.2 and in the engine, with tests where behaviour changed.

---

## 1. Method

Four independent audits were run, each with its own instructions and sources:

| Audit | Scope | Method |
| --- | --- | --- |
| Mathematics and physics | Every equation in 00b; our 02–04 and protocol | Derivation, counterexamples, and exhaustive enumeration in Python (all 2,256 one-pawn-versus-one-pawn placements; 6,048 king-and-pawn races; a 10,000-trial floating-point summation-order simulation) |
| Chess-engine correctness | SEE, exchange term, quiescence, Level 2, boundary conditions, king safety, UCI | Expert review against standard engine practice |
| Tooling and API facts | GitHub math and Mermaid, Stockfish node limits, fastchess, shakmaty, Chessground, Rust | Primary sources: production bundles, upstream source at stated commits, crate source, release APIs, and runs of Stockfish 19 and MathJax 4.1.3 |
| Bibliography | Every reference, venues, missing prior work | Crossref, DOIs, publisher pages, arXiv, DBLP |

The engine itself supplied a fifth source of evidence: invariant tests, the
fastchess compliance checker, and self-play matches (§5).

---

## 2. Claim-by-claim verdicts

Verdicts: **Correct**, **Partly correct**, **Incorrect**, **Covered** (correct, and
already handled by our specification).

### 2.1 Introduction

| Claim | Verdict | Evidence and action |
| --- | --- | --- |
| Evaluation is "solving a discrete boundary-value problem on an 8×8 anisotropic lattice". | **Incorrect** | No unknowns are solved for and no operator is inverted. The fields are explicit forward sums along rays; board edges merely truncate rays. "Boundary-value problem" is added to the terminology avoid-list. |
| The approach is "genuinely novel". | **Incorrect** | Flow Field Chess (Koch, 2026) uses the same single-ply field-energy paradigm. Influence functions date to Zobrist (1969; thesis 1970) for Go, and Greer et al. (1999) used a chess square-control map for move ordering. Our defensible contributions are those of 01 §2.3. |
| Suitable venues include ICGA Journal, IEEE Transactions on Games, "or a NeurIPS/AAAI workshop on non-tree-search game playing". | **Partly correct** | The two journals are active and publish chess research. No NeurIPS or AAAI workshop on non-tree-search game playing exists; relevant venues are listed in the paper outline. |

### 2.2 Part 1: the five "flaws"

| Claim | Verdict | Evidence and action |
| --- | --- | --- |
| 1.1 Sign-symmetry bug: with White-positive charges, Black maximising $H$ plays for White. | **Correct** for 00; **Covered** | Real defect of 00, missed by 01, now C-5. Our 03 Eqs. (1)–(2) score each child from the mover's side. The proposed "ego-centric" fix is ill-defined: in $S'$ the active player is the opponent, so either $`H(S')`$ is the opponent's view (the bug returns) or $H$ needs an extra argument that its policy formula omits. |
| 1.2 "Suicide by field": a knight on e4 cuts the e1 rook's field behind it by 58 %, penalising development. | **Partly correct**; **Covered** | The 58 % applies only to the rook's own contribution, not to the total; the knight's emission is unchanged and it blocks Black's rays. In chess terms the rook really does stop controlling e5–e8, so reduced influence is correct, not a bug. Fix 1 (a material term) cannot change move ranking, since material is the same for every quiet move. Fix 2 classes the knight as a non-aligned blocker, which makes the loss larger. Our model: exact direct channel, residual X-ray $\theta_\text{fr}\chi \approx 0.09$, battery partners at $\theta_\text{bat}$. |
| 1.3 Replace the Cartesian gradient by the piece-mobility graph Laplacian $L = D - A$; use flux divergence in the solver. | **Incorrect** (partly covered) | The graph gradient is the incidence operator $B$; $L = B^\top B$ is the divergence of the gradient, a second-order operator. Attack graphs depend on occupancy and are directed for pawns, so a static adjacency matrix is not chess-exact. The divergence of the ray flux adds nothing: at a piece it equals its weighted mobility, at a target it equals $`-A_c(i)`$, and its board sum is identically 0. Covered: the Cartesian gradient is display-only (02 §8), and 03 Eq. (2) is the incidence gradient on the game graph. |
| 1.4 Shield-modulated gravity, $G^\text{eff} = G^{(0)}(0.2 + 0.8(1 - \bar\varepsilon_\text{shield}))\,\text{Phase}$. | **Incorrect** (inverted) | With enemy pawns at $\varepsilon = 0.08$: intact shield 0.936 (near maximum), open file 0.2 (minimum), the opposite of the prose. The corrected form is $0.2 + 0.8\bar\varepsilon$. The term is also absent from its own $H$ (Part 2). Covered: our shelter is subtracted inside the breakdown threshold (02 Eq. (19)), with the correct sign. |
| 1.5 Keep the 1-ply mode as the primary contribution, "with 0 tree nodes searched"; frame quiescence as "energy relaxation until $\partial\Phi/\partial t \to 0$". | **Partly correct** | Reporting the search-free level separately matches decision D-001. But one ply visits about 35 children, a depth-1 tree. Quiescence is an adversarial capture minimax, not the relaxation of one energy, and the model has no time variable. Our positioning statement (03 §9) and analogy register (02 §11) state this precisely. |

### 2.3 Part 2: the formal specification

| Item | Verdict | Evidence |
| --- | --- | --- |
| $\rho$ "signed relative to active player $c$" | **Incorrect** | Ill-defined in $S'$ (see 1.1). The consistent form is negamax, $`-e(S')`$. |
| $\varepsilon \in (0,1]^{64}$, one coefficient for every friendly piece | **Incorrect** | Transmission depends on the emitter's colour, and battery compatibility depends on direction and blocker type (01 M-2). It also contradicts its own Part 1 fix (0.70 aligned, 0.25 non-aligned). |
| Ray kernel passes through enemy pieces into a single field | **Incorrect** | Credits control of squares behind enemy pieces (01 M-2a). Ours separates direct and X-ray channels. |
| Knight halo "scaled by local square safety"; promotion potential "along the file" | **Incomplete** | Neither is defined. The promotion term is still an unbounded exponential, now gated by a binary predicate. |
| $\Phi_\text{king}$ with $G^\text{eff}$ and $G_\text{self}$ | **Incorrect** | It does not appear in $H$, so it cannot affect play. Summed over squares it would be independent of piece positions anyway (01 C-1). |
| $w_1 \sum_i \Phi_\text{field}$ | **Incorrect** | Still equals charge × weighted mobility (01 C-2). A central queen scores 219 units against a pawn's 2.7. |
| $V_\text{rep}$ summed over all of the mover's pieces | **Incorrect** | Still double-counts and gives no credit for the mover's own threats (01 C-3). |
| Terminal states | **Missing** | Mate, stalemate, and draws are still undefined (01 M-5). |
| Boltzmann policy over $`H(𝒯(S, m))`$ | **Correct form** | Fixes the original's notation error. Temperature still has no unit; ours is in pawns (04). |

### 2.4 Part 3: repository layout

| Item | Verdict | Action |
| --- | --- | --- |
| `cozy-chess` wrapper | **Superseded** | Decision D-005 chose `shakmaty` (maintained, GPL-compatible, FEN/SAN/Zobrist). |
| `no_std` core | **Possible, not needed** | `shakmaty` is `no_std`-capable; the core needs neither I/O nor `std` features beyond `alloc`, but WebAssembly does not require `no_std`. |
| 32-byte aligned SIMD tensors | **Premature** | Measured cost is about 7 µs per position, inside budget; exactness rules (05 §6) favour simple scalar code. |
| `experiments/` with SPSA and gauntlet scripts | **Adopted in substance** | Planned as `tools/` (Milestones 4–5). |
| React + Vite + Chessground visualiser | **Deferred** | Decision D-012. Chessground is GPL-3.0-or-later and works on a static site (06 §9). |

### 2.5 Part 4: visualiser

| Item | Verdict | Action |
| --- | --- | --- |
| Heatmap of $\Phi_\text{field} + \Phi_\text{king}$ | **Incorrect** | Would show a king potential that does not enter the decision. Not offered (06 §3). |
| Bilinear upscaling "so the field looks like a continuous fluid" | **Scientific-integrity issue** | Invents values between squares, for example across pawn walls. Allowed only as a labelled interactive view, never in figures (06 §3, §6). |
| RK2 tracer particles on $\nabla_\text{cart}\Phi$ | **Misleading** | Shows a Euclidean flow the engine never uses. Particles may follow the lines of force $𝐉$ instead (06 §3). |
| X-ray beams through semi-permeable pieces | **Adopted** | Layer 4 draws X-ray influence as dashed beams. |
| Instability halos for pieces under threat | **Adopted** | Layer 11, "exchange threats", from SEE gains. |
| Ghost preview in under 0.05 ms | **Plausible** | Native cost is about 7 µs per position; the WebAssembly budget is 3× native. |
| Term-by-term "waterfall" per candidate | **Covered** | Exact per-term explanations already exist (03 §6) and sum to the score. |
| 300-DPI figure export | **Partly correct** | DPI applies to PNG only; figures are exported as SVG (vector) plus PNG (06 §6). |

### 2.6 Part 5: experimental plan

| Item | Verdict | Action |
| --- | --- | --- |
| Additive ablation ladder with 500-game gauntlets | **Under-powered and order-dependent** | 500 games give ±30 Elo per gauntlet and ±43 for a step between two gauntlets; detecting a 20-Elo step at 80 % power needs about 2,400 head-to-head games. The order of addition confounds each step. Adopted as a complement to leave-one-out ablations, with SPRT (protocol §7). |
| Elo versus "evaluated states per move", against Stockfish at `nodes` 35–1000 | **Unfair as stated** | Stockfish counts every make-move including quiescence, overshoots small limits (35 requested gives 47–120; measured with Stockfish 19), and keeps its hash between moves; NNUE evaluations also cost far more than ours. Adopted as exploratory H11 with a fair axis: identical node definitions, evaluation counts, and single-thread CPU time, with the hash cleared (protocol §2.2). |
| "Zero-rule verification" of tactical emergence | **Impossible as stated** | SEE, the passed-pawn predicate, line compatibility, king zones, and terminal rules are discrete rules. Adopted as motif-labelled suites with targeted ablations ($\chi = 0$, $`\theta_\text{en} = 0`$), reported as solve-rate changes (protocol §8). |
| Human alignment via Maia-style move matching | **Covered** | Exploratory H10. |

---

## 3. What was adopted from the second proposal

| Idea | Where |
| --- | --- |
| Side-to-move sign convention made explicit (finding C-5) | 01 C-5; 03 §2 |
| Exchange-threat halos | 06 layer 11 |
| X-ray beams in the display | 06 layer 4 |
| Additive ablation ladder (as a complement) | Protocol §7 |
| Compute-budget comparison (with a fair axis) | Protocol H11 |
| Motif-labelled tactical suites | Protocol §8 |

---

## 4. Defects found in our specification v0.1

| ID | Defect | Fix in v0.2 | Location |
| --- | --- | --- | --- |
| A1 | Eq. (16) credited one move with both a capture and a parry (by up to 2.4 pawns). | Capture and parry are exclusive: a $\max$ of two branches. | 02 §5.4 |
| A2 | The exchange term let checks count as captures and ignored that a side in check cannot parry; checking forks were invisible at Level 0. | King excluded from targets; in-check rule; Level 0 check extension. | 02 §5.4; 03 §4.1 |
| A3 | King danger grew without bound (violating P7), and its $x_0 \to -\infty$ limit diverged. | Zero-baselined breakdown, saturated by $D_\text{max}$; $G_0$ lowered to 0.6. | 02 §5.5 |
| A4 | $\beta_1 = 0.8$ made every defended trade look profitable at Level 0. | $\beta_1 = 1$. | 02 §9.4 |
| A5 | The absolute score cap broke the $\tau \to 0$ limit and merged mates. | Cap the gap to the best move instead. | 04 §2 |
| A6 | The random key replayed games against deterministic opponents. | Game counter added to the key. | 04 §2 |
| A7 | $`(\alpha_t, \Phi_0, x_0, \sigma_b, \xi, \omega_\text{chk}, G_0)`$ had an exact scaling degeneracy. | $\Phi_0$ fixed at 1. | 02 §9.2 |
| A8 | Confinement counted squares behind a checked king as safe, and its gate fired in pawn-up rook endings. | Attacks seen through the king; gate on the non-pawn lead. | 02 §5.8 |
| A9 | The rule of the square failed in 22 of 6,048 cases (adjacent defending king with the move). | Capture exception; $\sigma_u$ sharpened to 0.1. | 02 §5.7 |
| A10 | Passage opacity counted attacked squares, not blocking pawns, for $\theta_\text{pp} < 1$. | Count enemy pawns in the front span. | 02 §5.7 |
| A11 | Quiescence mixed fail-hard and fail-soft, stopped evasions at the capture cap, and delta-pruned captures that switch on large endgame terms. | Fail-soft throughout; separate hard cap for evasions; pruning exceptions. | 03 §4.2 |
| A12 | Alpha-beta at the root would return bounds, corrupting the policy, MultiPV, and explanations. | Every root move searched with a full window (already true in the code). | 03 §4 |
| A13 | The bit-exact antisymmetry claim stated no implementation conditions; our own test then found an absolute tie-break in SEE that broke it. | Five stated conditions; relative tie-break; `libm`. | 02 §6; 05 §6 |
| A14 | The king's control weight rewarded middlegame king walks. | Tapered by $1 - \varphi$. | 02 §4.2 |
| A15 | "Field support equals the attack sets" fails when a weight is 0. | All set predicates use attack bitboards. | 02 P1, §4.2 |
| A16 | Analogy register errors (Born–Oppenheimer settling is minimax; the tropism kernel is not Newtonian), and principle P2 overclaimed. | Corrected. | 02 §1, §11 |
| A17 | UCI reporting: depth 0 at Level 0, nodes counted inconsistently. | Depth 1/1/2; every visited position counted once; evaluations reported separately. | 03 §6 |
| A18 | No search budget: rare quiescence explosions lost games on time (found by our own correctness gate, not by the audits). | Deterministic node budget derived from the clock; root moves ordered by Level 0 score; Level 0 fallback when exhausted. | 03 §7 |

Rendering conventions were corrected in the same pass, because GitHub blocks
`\operatorname`, Chromium ignores `\mathbf` and `\mathcal`, `\tag` labels depend on
the browser, and an underscore after a closing brace can turn inline mathematics
into emphasis (see [`../notation.md`](../notation.md) §1).

---

## 5. Evidence from the implementation (engine v0.1)

| Check | Result |
| --- | --- |
| Exact colour antisymmetry, per term, on more than 10,000 random positions | Passes. It first failed and exposed the SEE tie-break defect (A13). |
| fastchess 1.8.3 UCI compliance | "Engine passed all compliance checks" (40 of 40). |
| Self-play, Level 1 vs Level 0, 200 games at 4+0.04 s, `noob_3moves.epd` | +521 ± 120 Elo (189 wins, 8 losses, 3 draws). |
| Self-play, Level 2 vs Level 1, same conditions | +334 ± 76 Elo (170 wins, 21 losses, 9 draws). |
| Illegal moves, crashes, time losses in those 400 games | None. |

The self-play results are exploratory sanity checks, not confirmatory tests of H4:
they compare Nabla with itself and were not run under the protocol's anchored
pool.

---

## 6. Not adopted, recorded as limitations

These suggestions from the audits are sound but were deferred to tuning or later
milestones; each is listed in 02 §12 so that it is measured rather than forgotten:
attacker-count gating of king pressure, a reduced pawn weight in king pressure, a
castling incentive, capture-aware threat removal and unsaveable-piece detection in
the exchange term, a KBNK corner term, race resolution between unstoppable passers,
and draw scaling for drawish material.
