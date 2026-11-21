"""Generate publication-quality SVG and 300-DPI PNG figures from cached benchmark JSONs."""

from __future__ import annotations

import json
import math
import pathlib
from typing import Any

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES_DIR = ROOT / "benchmarks" / "results"
FIG_DIR = ROOT / "benchmarks" / "figures"

# Okabe-Ito colorblind-safe palette
C_NABLA = "#0072B2"
C_SF = "#595959"
C_MAIA = "#D55E00"
C_PESTO = "#009E73"
C_FLOOR = "#CC79A7"
C_SIG = "#B22222"
C_NS = "#7F8C8D"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 9.5,
    "axes.titlesize": 10.5,
    "axes.titleweight": "bold",
    "axes.labelsize": 9.5,
    "xtick.labelsize": 8.5,
    "ytick.labelsize": 8.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.edgecolor": "#444444",
    "axes.linewidth": 0.8,
    "figure.facecolor": "#FFFFFF",
    "axes.facecolor": "#FFFFFF",
    "savefig.facecolor": "#FFFFFF",
})


def load(name: str) -> dict[str, Any]:
    return json.loads((RES_DIR / f"{name}.json").read_text(encoding="utf-8"))


def save_fig(fig: plt.Figure, stem: str) -> None:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIG_DIR / f"{stem}.svg", bbox_inches="tight")
    fig.savefig(FIG_DIR / f"{stem}.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {stem}.svg and {stem}.png")


def engine_group(name: str) -> tuple[str, str]:
    if name.startswith("Nabla"):
        return "Nabla", C_NABLA
    if name.startswith("SF-"):
        return "Stockfish Anchor", C_SF
    if name.startswith("Maia-"):
        return "Maia (1 node)", C_MAIA
    if name.startswith("AB-PeSTO"):
        return "AB-PeSTO", C_PESTO
    return "Low Baseline", C_FLOOR


def fig1_elo_ladder() -> None:
    d = load("exp2_elo_pool")
    rows = [r for r in d["ordo_ratings"] if r["rating"] is not None]
    rows_asc = list(reversed(rows))

    fig, ax = plt.subplots(figsize=(8.2, 5.6))
    y = np.arange(len(rows_asc))

    seen_labels: set[str] = set()
    for i, r in enumerate(rows_asc):
        grp, col = engine_group(r["player"])
        lbl = grp if grp not in seen_labels else None
        seen_labels.add(grp)
        marker = "*" if r["is_anchor"] else "o"
        msize = 9.5 if r["is_anchor"] else 6.5
        if r["error_95"] > 0:
            ax.errorbar(
                r["rating"], i, xerr=r["error_95"],
                fmt=marker, color=col, ecolor=col, elinewidth=1.6, capsize=3.5,
                markersize=msize, label=lbl, zorder=3,
            )
            txt = f"{r['rating']:.0f} ± {r['error_95']:.0f}"
        else:
            ax.plot(r["rating"], i, marker=marker, color=col, markersize=msize, linestyle="None", label=lbl, zorder=3)
            txt = f"{r['rating']:.0f} (anchor)"
        x_text = (r["ci95_high"] or r["rating"]) + 28
        ax.text(x_text, i, txt, va="center", fontsize=8.0, color="#222222")

    ax.set_yticks(y)
    ax.set_yticklabels([r["player"] for r in rows_asc])
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    min_x = min((r["ci95_low"] or r["rating"]) for r in rows_asc)
    max_x = max((r["ci95_high"] or r["rating"]) for r in rows_asc)
    ax.set_xlim(min_x - 80, max_x + 310)
    ax.set_xlabel("Ordo Rating (CCRL-Blitz Stockfish Anchor Scale, 95% CI)")
    ax.set_title("Anchored Rating Pool Across Nabla Levels, Stockfish, Maia, and Classical Baselines")
    ax.legend(loc="lower right", frameon=True, framealpha=0.95, fontsize=8.5)
    save_fig(fig, "fig1_elo_ladder")


