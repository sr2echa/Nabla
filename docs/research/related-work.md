# Related Work

> **Status:** Draft v0.2 · Maintained continuously; every new source is added here
> with a verification tag in the same commit that first relies on it.

**Verification tags.**
**[V]** verified against a primary record (publisher, DOI resolver, Crossref,
arXiv, or the project's own repository) on the date given.
**[U]** not verified; must be checked before submission.

---

## 1. Positioning

| Approach | Search | Evaluation | Parameters | Interpretability | Strength goal |
| --- | --- | --- | --- | --- | --- |
| Classical engines (Shannon type A/B; Stockfish before NNUE) | Deep alpha-beta | Hand-crafted terms | 10³–10⁴ | Per term, but terms are heterogeneous | Maximal |
| Neural engines (AlphaZero, Lc0, Stockfish NNUE) | Deep MCTS or alpha-beta | Learned network | 10⁷–10⁸ | Low | Maximal |
| Search-free learned models (Ruoss et al.; Maia) | None (one network call) | Learned network | 10⁶–10⁸ | Low | Strong, or human-like |
| FFCE (Koch, 2026) | None (single ply) | Superposed fields plus 13 "borrowed" algorithms | ≈ 70 (`Params` struct), hand-set | Visual | Deliberately weak ("unfit") |
| **Nabla** | None, capture-only, or one reply (levels 0–2) | One ray-transport model, nine terms | 57, to be tuned | Exact per-term decomposition, visual | Measured and calibrated |

Nabla occupies a gap: an evaluation that is **small, physically structured, tuned
from data, and exactly explainable**, studied in the regime with little or no
search, with strength measured rather than disclaimed. No peer-reviewed
potential-field or electrostatic chess evaluation other than FFCE was found
(search of 2026-11-17).

---

## 2. Closest prior work

- **Koch, G. H. M. (2026).** *Flow Field Chess: A deliberately unfit engine for a
  genuinely fun game.* Zenodo. https://doi.org/10.5281/zenodo.21028769 (published
  2026-06-29, CC-BY-4.0). Code: github.com/cronos3k/FFCE (GPL-3.0). **[V 2026-11-17]**
  Single-ply greedy descent on an energy functional over pressure, attack,
  resistance, trace, and flow fields, plus 13 optional algorithms; no strength
  claim. A source-level comparison is in
  [`../design/01-proposal-review.md`](../design/01-proposal-review.md#2-prior-art-flow-field-chess).
  FFCE credits "early chess influence functions" to Zobrist (1970), but that work
  concerns Go.

  **Differences in Nabla:** an X-ray channel with blocker-dependent transmittance
  and X-ray-consistent SEE; an exchange term that is aware of the side to move;
  a saturating king-breakdown model; repetition-aware boundary conditions in place
  of a watchdog; capture-only and one-reply levels; coefficients to be tuned;
  calibrated strength control; and a pre-registered evaluation including
  head-to-head games against FFCE.
- **Greer, K. R. C., Ojha, P. C., & Bell, D. A. (1999).** A pattern-oriented
  approach to move ordering: The Chessmaps heuristic. *ICCA Journal, 22*(1), 13–21.
  https://doi.org/10.3233/ICG-1999-22103 **[V 2026-11-17]** A 64-square control map
  fed to a neural network ranks board sectors by influence: the closest academic
  "influence map for chess", used for move ordering rather than evaluation.
- **Greer, K. (2000).** Computer chess move-ordering schemes using move influence.
  *Artificial Intelligence, 120*(2), 235–250.
  https://doi.org/10.1016/S0004-3702(00)00026-6 **[V 2026-11-17]**
- **Chessprogramming Wiki, "Square Control".** Engines that sum reciprocal values of
  the controlling pieces over squares, weighted by a square matrix: the engineering
  precedent for a control field. **[V 2026-11-17]**

---

## 3. Influence functions and geometric approaches in board games

- **Zobrist, A. L. (1969).** A model of visual organization for the game of Go.
  *Proceedings of the AFIPS Spring Joint Computer Conference* (Vol. 34, pp. 103–112).
  https://doi.org/10.1145/1476793.1476819 **[V 2026-11-17]** Stones radiate
  numerical influence over the board: the earliest influence function in computer
  game playing.
- **Zobrist, A. L. (1970).** *Feature extraction and representation for pattern
  recognition and the game of Go* (PhD thesis). University of Wisconsin–Madison.
  **[V 2026-11-17]**
- **Bouzy, B. (2003).** Mathematical morphology applied to computer Go.
  *International Journal of Pattern Recognition and Artificial Intelligence, 17*(2),
  257–268. https://doi.org/10.1142/S0218001403002356 **[V 2026-11-17]**
- **Stilman, B. (2000).** *Linguistic geometry: From search to construction.*
  Kluwer / Springer US. **[V 2026-11-17]** Geometric trajectories and zones as a
  replacement for search.

Nabla differs from Go influence models in that chess influence is anisotropic and
geometry-exact (rays, leaps), and in that tactical resolution (exchange evaluation)
is essential rather than optional.

---

## 4. Chess engines and evaluation

- **Shannon, C. E. (1950).** Programming a computer for playing chess. *The London,
  Edinburgh, and Dublin Philosophical Magazine and Journal of Science* (Ser. 7),
  *41*(314), 256–275. https://doi.org/10.1080/14786445008521796 **[V 2026-11-17]**
- **Turing, A. M., Strachey, C., Bates, M. A., & Bowden, B. V. (1953).** Digital
  computers applied to games. In B. V. Bowden (Ed.), *Faster than thought*
  (pp. 286–310). Sir Isaac Pitman & Sons. **[V 2026-11-17]** Turing wrote the chess
  section (pp. 288–298): a hand-simulated engine that searched only "considerable"
  moves (captures and recaptures) beyond the first ply, a historical precedent for
  Nabla's Level 1. Cite as "Turing (1953), chess section".
- **Campbell, M., Hoane, A. J., Jr., & Hsu, F.-h. (2002).** Deep Blue. *Artificial
  Intelligence, 134*(1–2), 57–83. https://doi.org/10.1016/S0004-3702(01)00129-1
  **[V 2026-11-17]**
- **Stockfish** (software, GPL-3.0). Strength limitation via `UCI_LimitStrength`
  and `UCI_Elo`, range 1320–3190, documented as approximately CCRL Blitz and
  anchored to the Stash engine (`src/search.h`, `struct Skill`). Node limits are
  checked only in the main search, not in quiescence, so small `go nodes` limits
  overshoot (35 requested gives 47–120 with Stockfish 19). **[V 2026-11-17]**
- **Friederich, R. (n.d.).** PeSTO's evaluation function. Chessprogramming Wiki.
  Piece-square tables only, tapered, Texel-tuned. **[V 2026-11-17]**
- **Chessprogramming Wiki.** Reference descriptions of static exchange evaluation,
  quiescence search, tapered evaluation, king safety, and mop-up evaluation.
  **[V 2026-11-17]**

---

## 5. Search-free, human-like, and interpretable models

- **Silver, D., et al. (2018).** A general reinforcement learning algorithm that
  masters chess, shogi, and Go through self-play. *Science, 362*(6419), 1140–1144.
  https://doi.org/10.1126/science.aar6404 **[V 2026-11-17]**
- **Ruoss, A., et al. (2024).** Amortized planning with large-scale transformers:
  A case study on chess. *Advances in Neural Information Processing Systems 37*
  (pp. 65765–65790). https://doi.org/10.52202/079017-2102; arXiv:2402.04494 (v1
  titled "Grandmaster-level chess without search"). **[V 2026-11-17]** A
  270M-parameter transformer trained on Stockfish evaluations reaches a Lichess
  blitz Elo of 2895 **against humans** (lower against bots) with no search: the
  search-free regime is limited by evaluation quality, not by principle.
