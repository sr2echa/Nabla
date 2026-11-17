# Decision Log

> **Status:** Living record · Each entry states the context, the decision, its
> consequences, and the alternatives rejected. Entries are never deleted; a
> reversed decision is marked *Superseded* with a pointer to its replacement.

| ID | Decision | Status |
| --- | --- | --- |
| [D-001](#d-001--search-regime-three-bounded-selection-levels) | Search regime: three bounded selection levels | Accepted |
| [D-002](#d-002--two-channel-ray-transport) | Two-channel ray transport | Accepted |
| [D-003](#d-003--per-side-fields) | Per-side fields | Accepted |
| [D-004](#d-004--pawn-units-and-two-stage-tuning) | Pawn units and two-stage tuning | Accepted |
| [D-005](#d-005--board-library-shakmaty-behind-an-adapter) | Board library: `shakmaty` behind an adapter | Accepted |
| [D-006](#d-006--strength-control-by-temperature-and-level) | Strength control by temperature and level | Accepted |
| [D-007](#d-007--repetition-aware-boundary-conditions-instead-of-momentum) | Repetition-aware boundary conditions instead of momentum | Accepted |
| [D-008](#d-008--licence-gpl-30-or-later) | Licence: GPL-3.0-or-later | Accepted |
| [D-009](#d-009--documentation-as-the-source-of-truth) | Documentation as the source of truth | Accepted |
| [D-010](#d-010--bit-identical-native-and-webassembly-results) | Bit-identical native and WebAssembly results | Accepted |
| [D-011](#d-011--no-overlays-on-live-third-party-games) | No overlays on live third-party games | Accepted |
| [D-012](#d-012--the-lab-is-an-astro-page) | The lab is an Astro page | Accepted |
| [D-013](#d-013--level-0-extends-checks) | Level 0 extends checks | Accepted |
| [D-014](#d-014--exact-root-scores-at-every-level) | Exact root scores at every level | Accepted |

---

## D-001 · Search regime: three bounded selection levels

- **Context.** The project's identity is "no tree search", yet the stated goal is a
  strong engine. A purely one-ply engine cannot see replies; deep search would make
  the field model one more evaluation function among many.
- **Decision.** Three levels (03 §4): Level 0, no lookahead beyond the move except
  forced check evasions (D-013); Level 1, capture-only quiescence; Level 2, one
  full-width reply. No iterative deepening, no transposition table, no quiet moves
  beyond one reply. Results are reported per level.
- **Consequences.** The search regime becomes an experimental variable (RQ1, RQ3)
  rather than a slogan. The positioning statement of 03 §9 is used verbatim.
- **Alternatives.** Level 0 only (rejected: caps strength and confounds evaluation
  quality with tactical blindness); full alpha-beta (rejected as a playing mode, kept
  as the research control AB-*d*).

## D-002 · Two-channel ray transport

- **Context.** The proposal's permittivity let rays pass through enemy pieces, which
  credited control of squares behind them, and treated every friendly blocker alike
  (review M-2).
- **Decision.** A direct channel equal to the exact attack set, plus an X-ray channel
  beyond the first blocker with transmission depending on blocker type and line
  compatibility (02 §4). Terminology follows the Beer–Lambert law, not permittivity.
- **Consequences.** SEE and king pressure use exact geometry; batteries and pins are
  visible to the evaluation and to the lab.
- **Alternatives.** Hard blocking at the first piece (FFCE; kept as ablation A2);
  single-channel attenuation (rejected: conflates control with X-ray pressure).

## D-003 · Per-side fields

- **Context.** Linear superposition cancels contested squares (review M-1).
- **Decision.** Store $\Phi_W$ and $\Phi_B$ separately; combine signs only inside
  explicitly non-linear terms; keep tension as a diagnostic.
- **Consequences.** Twice the field storage (two 64-vectors per channel), which is
  negligible.
- **Alternatives.** Signed field only (rejected).

## D-004 · Pawn units and two-stage tuning

- **Context.** The proposal's terms had incompatible scales (review C-2), and SPSA
  on small gauntlets is under-powered (review M-8).
- **Decision.** All energies in pawn units with $m_P \equiv 1$. Coefficients marked T
  are fitted by Texel tuning; coefficients marked S, which act only through play, by
  SPSA (protocol §6).
- **Consequences.** Temperatures and contempt have direct meaning in pawns; tuning
  needs a labelled position set.
- **Alternatives.** SPSA for everything (rejected: tens of thousands of games per
  run); hand-tuning only (rejected: not reproducible).

## D-005 · Board library: `shakmaty` behind an adapter

- **Context.** The proposal named `cozy-chess` 0.3.4 or `shakmaty` 0.30.2.
  Verified on 2026-11-16: `cozy-chess` is MIT and was last published 2024-04-05;
  `shakmaty` is GPL-3.0-or-later and was updated 2026-10-07.
- **Decision.** Use `shakmaty`, accessed only through `nabla-core/src/board.rs`.
- **Consequences.** Active maintenance, plus FEN, SAN, UCI-move parsing and Zobrist
  hashing that the lab and tests need. Its GPL licence matches Nabla's. Move
  generation speed is not decisive, because evaluation dominates cost (02 §7).
- **Alternatives.** `cozy-chess` (viable; kept as the fallback the adapter makes cheap).

## D-006 · Strength control by temperature and level

- **Context.** The project needs an Elo selector comparable to Stockfish's.
- **Decision.** A Boltzmann policy with temperature in pawns, combined with the level
  along a calibrated strength path; `UCI_Elo` maps to (level, temperature) through a
  compiled calibration table that is invalid for any other parameter hash (04).
- **Consequences.** Every change to the evaluation requires recalibration before any
  strength claim.
- **Alternatives.** MultiPV weakening, depth limits, evaluation noise, ε-greedy moves
  (04 §7).

## D-007 · Repetition-aware boundary conditions instead of momentum

- **Context.** The proposal added a momentum term to stop oscillation (Nf3–g1–f3),
  making the evaluation history-dependent (review m-4).
- **Decision.** Score the first recurrence of a position as a draw with contempt
  (03 §3). Momentum remains an ablation (A8, H7).
- **Consequences.** The evaluation stays a pure function of the position.
- **Alternatives.** Momentum (tested, not default); FFCE's watchdog (rejected:
  re-evaluates with different settings, which breaks explainability).

## D-008 · Licence: GPL-3.0-or-later

- **Context.** The author requested GPL-3.0. The main dependency (`shakmaty`) is
  GPL-3.0-or-later; Stockfish and FFCE are GPL-3.0.
- **Decision.** GPL-3.0-**or-later**, the form recommended by the GNU project and
  used by Stockfish. The `LICENSE` file is the verbatim GPL-3.0 text either way.
- **Consequences.** Derivative engines must remain free software.
- **Alternatives.** GPL-3.0-only (equally valid; a one-line change in
  `CITATION.cff` and source headers if preferred).

## D-009 · Documentation as the source of truth

- **Context.** The work will become a paper; reconstructing design rationale later
  is costly and error-prone.
- **Decision.** Specify before implementing; change the specification in the same
  commit as the code; keep notation, coefficients, and decisions each in one place;
  commit in small stacked steps with Conventional Commit messages; state the Level 2
  `bench` checksum in commits that change behaviour; follow the GitHub rendering
  conventions of notation §1 (fenced `math` blocks, no `\tag`, Unicode script
  letters) so that every equation renders on github.com; keep agent-facing working
  rules in `AGENTS.md`.
- **Consequences.** Slightly slower commits; a complete audit trail for the paper.
- **Alternatives.** Documentation after implementation (rejected).

## D-010 · Bit-identical native and WebAssembly results

- **Context.** The lab must show exactly what the UCI engine computes.
- **Decision.** The six numerics rules of 05 §6: `f32` without fused operations,
  colour-relative iteration, per-side accumulation, transcendental functions from
  the `libm` crate, counter-based randomness, and an FNV-1a parameter hash (no
  cryptographic dependency is needed to identify a parameter set). Enforced by the
  exact-antisymmetry test now and a cross-target golden test from Milestone 6.
  Fields are recomputed in full rather than updated incrementally.
- **Consequences.** Figures and explanations in the lab are faithful to measured play.
- **Alternatives.** Tolerance-based agreement (rejected: hides divergence);
  incremental updates (rejected for now: unnecessary within the budget of 05 §8).

## D-011 · No overlays on live third-party games

- **Context.** The proposal suggested rendering fields on the Chess.com board; during
  live games this is engine assistance (review M-9).
- **Decision.** Overlays appear only on Nabla's own board and, if an extension is
  built, on analysis boards and finished games (06 §7).
- **Consequences.** The extension, if built, needs page-context detection that
  defaults to off.
- **Alternatives.** None acceptable.

## D-012 · The lab is an Astro page

- **Context.** The lab has to play a game and draw the fields. The reference site
  che2s.com is Astro with chessground.
- **Decision.** The lab lives in `web/`. Astro serves the page. A client script
  uses chessground for the pieces and a canvas for the HUD. The engine is the
  `nabla-wasm` package, loaded in the page. No React.
- **Consequences.** `npm run engine --prefix web` rebuilds the WebAssembly, then
  `npm run dev --prefix web` serves the page.
- **Alternatives.** React (used by che2s.com; not needed for one page); a hand-drawn
  board (rejected: drag and drop is already solved by chessground, which is GPL).

## D-013 · Level 0 extends checks

- **Context.** The chess-engine audit showed that a purely static Level 0 cannot see
  a checking fork: after the check, the exchange term assumes the opponent may parry
  a threat, although the check forces the reply. Checking forks are the commonest
  tactic at low levels.
- **Decision.** At Level 0, a move that gives check is valued by the best of the
  opponent's forced evasions, each evaluated statically (03 §4.1). The positioning
  statement (03 §9) says so explicitly.
- **Consequences.** Level 0 is no longer strictly "one evaluation per legal move";
  a check typically adds 1–6 evaluations. The research claims are worded
  accordingly. A static in-check rule in the exchange term (02 §5.4) covers the
  remaining in-check leaves.
- **Alternatives.** A purely static in-check correction (kept as the fallback rule,
  but insufficient on its own); no correction (rejected: blind to the commonest
  tactic).

## D-014 · Exact root scores at every level

- **Context.** The Boltzmann policy, MultiPV, and per-term explanations all use the
  scores of non-best root moves. Alpha-beta at the root returns only bounds for
  moves that fail low.
- **Decision.** Every root move is searched with a full window; alpha-beta pruning
  happens only below the root (03 §4).
- **Consequences.** Level 2 costs the full $35 \times 35$ replies plus quiescence
  (measured 14.6 ms per decision), well inside budget. With $\tau > 0$ a narrower
  window $`(Q_\text{best} - 12\tau, +\infty)`$ would be a safe speed-up if ever needed.
- **Alternatives.** Root alpha-beta (rejected: corrupts the policy and
  explanations); aspiration windows (unnecessary at this cost).