def fig2_compute_pareto() -> None:
    d = load("exp2_elo_pool")
    ordo_map = {r["player"]: r for r in d["ordo_ratings"] if r["rating"] is not None}
    comp = d["compute"]

    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.4), sharey=True)
    families = [
        ("Nabla", ["Nabla-L0", "Nabla-L1", "Nabla-L2"], C_NABLA, "o"),
        ("AB-PeSTO", ["AB-PeSTO-0", "AB-PeSTO-1", "AB-PeSTO-2"], C_PESTO, "s"),
        ("Maia (lc0 1 node)", ["Maia-1100", "Maia-1500", "Maia-1900"], C_MAIA, "^"),
        ("Material 1-ply", ["Material-1ply"], C_FLOOR, "D"),
    ]

    offsets_nodes = {
        "Nabla-L0": (6, 6), "Nabla-L1": (6, -12), "Nabla-L2": (-16, 8),
        "AB-PeSTO-0": (-48, 8), "AB-PeSTO-1": (-48, 8), "AB-PeSTO-2": (-56, 8),
        "Material-1ply": (7, -8),
        "Maia-1100": (7, -2), "Maia-1500": (7, 0), "Maia-1900": (7, 2),
    }
    offsets_ms = {
        "Nabla-L0": (6, 4), "Nabla-L1": (-24, -4), "Nabla-L2": (-12, 8),
        "AB-PeSTO-1": (6, 5), "AB-PeSTO-2": (6, 5),
        "Material-1ply": (6, 4),
        "Maia-1100": (7, -10), "Maia-1500": (7, -2), "Maia-1900": (7, 6),
    }

    for ax, metric, xlabel, title, omap in [
        (axes[0], "mean_nodes", "Mean Nodes per Move (log scale)", "(a) Rating vs Search Tree Size", offsets_nodes),
        (axes[1], "mean_ms", "Mean Wall-Clock Time per Move (ms, log scale)", "(b) Rating vs Move Latency", offsets_ms),
    ]:
        for fname, members, col, marker in families:
            xs, ys, errs, labels = [], [], [], []
            for m in members:
                if m in ordo_map and m in comp and comp[m].get(metric):
                    xs.append(comp[m][metric])
                    ys.append(ordo_map[m]["rating"])
                    errs.append(ordo_map[m]["error_95"])
                    labels.append(m)
            if not xs:
                continue
            ax.errorbar(xs, ys, yerr=errs, fmt=f"-{marker}", color=col, ecolor=col, capsize=3, markersize=6.5, linewidth=1.6, label=fname)
            for x, y, lbl in zip(xs, ys, labels):
                short = lbl.replace("Nabla-", "").replace("AB-", "").replace("Material-1ply", "Mat-1")
                dx, dy = omap.get(lbl, (5, 5))
                ax.annotate(short, (x, y), xytext=(dx, dy), textcoords="offset points", fontsize=8.0, color=col, fontweight="bold")
        ax.set_xscale("log")
        ax.grid(True, which="both", linestyle="--", alpha=0.22)
        ax.set_xlabel(xlabel)
        ax.set_title(title)

    axes[0].set_xlim(0.7, 3600)
    axes[1].set_xlim(0.006, 28)

    axes[0].set_ylabel("Ordo Rating (CCRL-Blitz Scale, 95% CI)")
    axes[1].legend(loc="lower right", frameon=True, framealpha=0.95, fontsize=8.2)
    fig.suptitle("Compute Efficiency Frontier: Nabla vs Alpha-Beta PeSTO and Maia", fontweight="bold", y=1.02)
    fig.tight_layout()
    save_fig(fig, "fig2_compute_pareto")


