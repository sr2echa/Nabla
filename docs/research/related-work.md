# Related Work

> **Status:** Draft v0.1 · Maintained continuously; every new source is added here
> with a verification tag in the same commit that first relies on it.

**Verification tags.**
**[V]** verified against a primary source on the date given.
**[K]** recalled from the literature; bibliographic details must be checked against
the publisher's record before submission.

---

## 1. Positioning

| Approach | Search | Evaluation | Parameters | Interpretability | Strength goal |
| --- | --- | --- | --- | --- | --- |
| Classical engines (Shannon type A/B; Stockfish before NNUE) | Deep alpha-beta | Hand-crafted terms | 10³–10⁴ | Per term, but terms are heterogeneous | Maximal |
| Neural engines (AlphaZero, Lc0, Stockfish NNUE) | Deep MCTS or alpha-beta | Learned network | 10⁷–10⁸ | Low | Maximal |
| Search-free learned models (Ruoss et al.; Maia) | None (one network call) | Learned network | 10⁶–10⁸ | Low | Strong, or human-like |
| FFCE (Koch, 2026) | None (single ply) | Superposed fields plus 13 "borrowed" algorithms | ≈ 70 (`Params` struct), hand-set | Visual | Deliberately weak ("unfit") |
| **Nabla** | None, capture-only, or one reply (levels 0–2) | One ray-transport model, nine terms | 57, tuned | Exact per-term decomposition, visual | Measured and calibrated |

Nabla occupies a gap: an evaluation that is **small, physically structured, tuned
from data, and exactly explainable**, studied in the regime with little or no
search, with strength measured rather than disclaimed.

---

## 2. Closest prior work: field-based chess