- **McIlroy-Young, R., Sen, S., Kleinberg, J., & Anderson, A. (2020).** Aligning
  superhuman AI with human behavior: Chess as a model system. *Proceedings of
  KDD 2020*. **[V 2026-11-16]** Maia models (1100–1900), run with `go nodes 1`.
- **Tang, Z., et al. (2024).** Maia-2: A unified model for human-AI alignment in
  chess. *NeurIPS 2024*. **[V 2026-11-16]**
- **Monroe, D., Eilender, G., Chalmers, P., Tang, Z., & Anderson, A. (2026).**
  Chessformer: A unified architecture for chess modeling. *Proceedings of ICLR 2026.*
  arXiv:2605.19091. **[V 2026-11-17]** (The Maia repository README lists ICML; the
  proceedings record is ICLR.)
- **McGrath, T., et al. (2022).** Acquisition of chess knowledge in AlphaZero.
  *PNAS, 119*(47), e2206625119. https://doi.org/10.1073/pnas.2206625119
  **[V 2026-11-17]** Interpretability context: concepts recovered from a network,
  where Nabla's concepts are explicit by construction.

---

## 6. Tuning and rating methodology

- **Elo, A. E. (1978).** *The rating of chessplayers, past and present.* Arco.
  **[V 2026-11-17]**