def fig3_ablations() -> None:
    d = load("exp3_ablations")
    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.6), gridspec_kw={"width_ratios": [1.0, 1.0]})

    for ax, key, title in [
        (axes[0], "level1", "(a) Level 1 Leave-One-Out Ablations (n = 200 each)"),
        (axes[1], "level0", "(b) Level 0 Leave-One-Out Ablations (n = 200 each)"),
    ]:
        rows = sorted(d[key], key=lambda r: r["elo"])
        y = np.arange(len(rows))
        for i, r in enumerate(rows):
            sig = r["p_holm"] < 0.05
            col = C_SIG if (sig and r["elo"] < 0) else (C_PESTO if (sig and r["elo"] > 0) else C_NS)
            ax.errorbar(
                r["elo"], i, xerr=r["elo_err"],
                fmt="o", color=col, ecolor=col, elinewidth=1.6, capsize=3.5, markersize=6.5,
            )
            stars = "***" if r["p_holm"] < 0.001 else ("**" if r["p_holm"] < 0.01 else ("*" if r["p_holm"] < 0.05 else ""))
            ax.annotate(
                f"{r['elo']:+.0f}{stars}",
                xy=(r["ci95_high"], i), xytext=(5, 0), textcoords="offset points",
                va="center", ha="left", fontsize=8.0, color="#222222",
            )
        ax.axvline(0.0, color="#333333", linestyle="--", linewidth=1.0)
        ax.set_yticks(y)
        ax.set_yticklabels([r["label"] for r in rows])
        min_x = min(r["ci95_low"] for r in rows)
        max_x = max(r["ci95_high"] for r in rows)
        pad = 0.18 * (max_x - min_x)
        ax.set_xlim(min_x - 35, max_x + max(55, pad))
        ax.grid(axis="x", linestyle="--", alpha=0.22)
        ax.set_xlabel("Elo Change Relative to Full Model (95% Pentanomial CI)")
        ax.set_title(title)

    fig.suptitle("Structural & Energy-Term Ablations (* Holm p < 0.05, ** p < 0.01, *** p < 0.001)", fontweight="bold", y=1.02)
    fig.tight_layout()
    save_fig(fig, "fig3_ablations")


def fig4_temperature_blunders() -> None:
    d = load("exp4_temperature")
    ent = d["entropy"]
    matches = {m["temp_pawns"]: m for m in d["matches"]}
    taus = [r["temp_pawns"] for r in ent]
    hs = [r["mean_entropy_nats"] for r in ent]
    elos = [0.0 if t == 0 else matches[t]["elo"] for t in taus]
    errs = [0.0 if t == 0 else matches[t]["elo_err"] for t in taus]

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.5))
    ax = axes[0]
    ln1 = ax.errorbar(taus, elos, yerr=errs, fmt="-o", color=C_NABLA, ecolor=C_NABLA, capsize=3.5, linewidth=1.7, label="Elo vs τ=0")
    ax.axhline(0.0, color="#666666", linestyle=":", linewidth=0.9)
    ax.set_xlabel("Boltzmann Temperature τ (pawns)")
    ax.set_ylabel("Elo Relative to Greedy τ = 0", color=C_NABLA)
    ax.tick_params(axis="y", labelcolor=C_NABLA)
    ax.grid(True, linestyle="--", alpha=0.22)
    ax.set_title("(a) Elo & Policy Entropy vs Temperature τ")

    ax2 = ax.twinx()
    ax2.spines["top"].set_visible(False)
    ln2 = ax2.plot(taus, hs, "--s", color=C_MAIA, linewidth=1.6, markersize=5.5, label="Entropy H(π_τ)")
    ax2.set_ylabel("Mean Policy Entropy H(π_τ) [nats]", color=C_MAIA)
    ax2.tick_params(axis="y", labelcolor=C_MAIA)
    lines = [ln1[0], ln2[0]]
    ax.legend(lines, ["Elo vs τ=0 (95% CI)", "Policy Entropy H (nats)"], loc="center right", fontsize=8.0, frameon=True)

    # Panel (b): ACPL & >=200 cp blunder rate
    axb = axes[1]
    acpl_rows = d["acpl_blunders"]
    y = np.arange(len(acpl_rows))
    labels = [r["label"].replace("Nabla-", "") for r in acpl_rows]
    blunder_pct = [100.0 * r["blunder_rate"] for r in acpl_rows]
    lo_err = [100.0 * (r["blunder_rate"] - r["blunder_ci95"][0]) for r in acpl_rows]
    hi_err = [100.0 * (r["blunder_ci95"][1] - r["blunder_rate"]) for r in acpl_rows]
    colors = [C_MAIA if "Maia" in r["label"] else C_NABLA for r in acpl_rows]

    axb.barh(y, blunder_pct, xerr=[lo_err, hi_err], color=colors, alpha=0.85, capsize=3, height=0.6)
    for i, r in enumerate(acpl_rows):
        axb.text(100.0 * r["blunder_ci95"][1] + 0.8, i, f"{100*r['blunder_rate']:.1f}% | ACPL {r['mean_acpl']:.0f}", va="center", fontsize=7.8)
    axb.set_yticks(y)
    axb.set_yticklabels(labels)
    axb.invert_yaxis()
    axb.set_xlim(0, max(100.0 * r["blunder_ci95"][1] for r in acpl_rows) + 14)
    axb.grid(axis="x", linestyle="--", alpha=0.22)
    axb.set_xlabel("Blunder Rate (≥ 200 cp Loss vs Stockfish Depth 10) [%]")
    axb.set_title("(b) Severe Blunder Rate & ACPL (n = 400 moves each)")

    fig.tight_layout()
    save_fig(fig, "fig4_temperature_blunders")


