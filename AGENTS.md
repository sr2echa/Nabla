# Working on Nabla

Orientation for agents and contributors picking up the work. Read this file, then
the documents it points to, before changing code.

## 1. What to read first

| Order | Document | Why |
| --- | --- | --- |
| 1 | [`README.md`](README.md) | What the engine is and how to build it |
| 2 | [`docs/design/02-field-model.md`](docs/design/02-field-model.md) | The evaluation: every equation and coefficient |
| 3 | [`docs/design/03-move-selection.md`](docs/design/03-move-selection.md) | Levels, boundary conditions, explanations |
| 4 | [`docs/design/05-architecture.md`](docs/design/05-architecture.md) | Crates, UCI surface, determinism rules, tests |
| 5 | [`docs/decisions.md`](docs/decisions.md) | Why things are the way they are |
| 6 | [`docs/roadmap.md`](docs/roadmap.md) | What is done and what comes next |

Symbols follow [`docs/notation.md`](docs/notation.md). Equation numbers in code
comments, such as "Eq. (16)", refer to the design document named in the module
header.

## 2. Commands

```sh
cargo build --release                               # binary: target/release/nabla
cargo test --release                                # all invariant tests (use --release: they are heavy)
cargo fmt --all
cargo clippy --release --all-targets -- -D warnings
./target/release/nabla bench                        # node count, speed, move checksum
```

## 3. Ground rules

1. **Specification first.** A behaviour change updates `docs/design/` in the same
   commit as the code. If code and specification disagree, the specification is
   wrong or the code is wrong; never leave them inconsistent.
2. **No unnamed constants.** Every evaluation coefficient lives in
   `crates/nabla-core/src/params.rs` and in the parameter table of 02 §9; fixed
   constants are named (`T_MIN`, `M_MATE`, …) and documented.
3. **Exact colour antisymmetry.** `tests/symmetry.rs` asserts
   $`E(ℱS) = -E(S)`$ bit for bit. To keep it true:
   - iterate pieces and squares in colour-relative order (`board::rel_squares`);
   - define ray directions in relative form and map them with `board::forward`;
   - compute each term as a White part minus a Black part using identical code;
   - break ties (for example equal-valued SEE attackers) in the side's relative order.
4. **Portable numerics.** Use `libm` for `exp`, `log1p`, `tanh` (not `std`), never
   `powi`; `sqrt` and the four basic operations are fine. This keeps native and
   WebAssembly results bit-identical (05 §6).
5. **Bench discipline.** A commit that changes evaluation or search behaviour puts
   the new checksum in its message, as `Bench: <checksum>`. An unexpected checksum
   change is a bug.
6. **Commits.** Small, stacked, Conventional Commits (`feat(core): …`,
   `fix(uci): …`, `docs(design): …`, `test(core): …`). One logical change each.
7. **Documentation renders on GitHub.** Follow [`docs/notation.md`](docs/notation.md)
   §1: display maths in fenced `math` blocks ending in `\qquad\text{(n)}`, Unicode
   script and bold letters, no `\operatorname`, and the `` $`…`$ `` form for inline
   maths that GitHub would otherwise misparse. Diagrams are Mermaid, not ASCII art.
8. **Claims need evidence.** Strength and speed statements are hypotheses until
   measured under [`docs/research/hypotheses-and-protocol.md`](docs/research/hypotheses-and-protocol.md).
   External facts carry a source and a verification date.

## 4. Map from specification to code

| Specification | Code |
| --- | --- |
| 02 §4 Ray transport, Eqs. (2)–(7) | `nabla-core/src/transport.rs` |
| 02 §5.1 Material | `energy/material.rs` |
| 02 §5.2 Flux | `energy/mobility.rs` |
| 02 §5.3 Territory | `energy/territory.rs` |
| 02 §5.4 Exchange, SEE | `energy/exchange.rs`, `see.rs` |
| 02 §5.5 King safety | `energy/king.rs` |
| 02 §5.6 Tropism | `energy/tropism.rs` |
| 02 §5.7 Pawns | `energy/pawns.rs` |
| 02 §5.8 Confinement | `energy/confinement.rs` |
| 02 §9 Parameters | `params.rs` |
| 03 §3 Boundary conditions, §4 Levels | `select.rs` |
| 04 §2 Boltzmann policy | `policy.rs` |
| 05 §4 UCI | `nabla-uci/src/main.rs` |

## 5. Definition of done

- [ ] Specification updated (and notation, if a symbol was added).
- [ ] Tests added or updated for the new behaviour.
- [ ] `fmt`, `clippy -D warnings`, and `test --release` pass.
- [ ] `bench` checksum stated in the commit message if behaviour changed.
- [ ] Roadmap status updated if a milestone criterion was met.