- **Wald, A. (1945).** Sequential tests of statistical hypotheses. *Annals of
  Mathematical Statistics, 16*(2), 117–186. https://doi.org/10.1214/aoms/1177731118
  **[V 2026-11-17]**
- **Spall, J. C. (1992).** Multivariate stochastic approximation using a
  simultaneous perturbation gradient approximation. *IEEE Transactions on Automatic
  Control, 37*(3), 332–341. https://doi.org/10.1109/9.119632 **[V 2026-11-17]**
- **Österlund, P. (2014, January 31).** The Texel evaluation function optimization
  algorithm. Computer Chess Club (TalkChess); described as "Texel's Tuning Method"
  on the Chessprogramming Wiki. **[V]** for the wiki page; **[U]** for the original
  forum post.
- **Ballicora, M. A. (2015).** *Ordo: Ratings for chess and other games* [Software,
  GPL-3.0]. https://github.com/michiguel/Ordo **[V 2026-11-17]**
- **fastchess** (software). Tournament runner with a UCI compliance checker
  (`--compliance`) and SPRT (`-sprt elo0= elo1= alpha= beta= model=`); v1.8.3-alpha
  (2026-11-07). github.com/Disservin/fastchess **[V 2026-11-17]**
- **official-stockfish/books.** Opening books including `8moves_v3.pgn`,
  `noob_3moves.epd`, and `UHO_Lichess_4852_v1.epd`. **[V 2026-11-16]**
- **Kopec, D., & Bratko, I. (1982).** The Bratko–Kopec experiment: A comparison of
  human and computer performance in chess. In M. R. B. Clarke (Ed.), *Advances in
  computer chess 3* (pp. 57–72). Pergamon.
  https://doi.org/10.1016/B978-0-08-026898-9.50009-7 **[V 2026-11-17]**
- **Reinfeld, F. (1958).** *Win at chess.* Dover. Originally *Chess quiz*, David
  McKay, 1945. Source of the 300-position WAC suite. **[V 2026-11-17]**
- **Lichess open database.** https://database.lichess.org, released under CC0.
  **[V 2026-11-17]**

---

## 7. Mathematics and physics used by analogy

- **Swinehart, D. F. (1962).** The Beer–Lambert law. *Journal of Chemical
  Education, 39*(7), 333. https://doi.org/10.1021/ed039p333 **[V 2026-11-17]**
- **Born, M., & Oppenheimer, R. (1927).** Zur Quantentheorie der Molekeln.
  *Annalen der Physik, 389*(20), 457–484. https://doi.org/10.1002/andp.19273892002
  **[V 2026-11-17]**
- **Grady, L. J., & Polimeni, J. R. (2010).** *Discrete calculus: Applied analysis
  on graphs for computational science.* Springer.
  https://doi.org/10.1007/978-1-84996-290-2 **[V 2026-11-17]** Gradients on graph
  edges (the incidence operator), the setting of 03 Eq. (2).

---

## 8. Software dependencies

- **shakmaty** 0.30.2, GPL-3.0-or-later, MSRV 1.97, `no_std`-capable.
  **[V 2026-11-17]**
- **cozy-chess** 0.3.4, MIT, last published 2024-04-05 (alternative). **[V 2026-11-16]**
- **libm** 0.2 (pure-Rust port of musl libm), MIT/Apache-2.0. **[V 2026-11-17]**
- **wasm-bindgen / wasm-pack**: moved from the archived `rustwasm` organisation to
  the `wasm-bindgen` organisation; wasm-pack 0.15.1 released 2026-10-30.
  **[V 2026-11-16]**
- **Chessground** (lichess-org), `chessground` `^9.2.1`,
  GPL-3.0-or-later (as installed in `web/package.json`). **[V 2026-11-21]**

---

## 9. Venues

ICGA Journal (SAGE; vol. 48 in 2026) and IEEE Transactions on Games (vol. 18 in
2026) are active and publish chess-engine research. No NeurIPS or AAAI workshop
dedicated to non-tree-search game playing was found (2026-11-17); relevant venues
include Computers and Games, Advances in Computer Games, and the IEEE Conference on
Games. **[V 2026-11-17]**
