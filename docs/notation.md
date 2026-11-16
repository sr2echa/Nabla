# Notation, Conventions, and Glossary

> **Status:** Living reference · **Applies to:** every document in `docs/`
>
> This file is the single source of truth for symbols and terminology. When a
> document introduces a new symbol, it is added here in the same commit.

---

## 1. Conventions

| Convention | Rule |
| --- | --- |
| Square indexing | Little-endian rank–file (LERF): $i = 8r + f$, so a1 $= 0$, h1 $= 7$, a8 $= 56$, h8 $= 63$. |
| Coordinates | File $f \in \lbrace 0,\dots,7 \rbrace$ (a–h), rank $r \in \lbrace 0,\dots,7 \rbrace$ (1–8). |
| Sign | All energies are **White-positive**: $E > 0$ favours White. |
| Perspective | Search code uses the side-to-move value $e(S) = s_{\text{stm}} E(S)$ (negamax convention). |
| Units | Energies are in **pawn units** (1.0 = one pawn). UCI output uses centipawns ($\times 100$). |
| Unit fixing | The pawn's rest mass is fixed, $m_P \equiv 1$; every other coefficient is relative to it. |
| Equations | Display equations are numbered per document with `\tag{}` and cited as "Eq. (n) of <doc>". |
| Defaults | Every coefficient has a named symbol, an initial value, and a tuning method in the parameter table of [`design/02-field-model.md`](design/02-field-model.md#9-parameter-table). Code never contains unnamed constants. |

---

## 2. Sets, indices, and board quantities

| Symbol | Meaning |
| --- | --- |
| $S$ | A chess position (board, side to move, castling rights, en-passant square, clocks). |
| $S'_m$ | The position reached from $S$ by legal move $m$. |
| $\mathcal{M}(S)$ | Set of legal moves in $S$. |
| $\mathcal{B}$ | The 64 squares, $\mathcal{B} = \lbrace 0,\dots,63 \rbrace$. |
| $c, \bar{c}$ | A colour and its opponent, $c \in \lbrace W, B \rbrace$. |
| $s_c$ | Colour sign: $s_W = +1$, $s_B = -1$. |
| $\text{stm}$ | Side to move. |
| $t$ | Piece type, $t \in \lbrace P, N, B, R, Q, K \rbrace$. |
| $\Pi(S)$, $\Pi_c$ | All pieces in $S$; pieces of colour $c$. |
| $\Pi_c^{N,B,R,Q}$ | Pieces of colour $c$ restricted to the listed types. |
| $\sigma(p)$, $t(p)$, $c(p)$ | Square, type, and colour of piece $p$. |
| $\mathrm{Att}(p)$ | Pseudo-legal attack set of $p$ (squares $p$ attacks, including occupied ones). |
| $\mathrm{Occ}_c$ | Set of squares occupied by colour $c$. |
| $\mathrm{PA}_c$ | Set of squares attacked by pawns of colour $c$. |
| $K_c$ | Square of the king of colour $c$. |
| $\rho(p)$ | Relative rank of a pawn: $1$ on its second rank, $6$ on its seventh rank. |
| $d_\infty(i,j)$ | Chebyshev (king-move) distance. |
| $d_1(i,j)$ | Manhattan distance. |
| $d_2(i,j)$ | Euclidean distance, in squares. |
| $d_c(i)$ | Centre distance, $\max(\lvert f - 3.5 \rvert, \lvert r - 3.5 \rvert) - 0.5 \in \lbrace 0,1,2,3 \rbrace$. |
| $\varphi$ | Game phase, $\varphi \in [0,1]$; $1$ = full middlegame material, $0$ = bare kings and pawns. |
| $\mathrm{NPM}_c$ | Non-pawn material of colour $c$ in pawn units. |

## 3. Fields (64-vectors over $\mathcal{B}$)

| Symbol | Meaning | Defined in |
| --- | --- | --- |
| $T_k$ | Cumulative transmittance at step $k$ along a ray. | 02, Eq. (2) |
| $\theta$ | Single-blocker transmission coefficient. | 02, Eq. (3) |
| $A_c$ | Direct (attack) field of colour $c$. | 02, Eq. (5) |
| $X_c$ | X-ray field of colour $c$ (beyond the first blocker). | 02, Eq. (6) |
| $\Phi_c$ | Influence field of colour $c$, $A_c + \chi X_c$. | 02, Eq. (7) |
| $\Phi$ | Net potential, $\Phi_W - \Phi_B$ (diagnostic). | 02, Eq. (8) |
| $\Theta$ | Tension, $\min(\Phi_W, \Phi_B)$ (diagnostic). | 02, Eq. (9) |
| $\Omega$ | Saturating control field, $\Omega \in (-1, 1)$. | 02, Eq. (10) |
| $T^\text{pass}_p$ | Passage transmittance of pawn $p$'s forward path. | 02, Eq. (21) |
| $\mathbf{J}_c$ | Flux (lines-of-force) vector field of colour $c$ (diagnostic). | 02, §8 |
| $\nabla_{xy}\Phi$ | Spatial gradient of $\Phi$ on the 8×8 grid (diagnostic). | 02, §8 |

## 4. Energies and search quantities

| Symbol | Meaning | Defined in |
| --- | --- | --- |
| $E(S)$ | Total energy functional (static evaluation), White-positive. | 02, Eq. (11) |
| $E_\text{mat}, E_\text{flux}, \dots$ | Additive energy terms (see 02, §5). | 02 |
| $e(S)$ | Side-to-move value, $s_\text{stm} E(S)$. | 03, Eq. (1) |
| $\nabla_m E$ | Discrete gradient of $E$ along move $m$ (edge of the game graph). | 03, Eq. (2) |
| $Q_L(m)$ | Root score of move $m$ at selection level $L$. | 03, §4 |
| $L$ | Selection level: $0$ (pure field), $1$ (quiescent), $2$ (reply-aware). | 03, §4 |
| $\tau$ | Policy temperature, in pawn units. | 04, Eq. (1) |
| $\pi_\tau(m)$ | Boltzmann move probability at temperature $\tau$. | 04, Eq. (1) |
| $\eta$ | Strength coordinate on the calibrated path, $\eta \in [0,1]$. | 04, §4 |

## 5. Operators and special functions

| Symbol | Definition |
| --- | --- |
| $\mathcal{F}$ | Colour flip: mirror ranks, swap colours, swap side to move, map castling rights and en-passant square. |
| $\mathcal{H}$ | File mirror (a↔h); a symmetry only when no castling rights remain. |
| $\sigma_\text{L}(x)$ | Logistic function, $1/(1+e^{-x})$. |
| $\mathrm{softplus}(x)$ | $\ln(1+e^{x})$. |
| $\mathbf{1}[\cdot]$ | Indicator function. |
| $\mathrm{SEE}_c(i)$ | Static exchange evaluation: material gain for colour $c$ from capturing on square $i$, with X-ray attackers. |

---

## 6. Terminology policy

Physical language is used where it is **structurally accurate** and avoided where
it would mislead a physicist reviewer. The table records the deliberate choices.

| Avoid | Use instead | Reason |
| --- | --- | --- |
| Hamiltonian, Lagrangian, principle of least action | **Energy functional**, **energy descent** | No kinetic term, conjugate momenta, or path integral exists; selection is a local, single-step optimisation. |
| Permittivity tensor | **Transmittance**, **opacity** | Physical permittivity weakens a field inside a medium; it does not block rays. Ray attenuation through absorbers is described by the Beer–Lambert law. |
| Scalar potential tensor | **Field** (a 64-vector) | Rank-1 quantities are vectors; "tensor" is reserved for genuinely multi-index objects. |
| Pauli exclusion, nuclear repulsion | **Exchange energy** (static exchange evaluation) | The term is a material-balance computation, not a quantum effect. |
| Gradient (for move choice) | **Discrete gradient on the game graph** | Moves are graph edges, not spatial displacements; see 03, §2. |

Analogies that remain in use (Born–Oppenheimer separation, dielectric breakdown,
softened gravity, light cones, confinement) are always introduced explicitly as
analogies, with the chess-level definition stated first. The full list, with what
does and does not carry over, is the analogy register in
[`design/02-field-model.md`](design/02-field-model.md#11-analogy-register).

---

## 7. Glossary

| Term | Definition |
| --- | --- |
| **Battery** | Two or more friendly line pieces aligned on one ray such that the rear piece supports the front piece along that ray (e.g. queen behind rook on a file). |
| **X-ray** | Influence of a sliding piece through an intervening piece onto squares behind it. |
| **Pin / skewer** | Line attack through an enemy piece onto a more (pin) or less (skewer) valuable piece behind it. |
| **SEE** | Static exchange evaluation: the material outcome of the optimal capture sequence on one square, computed without search. |
| **Quiescence search** | A selective search over captures (and promotions, check evasions) that resolves tactical exchanges before evaluation. |
| **Tapered evaluation** | Linear interpolation between middlegame and endgame coefficients using the game phase $\varphi$. |
| **Mop-up evaluation** | Endgame heuristic that drives the losing king to the edge and the winning king towards it. |
| **Rule of the square** | Classical test of whether a king can catch a passed pawn before it promotes. |
| **Texel tuning** | Fitting evaluation coefficients by minimising the logistic loss between predicted and actual game results over labelled positions. |
| **SPSA** | Simultaneous Perturbation Stochastic Approximation: a gradient-free optimiser that estimates gradients from paired, randomly perturbed evaluations; used to tune engines by self-play matches. |
| **SPRT** | Wald's Sequential Probability Ratio Test, used to accept or reject an engine change with controlled error rates. |
| **CCRL Blitz** | Computer Chess Rating Lists blitz scale; the scale to which Stockfish's `UCI_Elo` is anchored. |
| **Gauntlet** | A match series of one engine against a pool of fixed opponents. |
| **UCI** | Universal Chess Interface, the text protocol between chess GUIs/match runners and engines. |