- **Koch, G. H. M. (2026).** *Flow Field Chess: A Deliberately Unfit Engine for a
  Genuinely Fun Game.* Zenodo. DOI 10.5281/zenodo.21028769. Code:
  github.com/cronos3k/FFCE (GPL-3.0). **[V 2026-11-16]**
  Single-ply greedy descent on an energy functional over pressure, attack,
  resistance, trace, and flow fields, plus 13 optional algorithms (reaction–diffusion,
  Ising, lattice Boltzmann, and others); no strength claim. A detailed comparison,
  verified in its source, is in [`../design/01-proposal-review.md`](../design/01-proposal-review.md#2-prior-art-flow-field-chess).

  **Differences in Nabla:** an X-ray channel with blocker-dependent transmittance
  and X-ray-consistent SEE; a side-to-move-aware exchange term in place of summed
  SEE; a non-linear king model; repetition-aware boundary conditions in place of a
  watchdog; capture-only and one-reply levels; tuned coefficients; calibrated
  strength control; and a pre-registered evaluation including head-to-head games
  against FFCE.

---

## 3. Influence functions in board games

- **Zobrist, A. L. (1969).** A model of visual organization for the game of Go.
  *Proceedings of the AFIPS Spring Joint Computer Conference*, 34, 103–112. **[K]**
  Stones radiate numerical influence over the board; the earliest influence-function
  model in computer game playing.
- **Bouzy, B. (2003).** Mathematical morphology applied to computer Go.
  *International Journal of Pattern Recognition and Artificial Intelligence*, 17(2),
  257–268. **[K]** Dilation and erosion operators for territory estimation.

Nabla differs from Go influence models in that chess influence is anisotropic and
geometry-exact (rays, leaps), and in that tactical resolution (exchange evaluation)
is essential rather than optional.

---

## 4. Chess engines and evaluation

- **Shannon, C. E. (1950).** Programming a computer for playing chess.
  *Philosophical Magazine*, Ser. 7, 41(314), 256–275. **[K]** Type A (full-width)
  versus type B (selective) strategies; evaluation as a weighted sum of features.
- **Turing, A. M. (1953).** Digital computers applied to games. In B. V. Bowden
  (Ed.), *Faster than Thought* (pp. 286–310). Pitman. **[K]** A hand-simulated
  engine that searched only "considerable" moves (captures and recaptures) beyond
  the first ply: a historical precedent for Nabla's Level 1.
- **Campbell, M., Hoane, A. J., & Hsu, F. (2002).** Deep Blue. *Artificial
  Intelligence*, 134(1–2), 57–83. **[K]**
- **Stockfish** (software, GPL-3.0). Strength limitation via `UCI_LimitStrength`
  and `UCI_Elo`, range 1320–3190, documented as approximately CCRL Blitz and
  anchored to the Stash engine (`src/search.h`, `struct Skill`). **[V 2026-11-16]**
- **Chessprogramming Wiki.** Reference descriptions of static exchange evaluation,
  quiescence search, tapered evaluation, king safety, mop-up evaluation, and
  PeSTO's piece-square tables. **[K]**

---

## 5. Search-free and human-like learned models

- **Silver, D., et al. (2018).** A general reinforcement learning algorithm that
  masters chess, shogi, and Go through self-play. *Science*, 362(6419), 1140–1144. **[K]**
- **Ruoss, A., et al. (2024).** Amortized planning with large-scale transformers:
  A case study on chess. *NeurIPS 2024*. arXiv:2402.04494 (first circulated as
  "Grandmaster-Level Chess Without Search"). **[K]** A transformer trained on
  Stockfish evaluations plays at grandmaster level with no search, showing that the
  search-free regime is limited by evaluation quality, not by principle.
- **McIlroy-Young, R., Sen, S., Kleinberg, J., & Anderson, A. (2020).** Aligning
  superhuman AI with human behavior: Chess as a model system. *Proceedings of
  KDD 2020*. **[V 2026-11-16]** Maia models (1100–1900), run with `go nodes 1`.
- **Tang, Z., et al. (2024).** Maia-2: A unified model for human-AI alignment in
  chess. *NeurIPS 2024*. **[V 2026-11-16]**
- **Maia-3 / Chessformer (2026).** Chessformer: A unified architecture for chess
  modeling. *ICML 2026*. arXiv:2605.19091. **[V 2026-11-16]** (listed in the Maia
  repository README; authors to be confirmed from the paper).

---

## 6. Tuning and rating methodology

- **Elo, A. E. (1978).** *The Rating of Chessplayers, Past and Present.* Arco. **[K]**
- **Wald, A. (1945).** Sequential tests of statistical hypotheses. *Annals of
  Mathematical Statistics*, 16(2), 117–186. **[K]**
- **Spall, J. C. (1992).** Multivariate stochastic approximation using a
  simultaneous perturbation gradient approximation. *IEEE Transactions on Automatic
  Control*, 37(3), 332–341. **[K]**
- **Österlund, P. (2014).** Texel's tuning method. Chessprogramming Wiki. **[K]**
- **Ballicora, M. A.** *Ordo* rating software. **[K]**
- **fastchess** (software). Tournament runner with a built-in UCI compliance
  checker. github.com/Disservin/fastchess. **[V 2026-11-16]**
- **official-stockfish/books.** Opening books including `8moves_v3.pgn`,
  `noob_3moves.epd`, and `UHO_Lichess_4852_v1.epd`. **[V 2026-11-16]**
- **Kopec, D., & Bratko, I. (1982).** The Bratko–Kopec experiment: A comparison of
  human and computer performance in chess. *Advances in Computer Chess 3*. **[K]**
- **Reinfeld, F. (1958).** *Win at Chess.* (Source of the 300-position WAC suite.) **[K]**

---

## 7. Mathematics and physics used by analogy

- **Beer–Lambert law** (standard texts on radiative transfer). **[K]**
- **Born, M., & Oppenheimer, R. (1927).** Zur Quantentheorie der Molekeln.
  *Annalen der Physik*, 389(20), 457–484. **[K]**
- **Grady, L. J., & Polimeni, J. R. (2010).** *Discrete Calculus: Applied Analysis
  on Graphs for Computational Science.* Springer. **[K]** Gradients on graph
  edges, the setting of 03 Eq. (2).

---

## 8. Software dependencies

- **shakmaty** 0.30.2, GPL-3.0-or-later, updated 2026-10-07. **[V 2026-11-16]**
- **cozy-chess** 0.3.4, MIT, last published 2024-04-05 (alternative). **[V 2026-11-16]**
- **wasm-bindgen / wasm-pack**: moved from the archived `rustwasm` organisation to
  the `wasm-bindgen` organisation; wasm-pack 0.15.1 released 2026-10-30.
  **[V 2026-11-16]**
