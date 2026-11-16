# Nabla Documentation

> **Status:** Design phase (Milestone 0). No engine code exists yet; these
> documents are the specification the implementation will follow and the
> record the paper will be written from.

---

## Reading order

| # | Document | Question it answers |
| --- | --- | --- |
| 0 | [`design/00-initial-proposal.md`](design/00-initial-proposal.md) | What was originally proposed? (archived verbatim) |
| 1 | [`design/01-proposal-review.md`](design/01-proposal-review.md) | What is wrong with the proposal, what was verified, and what changed? |
| 2 | [`design/02-field-model.md`](design/02-field-model.md) | **Core.** How does Nabla turn a position into fields and an energy? |
| 3 | [`design/03-move-selection.md`](design/03-move-selection.md) | How does Nabla choose a move from the energy? |
| 4 | [`design/04-strength-control.md`](design/04-strength-control.md) | How is playing strength tuned and calibrated to Elo? |
| 5 | [`design/05-architecture.md`](design/05-architecture.md) | How is the software organised (Rust core, UCI, WASM)? |
| 6 | [`design/06-visualization-lab.md`](design/06-visualization-lab.md) | What does the interactive demo show, and how? |
| 7 | [`research/hypotheses-and-protocol.md`](research/hypotheses-and-protocol.md) | What exactly will be measured, and how rigorously? |
| 8 | [`research/related-work.md`](research/related-work.md) | What prior work exists, and what is new here? |
| 9 | [`research/paper-outline.md`](research/paper-outline.md) | How do the documents map onto the paper? |

Cross-cutting references:

- [`notation.md`](notation.md) — symbols, conventions, glossary, terminology policy.
- [`decisions.md`](decisions.md) — architecture decision log (why each choice was made).
- [`roadmap.md`](roadmap.md) — milestones and their exit criteria.

---

## Documentation rules

1. **Specification before code.** A behaviour is implemented only after it is
   specified here; a behaviour that changes in code changes here in the same commit.
2. **One source of truth per concept.** Symbols live in `notation.md`;
   coefficients live in the parameter table of `02-field-model.md`; decisions
   live in `decisions.md`. Other documents link rather than repeat.
3. **Claims carry evidence.** Factual statements about external tools or prior
   work state how they were verified (see the verification tags in
   `related-work.md`). Performance and strength statements are hypotheses until
   measured under the protocol.
4. **Numbered equations.** Display equations use `\tag{n}`; prose cites them as
   "Eq. (n) of 02".
5. **Status headers.** Each document begins with a status line:
   *Draft* (under discussion), *Accepted* (implementation may rely on it), or
   *Superseded* (kept for provenance, with a pointer to its replacement).
