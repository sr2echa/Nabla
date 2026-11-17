# Nabla Documentation

> **Who this is for:** anyone picking up the work: agents, contributors, and
> enthusiasts. Start with [`../AGENTS.md`](../AGENTS.md) for working rules and
> commands; this index explains what each document is for.
>
> **Status:** Engine v0.1 implemented (all terms, levels 0–2, Boltzmann policy,
> UCI, the `nabla-wasm` lab, and the page in `web/`); specification v0.2 for the
> field model, v0.3 for the architecture and the lab. Coefficients are still the
> hand-set values. Self-play results are in the protocol log; there is no rating
> against other engines.

---

## Reading order

| # | Document | Question it answers |
| --- | --- | --- |
| 1 | [`design/02-field-model.md`](design/02-field-model.md) | **Core.** How does Nabla turn a position into fields and an energy? |
| 2 | [`design/03-move-selection.md`](design/03-move-selection.md) | How does Nabla choose a move from the energy? |
| 3 | [`design/04-strength-control.md`](design/04-strength-control.md) | How is playing strength controlled and calibrated to Elo? |
| 4 | [`design/05-architecture.md`](design/05-architecture.md) | How is the software organised (Rust core, UCI, WebAssembly), and how is it tested? |
| 5 | [`design/06-visualization-lab.md`](design/06-visualization-lab.md) | What does the interactive demo show, and how? |
| 6 | [`research/hypotheses-and-protocol.md`](research/hypotheses-and-protocol.md) | What exactly will be measured, and how rigorously? |
| 7 | [`research/related-work.md`](research/related-work.md) | What prior work exists, and what is new here? |
| 8 | [`research/paper-outline.md`](research/paper-outline.md) | How do the documents map onto the paper? |

**Provenance** (how the design came to be):

| Document | Contents |
| --- | --- |
| [`design/00-initial-proposal.md`](design/00-initial-proposal.md) | The original proposal, archived verbatim. |
| [`design/01-proposal-review.md`](design/01-proposal-review.md) | Its review: 5 critical, 9 major, 7 minor findings, and what changed. |
| [`design/00b-second-proposal.md`](design/00b-second-proposal.md) | A second proposal (an audit of the first), archived verbatim. |
| [`design/01b-second-proposal-review.md`](design/01b-second-proposal-review.md) | Its claim-by-claim review, and the defects the same audits found in our own v0.1 specification. |

**Cross-cutting references:**

- [`notation.md`](notation.md): symbols, conventions (including GitHub rendering rules), glossary, terminology policy.
- [`decisions.md`](decisions.md): architecture decision log (why each choice was made).
- [`roadmap.md`](roadmap.md): milestones, exit criteria, and current status.

---

## Documentation rules

1. **Specification before code.** A behaviour is implemented only after it is
   specified here; a behaviour that changes in code changes here in the same commit.
2. **One source of truth per concept.** Symbols live in `notation.md`;
   coefficients live in the parameter table of `02-field-model.md` (and in
   `params.rs`, which must match); decisions live in `decisions.md`. Other
   documents link rather than repeat.
3. **Claims carry evidence.** Factual statements about external tools or prior
   work state how and when they were verified (see the tags in `related-work.md`).
   Performance and strength statements are hypotheses until measured under the
   protocol; preliminary measurements are logged in protocol §13.
4. **Numbered equations, GitHub-safe mathematics.** Display equations sit in
   fenced `math` blocks and end in `\qquad\text{(n)}`; prose cites them as
   "Eq. (n) of 02". The full rendering rules are in `notation.md` §1.
5. **Mermaid for diagrams.** Flowcharts, layouts, and dependency graphs are drawn
   in Mermaid, never as ASCII art; directory listings stay as text trees.
6. **Status headers.** Each document begins with a status line: *Draft* (under
   discussion), *Accepted* (implementation may rely on it), *Living* (updated
   continuously), or *Archived* (kept for provenance).
