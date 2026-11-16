# Paper Outline

> **Status:** Draft v0.1 · Maps each section of the planned paper to the
> documents that already contain its material, so that drafting is assembly rather
> than reconstruction. Result slots are marked ⟨R: hypothesis⟩.

---

## 1. Working title

> **Nabla: Chess by Energy Descent on Ray-Transport Fields**

Alternative: *How Far Can Fields Go? An Interpretable Field Energy for Low-Search
Chess.*

**Candidate venues** (to be confirmed against current calls): IEEE Transactions on
Games; ICGA Journal; IEEE Conference on Games (CoG); Advances in Computer Games (ACG).

---

## 2. Abstract skeleton

> Chess engines reach superhuman strength through deep search over evaluations
> that are either hand-crafted and heterogeneous or learned and opaque. We study
> the opposite regime: a small, physically structured evaluation used with little
> or no search. Nabla models each piece as an emitter whose influence travels along
> its exact attack rays and is attenuated by blocking pieces, separating direct
> control from X-ray influence. A nine-term energy functional over these fields,
> with 57 tuned coefficients, scores positions; every evaluation decomposes exactly
> into named terms. Moves are chosen by steepest ascent of the energy on the game
> graph, optionally relaxed by capture-only search or a single reply. Against an
> anchored engine pool, Nabla reaches ⟨R: H4⟩ Elo without lookahead and ⟨R: H4⟩ with
> one reply; ablations attribute ⟨R: H1–H3⟩ to ray transport and exchange modelling.
> A Boltzmann temperature controls strength with a calibration error of ⟨R: H6⟩ Elo.

---

## 3. Section map

| § | Section | Content | Source |
| --- | --- | --- | --- |
| 1 | Introduction | Motivation (interpretability versus strength; the low-search regime); RQ1–RQ5; contributions | Protocol §1; review §2.3 |
| 2 | Related work | Influence functions, classical and neural engines, search-free models, FFCE | [`related-work.md`](related-work.md) |
| 3 | The field model | Ray transport, per-side fields, energy terms, symmetry, classical limits, analogies | 02 §1–§6, §10, §11 |
| 4 | Move selection and strength control | Graph gradient, boundary conditions, levels, Boltzmann policy, calibration | 03; 04 |
| 5 | Implementation | Rust core, UCI and WebAssembly targets, determinism | 05 §1–§6 |
| 6 | Experimental setup | Pool, books, time control, statistics, tuning | Protocol §3–§6 |
| 7 | Results | Per-level strength ⟨R: H4⟩; ablations ⟨R: H1–H3, A4–A11⟩; tuning ⟨R: H5⟩; strength control ⟨R: H6, H10⟩; versus FFCE ⟨R: H9⟩; evaluation under search ⟨R: H8⟩; performance ⟨R: P-1–P-3⟩ | Protocol §7–§9 |
| 8 | Interpretability case studies | Battery and pin; king breakdown; passed-pawn race; KRK confinement; a blunder explained | Lab exports (06 §6) |
| 9 | Limitations and threats to validity | — | 02 §12; protocol §11 |
| 10 | Conclusion | Answers to RQ1–RQ5; future work (human-scale calibration, style presets, user studies) | — |
| A | Appendix: parameters | Initial and tuned values | 02 §9 |
| B | Appendix: derivations | Review C-1 and C-2; symmetry proposition | 01 §3; 02 §6 |
| C | Appendix: reproducibility | Manifests, data deposit, regeneration command | Protocol §10 |
| D | Appendix: as-proposed baseline | The Nabla-P functional | 00 |

---

## 4. Planned figures

| ID | Figure | Source |
| --- | --- | --- |
| F1 | Pipeline from position to move | 02 §3 and 03 §1 diagrams |
| F2 | Ray transport through a battery and a pin, annotated with $T_k$ | Lab, layer 4 |
| F3 | One middlegame position: $\Phi$, $\Omega$, and $𝐉$ | Lab, layers 1, 2, 5 |
| F4 | King breakdown curve with sample positions marked | Lab, layer 8 |
| F5 | Rating by level with 95 % CIs | H4 |
| F6 | Ablation forest plot | H1–H3, A4–A11 |
| F7 | Rating versus temperature, per level, with the calibrated path | H6 |
| F8 | A decision explained: per-term gradients of the top candidates | Lab, layer 7 |
| F9 | Endgame conversion rates by suite and level | Protocol §8 |

## 5. Planned tables

| ID | Table | Source |
| --- | --- | --- |
| T1 | Positioning against prior approaches | Related work §1 |
| T2 | Energy terms, classical limits, coefficient counts | 02 §9–§10 |
| T3 | Pool ratings | Protocol §4–§5 |
| T4 | Sequential test outcomes | H2, H3, H5 |
| T5 | Test-suite results | Protocol §8 |
| T6 | Performance | P-1–P-3 |

---

## 6. Writing rules

1. Symbols follow [`../notation.md`](../notation.md); equations keep their 02/03/04
   numbering in a cross-reference table during drafting.
2. Every number states its scale (04 §6) and its confidence interval.
3. Confirmatory and exploratory results are labelled as defined in the protocol.
4. Physical analogies appear only as listed in the analogy register (02 §11).
5. Novelty claims are limited to those in review §2.3.