def fig5_tactics_endgames() -> None:
    d_tac = load("exp5_tactics")
    d_end = load("exp6_endgames")

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.5))

    # Panel (a): WAC-300 & BK-24
    ax = axes[0]
    engines = [r["engine"] for r in d_tac["wac300"]]
    wac_map = {r["engine"]: r for r in d_tac["wac300"]}
    bk_map = {r["engine"]: r for r in d_tac["bk24"]}
    x = np.arange(len(engines))
    w = 0.36
    wac_r = [100 * wac_map[e]["rate"] for e in engines]
    wac_lo = [100 * (wac_map[e]["rate"] - wac_map[e]["ci95"][0]) for e in engines]
    wac_hi = [100 * (wac_map[e]["ci95"][1] - wac_map[e]["rate"]) for e in engines]
    bk_r = [100 * bk_map[e]["rate"] for e in engines]
    bk_lo = [100 * (bk_map[e]["rate"] - bk_map[e]["ci95"][0]) for e in engines]
    bk_hi = [100 * (bk_map[e]["ci95"][1] - bk_map[e]["rate"]) for e in engines]

    ax.bar(x - w / 2, wac_r, w, yerr=[wac_lo, wac_hi], capsize=3, color=C_NABLA, label="WAC (n = 300)")
    ax.bar(x + w / 2, bk_r, w, yerr=[bk_lo, bk_hi], capsize=3, color=C_MAIA, label="Bratko–Kopec (n = 24)")
    for xi, yr, hi in zip(x - w / 2, wac_r, wac_hi):
        ax.text(xi, yr + hi + 2.2, f"{yr:.0f}%", ha="center", va="bottom", fontsize=7.5)
    for xi, yr, hi in zip(x + w / 2, bk_r, bk_hi):
        ax.text(xi, yr + hi + 2.2, f"{yr:.0f}%", ha="center", va="bottom", fontsize=7.5)
    ax.set_xticks(x)
    ax.set_xticklabels([e.replace("AB-", "") for e in engines], rotation=20, ha="right")
    ax.set_ylim(0, 108)
    ax.grid(axis="y", linestyle="--", alpha=0.22)
    ax.set_ylabel("Solve Rate (%, 95% Wilson CI)")
    ax.set_title("(a) Tactical Suite Accuracy")
    ax.legend(frameon=True, fontsize=8.2)

    # Panel (b): Endgame conversion KQK / KRK / KPK
    axb = axes[1]
    end_rows = d_end["results"]
    cfgs = ["Nabla-L0", "Nabla-L1", "Nabla-L2", "Nabla-L2 (no conf)"]
    kinds = ["KQK", "KRK", "KPK"]
    cmap = {"Nabla-L0": "#8DA0CB", "Nabla-L1": "#4393C3", "Nabla-L2": C_NABLA, "Nabla-L2 (no conf)": C_FLOOR}
    lookup = {(r["engine"], r["kind"]): r for r in end_rows}
    xk = np.arange(len(kinds))
    wb = 0.19
    for j, cfg in enumerate(cfgs):
        off = (j - 1.5) * wb
        vals = [100 * lookup[(cfg, k)]["rate"] for k in kinds]
        lo = [100 * (lookup[(cfg, k)]["rate"] - lookup[(cfg, k)]["ci95"][0]) for k in kinds]
        hi = [100 * (lookup[(cfg, k)]["ci95"][1] - lookup[(cfg, k)]["rate"]) for k in kinds]
        axb.bar(xk + off, vals, wb, yerr=[lo, hi], capsize=2.5, color=cmap[cfg], label=cfg)
        for xi, v, h in zip(xk + off, vals, hi):
            axb.text(xi, v + h + 2.0, f"{v:.0f}", ha="center", va="bottom", fontsize=7.2)

    axb.set_xticks(xk)
    axb.set_xticklabels(kinds)
    axb.set_ylim(0, 114)
    axb.grid(axis="y", linestyle="--", alpha=0.22)
    axb.set_ylabel("50-Move Conversion vs Stockfish (%, n = 200 each)")
    axb.set_title("(b) Endgame Conversion & Confinement Ablation")
    axb.legend(loc="upper center", frameon=True, fontsize=8.0)

    fig.tight_layout()
    save_fig(fig, "fig5_tactics_endgames")


def fig6_eval_correlation() -> None:
    d = load("exp7_eval_corr")
    pts = d["points"]
    sf = np.array([max(-15.0, min(15.0, p["sf"])) for p in pts])
    nb = np.array([max(-15.0, min(15.0, p["l1"])) for p in pts])
    m = d["level1_static"]["all"]

    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.6), gridspec_kw={"width_ratios": [1.15, 1.0]})

    ax = axes[0]
    hb = ax.hexbin(sf, nb, gridsize=34, cmap="Blues", mincnt=1, bins="log")
    lim = 12.5
    ax.plot([-lim, lim], [-lim, lim], "--", color="#333333", linewidth=1.1, label="y = x (identity)")
    slope, intercept = np.polyfit(sf, nb, 1)
    xs = np.array([-lim, lim])
    ax.plot(xs, slope * xs + intercept, "-", color=C_MAIA, linewidth=1.3, label=f"OLS fit ({slope:.2f}x {intercept:+.2f})")
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_xlabel("Stockfish Depth 10 Static/Search Eval (pawns)")
    ax.set_ylabel("Nabla Static Field Energy E(S) (pawns)")
    ax.set_title(f"(a) Quiet Position Agreement (n = {d['n']})")
    ax.grid(True, linestyle="--", alpha=0.2)
    ax.legend(loc="upper left", fontsize=8.0, frameon=True)
    ax.text(
        0.97, 0.05,
        f"Spearman ρ = {m['spearman_rho']:.3f}\nPearson r = {m['pearson_r_cap15']:.3f}\nSign agree (|SF|≥0.5) = {100*m['sign_agreement_ge05']:.1f}%\nMAE = {m['mae_pawns']:.2f} pawns",
        transform=ax.transAxes, ha="right", va="bottom", fontsize=8.0,
        bbox={"boxstyle": "round,pad=0.35", "facecolor": "#FFFFFF", "edgecolor": "#CCCCCC", "alpha": 0.92},
    )
    fig.colorbar(hb, ax=ax, label="log10(count)")

    axb = axes[1]
    tcorr = d["term_spearman"]
    terms = sorted(tcorr.items(), key=lambda kv: kv[1])
    yt = np.arange(len(terms))
    cols = [C_NABLA if v >= 0 else C_MAIA for _, v in terms]
    axb.barh(yt, [v for _, v in terms], color=cols, height=0.62)
    axb.axvline(0.0, color="#333333", linewidth=0.9)
    for i, (_, v) in enumerate(terms):
        off = 0.02 if v >= 0 else -0.02
        ha = "left" if v >= 0 else "right"
        axb.text(v + off, i, f"{v:+.3f}", va="center", ha=ha, fontsize=8.0)
    axb.set_yticks(yt)
    axb.set_yticklabels([k for k, _ in terms])
    axb.set_xlim(-0.25, 1.02)
    axb.grid(axis="x", linestyle="--", alpha=0.22)
    axb.set_xlabel("Spearman ρ with Stockfish Depth 10")
    axb.set_title("(b) Individual Term Correlation (n = 2,000 quiet pos)")

    fig.tight_layout()
    save_fig(fig, "fig6_eval_correlation")


def main() -> None:
    fig1_elo_ladder()
    fig2_compute_pareto()
    fig3_ablations()
    fig4_temperature_blunders()
    fig5_tactics_endgames()
    fig6_eval_correlation()


if __name__ == "__main__":
    main()
