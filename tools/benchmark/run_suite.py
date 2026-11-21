"""Reproducible paper-grade benchmark suite for Nabla.

Experiments (strictly concurrency <= 3, no adjudication, fixed seeds):
  exp0_gate        fastchess UCI compliance (40/40) + 600-game self-play stability gate
  exp1_probe       Stockfish 19 wall-clock speed and Level 2 bracket probe
  exp2_elo_pool    Connected 15-engine anchored tournament + Ordo fit + noob_3moves check
  exp3_ablations   Leave-one-out ablations at Level 1 (10 variants) and Level 0 (6 variants)
  exp4_temperature Boltzmann temperature sweep, policy entropy, ACPL, and >=200 cp blunders
  exp5_tactics     WAC-300 and Bratko-Kopec-24 tactical solve suites
  exp6_endgames    Verified KQK / KRK / KPK 50-move conversion vs full-strength Stockfish
  exp7_eval_corr   2,000 quiet middlegame/endgame eval correlation vs Stockfish depth 10
  exp8_perf        5x nabla bench (L0/L1/L2) median/IQR + native-vs-WASM parity/ratio
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
import pathlib
import random
import re
import statistics
import subprocess
import sys
import time
from typing import Any

from scipy import stats

ROOT = pathlib.Path(__file__).resolve().parents[2]
BIN_DIR = ROOT / "tools" / "bench-bin"
NABLA = ROOT / "target" / "release" / "nabla.exe"
BASELINES = ROOT / "tools" / "baselines" / "target" / "release" / "nabla-baselines.exe"
FASTCHESS = BIN_DIR / "fastchess.exe"
STOCKFISH = BIN_DIR / "stockfish.exe"
LC0 = BIN_DIR / "lc0" / "lc0.exe"
ORDO = BIN_DIR / "ordo.exe"

BOOK_8MOVES = BIN_DIR / "8moves_v3.pgn"
BOOK_NOOB = BIN_DIR / "noob_3moves.epd"
EPD_WAC = BIN_DIR / "wacnew.epd"
EPD_BK = BIN_DIR / "bk.epd"

RAW_DIR = ROOT / "benchmarks" / "raw"
RES_DIR = ROOT / "benchmarks" / "results"

CONCURRENCY = 3  # Physical cores (4) - 1 per protocol §4
BASE_SEED = 20261121
TC_MAIN = "10+0.1"
TC_GATE = "4+0.04"

# Exact 16 bench FENs matching crates/nabla-uci/src/main.rs.
BENCH_FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7",
    "r2q1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 3 9",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "2rr3k/1b2bpp1/p2p1n1p/1p2p3/4P3/1NN1B2P/PPP1BPP1/2KR3R w - - 0 16",
    "r2qr1k1/1p1nbppp/p2pb3/4p3/4P3/1NN1BP2/PPPQ2PP/2KR1B1R b - - 3 12",
    "1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "4r1k1/5ppp/p1p5/3pP3/8/P2P1Q2/1PP3PP/R4RK1 w - - 0 20",
    "6k1/p4pp1/1p5p/3n4/3P4/2R2NP1/P4P1P/6K1 b - - 0 28",
    "8/5pk1/6p1/8/3KP3/8/8/8 w - - 0 40",
    "8/8/8/8/2k5/8/4K3/4R3 w - - 0 1",
    "3r2k1/p4p1p/1p2p1p1/4P3/3P2P1/P3K3/1P3P2/2R5 w - - 0 30",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "2r3k1/1q1nbppp/r3p3/3pP3/pPpP4/P1Q2N2/4BPPP/1R3RK1 w - - 0 22",
]


def save_json(path: pathlib.Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_json(path: pathlib.Path) -> Any | None:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def wilson_ci(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    denom = 1.0 + z * z / n
    center = (p + z * z / (2.0 * n)) / denom
    half = z * math.sqrt((p * (1.0 - p) + z * z / (4.0 * n)) / n) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def score_to_elo(p: float) -> float:
    p = min(max(p, 1e-4), 1.0 - 1e-4)
    return -400.0 * math.log10(1.0 / p - 1.0)


def pentanomial_stats(ptnml: list[int], wins: int, losses: int, draws: int) -> dict[str, Any]:
    pairs = sum(ptnml)
    games = wins + losses + draws
    score = (wins + 0.5 * draws) / max(games, 1)
    if pairs == 0:
        return {
            "games": games, "wins": wins, "losses": losses, "draws": draws,
            "score": score, "ptnml": ptnml, "elo": score_to_elo(score),
            "ci95_low": None, "ci95_high": None, "elo_err": None, "p_value": None, "los": None,
        }
    vals = [0.0, 0.25, 0.5, 0.75, 1.0]
    probs = [c / pairs for c in ptnml]
    mean = sum(p * v for p, v in zip(probs, vals))
    var = sum(p * (v - mean) ** 2 for p, v in zip(probs, vals))
    se = math.sqrt(max(var, 1e-12) / pairs)
    z_stat = (mean - 0.5) / se if var > 0 else (math.copysign(10.0, mean - 0.5) if mean != 0.5 else 0.0)
    p_val = float(math.erfc(abs(z_stat) / math.sqrt(2.0)))
    los = float(0.5 * (1.0 + math.erf(z_stat / math.sqrt(2.0))))
    lo_p = min(max(mean - 1.96 * se, 0.5 / (games + 1)), 1.0 - 0.5 / (games + 1))
    hi_p = min(max(mean + 1.96 * se, 0.5 / (games + 1)), 1.0 - 0.5 / (games + 1))
    elo = score_to_elo(mean)
    elo_lo = score_to_elo(lo_p)
    elo_hi = score_to_elo(hi_p)
    return {
        "games": games,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "score": round(score, 6),
        "draw_rate": round(draws / max(games, 1), 6),
        "ptnml": ptnml,
        "elo": round(elo, 2),
        "ci95_low": round(elo_lo, 2),
        "ci95_high": round(elo_hi, 2),
        "elo_err": round(0.5 * (elo_hi - elo_lo), 2),
        "z": round(z_stat, 4),
        "p_value": p_val,
        "los": round(los, 6),
    }


def engine_spec(name: str, extra_opts: dict[str, Any] | None = None, tc: str = TC_MAIN) -> list[str]:
    extra = extra_opts or {}
    parts: list[str] = []
    if name.startswith("Nabla-L"):
        lvl = int(name.split("Nabla-L")[1])
        parts = ["-engine", f"cmd={NABLA}", f"name={name}", f"option.Level={lvl}", "option.Temperature=0", f"tc={tc}"]
    elif name.startswith("SF-"):
        elo = int(name.split("SF-")[1])
        parts = [
            "-engine", f"cmd={STOCKFISH}", f"name={name}",
            "option.UCI_LimitStrength=true", f"option.UCI_Elo={elo}",
            "option.Threads=1", "option.Move Overhead=100", f"tc={tc}",
        ]
    elif name.startswith("Maia-"):
        elo = name.split("Maia-")[1]
        weights = BIN_DIR / f"maia-{elo}.pb.gz"
        parts = [
            "-engine", f"cmd={LC0}", f"name={name}",
            f"option.WeightsFile={weights}", "option.Threads=1", f"tc={tc}", "nodes=1",
        ]
    elif name.startswith("AB-PeSTO-"):
        d = int(name.split("AB-PeSTO-")[1])
        parts = ["-engine", f"cmd={BASELINES}", f"args=--mode pesto --depth {d}", f"name={name}", f"tc={tc}"]
    elif name == "Material-1ply":
        parts = ["-engine", f"cmd={BASELINES}", "args=--mode material", f"name={name}", f"tc={tc}"]
    elif name == "Random":
        parts = ["-engine", f"cmd={BASELINES}", "args=--mode random", f"name={name}", f"tc={tc}"]
    else:
        raise ValueError(f"Unknown engine name: {name}")

    for k, v in extra.items():
        if k == "name":
            parts = [f"name={v}" if p.startswith("name=") else p for p in parts]
        elif k.startswith("option."):
            opt_prefix = f"{k}="
            parts = [p for p in parts if not p.startswith(opt_prefix)]
            parts.append(f"{k}={v}")
        elif k == "tc":
            parts = [f"tc={v}" if p.startswith("tc=") else p for p in parts]
        else:
            parts.append(f"{k}={v}")
    return parts


def parse_fastchess_pgn(pgn_path: pathlib.Path, name_a: str, name_b: str) -> dict[str, Any]:
    """Audit terminations and extract per-engine non-book node/time stats from PGN."""
    text = pgn_path.read_text(encoding="utf-8", errors="replace")
    terminations: dict[str, int] = {}
    plies: list[int] = []
    nodes_by_eng: dict[str, list[int]] = {name_a: [], name_b: []}
    time_by_eng: dict[str, list[float]] = {name_a: [], name_b: []}

    games = re.split(r'(?=\[Event ")', text.strip())
    for g in games:
        if not g.strip():
            continue
        w_m = re.search(r'\[White "([^"]+)"\]', g)
        b_m = re.search(r'\[Black "([^"]+)"\]', g)
        t_m = re.search(r'\[Termination "([^"]+)"\]', g)
        p_m = re.search(r'\[PlyCount "(\d+)"\]', g)
        if t_m:
            term = t_m.group(1)
            terminations[term] = terminations.get(term, 0) + 1
        if p_m:
            plies.append(int(p_m.group(1)))
        if not (w_m and b_m):
            continue
        w_name, b_name = w_m.group(1), b_m.group(1)
        body = g.split("\n\n", 1)[-1]
        # Strip result token at end.
        move_comments = re.findall(r'\{([^}]*)\}', body)
        for idx, c in enumerate(move_comments):
            if c.strip() == "book":
                continue
            eng = w_name if idx % 2 == 0 else b_name
            if eng not in nodes_by_eng:
                continue
            nm = re.search(r'n=(\d+)', c)
            tm = re.search(r'([\d.]+)s\b', c)
            if nm:
                nodes_by_eng[eng].append(int(nm.group(1)))
            if tm:
                time_by_eng[eng].append(float(tm.group(1)))

    def summarize_eng(eng: str) -> dict[str, Any]:
        ns = nodes_by_eng[eng]
        ts = time_by_eng[eng]
        return {
            "moves": len(ns) or len(ts),
            "mean_nodes": round(statistics.mean(ns), 1) if ns else None,
            "median_nodes": round(statistics.median(ns), 1) if ns else None,
            "mean_ms": round(1000.0 * statistics.mean(ts), 2) if ts else None,
            "median_ms": round(1000.0 * statistics.median(ts), 2) if ts else None,
        }

    return {
        "terminations": terminations,
        "mean_ply": round(statistics.mean(plies), 1) if plies else 0.0,
        "compute": {name_a: summarize_eng(name_a), name_b: summarize_eng(name_b)},
    }


def run_fastchess(
    tag: str,
    eng_a_args: list[str],
    eng_b_args: list[str],
    name_a: str,
    name_b: str,
    rounds: int,
    book: pathlib.Path,
    seed: int,
    concurrency: int = CONCURRENCY,
    overwrite: bool = False,
) -> dict[str, Any]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = RAW_DIR / f"{tag}.json"
    pgn_path = RAW_DIR / f"{tag}.pgn"
    log_path = RAW_DIR / f"{tag}.log"
    if not overwrite and cache_path.exists() and pgn_path.exists():
        cached = load_json(cache_path)
        if cached is not None:
            print(f"[cache] match {tag} ({cached['games']}g)", flush=True)
            return cached
    fmt = "epd" if book.suffix.lower() == ".epd" else "pgn"

    cmd = [
        str(FASTCHESS),
        *eng_a_args,
        *eng_b_args,
        "-openings", f"file={book}", f"format={fmt}", "order=random",
        "-srand", str(seed),
        "-rounds", str(rounds),
        "-repeat",
        "-concurrency", str(concurrency),
        "-pgnout", f"file={pgn_path}", "append=false", "nodes=true",
    ]
    print(f"[match] {tag}: {name_a} vs {name_b} ({rounds*2}g, {book.name}, seed={seed}, c={concurrency})", flush=True)
    t0 = time.perf_counter()
    child_env = {**os.environ, "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True, env=child_env)
    elapsed = time.perf_counter() - t0
    stdout = proc.stdout
    log_path.write_text(stdout, encoding="utf-8")
    if "doesn't have option" in stdout:
        raise RuntimeError(f"Unrecognized UCI option warning in {tag} (check uci() handshake)")

    g_m = re.findall(r"Games:\s*(\d+),\s*Wins:\s*(\d+),\s*Losses:\s*(\d+),\s*Draws:\s*(\d+)", stdout)
    p_m = re.findall(r"Ptnml\(0-2\):\s*\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]", stdout)
    if not g_m or not p_m:
        raise RuntimeError(f"Could not parse fastchess summary for {tag}:\n{stdout[-800:]}")
    games, wins, losses, draws = (int(x) for x in g_m[-1])
    ptnml = [int(x) for x in p_m[-1]]
    stats_d = pentanomial_stats(ptnml, wins, losses, draws)
    pgn_info = parse_fastchess_pgn(pgn_path, name_a, name_b)
    stats_d.update({
        "tag": tag,
        "engine_a": name_a,
        "engine_b": name_b,
        "book": book.name,
        "seed": seed,
        "wall_s": round(elapsed, 2),
        "pgn": str(pgn_path.relative_to(ROOT)),
        **pgn_info,
    })
    print(
        f"  -> {games}g W/L/D={wins}/{losses}/{draws} "
        f"Elo={stats_d['elo']:+.1f}±{stats_d['elo_err']} "
        f"({elapsed:.1f}s, terms={pgn_info['terminations']})",
        flush=True,
    )
    bad = {k: v for k, v in pgn_info["terminations"].items() if k != "normal"}
    if bad:
        raise RuntimeError(f"Non-normal match terminations in {tag}: {bad}")
    save_json(cache_path, stats_d)
    return stats_d


class UciClient:
    def __init__(self, exe: pathlib.Path, args: list[str] | None = None, options: dict[str, Any] | None = None):
        cmd = [str(exe), *(args or [])]
        self.proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1,
        )
        self.send("uci")
        self._wait_prefix("uciok")
        for k, v in (options or {}).items():
            self.send(f"setoption name {k} value {v}")
        self.send("isready")
        self._wait_prefix("readyok")

    def send(self, line: str) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()

    def _wait_prefix(self, prefix: str) -> list[str]:
        assert self.proc.stdout is not None
        out = []
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(f"UCI process ended unexpectedly waiting for {prefix}")
            s = line.strip()
            out.append(s)
            if s.startswith(prefix):
                return out

    def eval_nabla(self, fen: str) -> dict[str, float]:
        self.send(f"position fen {fen}")
        self.send("eval")
        self.send("isready")
        lines = self._wait_prefix("readyok")
        terms: dict[str, float] = {}
        for l in lines:
            m = re.match(r"^(mat|flux|terr|ex|king|trop|pawn|conf|tempo|total)\s+([+-]?\d+\.\d+)", l)
            if m:
                terms[m.group(1)] = float(m.group(2))
        return terms

    def explain_nabla(self, fen: str, n: int = 256) -> list[dict[str, Any]]:
        self.send(f"position fen {fen}")
        self.send(f"explain {n}")
        self.send("isready")
        lines = self._wait_prefix("readyok")
        out = []
        for l in lines:
            parts = l.split()
            if len(parts) >= 3 and parts[0] not in ("move", "readyok", "info"):
                try:
                    out.append({"uci": parts[0], "q": float(parts[1]), "prob": float(parts[2])})
                except ValueError:
                    pass
        return out

    def go(self, position_cmd: str, go_cmd: str, newgame: bool = False) -> tuple[str, int | None, int | None, int | None]:
        if newgame:
            self.send("ucinewgame")
            self.send("isready")
            self._wait_prefix("readyok")
        self.send(position_cmd)
        self.send(go_cmd)
        lines = self._wait_prefix("bestmove")
        best = lines[-1].split()[1]
        nodes: int | None = None
        score_cp: int | None = None
        mate: int | None = None
        for l in lines[:-1]:
            if l.startswith("info "):
                nm = re.search(r"\bnodes (\d+)", l)
                if nm:
                    nodes = int(nm.group(1))
                cm = re.search(r"\bscore cp (-?\d+)", l)
                if cm:
                    score_cp = int(cm.group(1))
                    mate = None
                mm = re.search(r"\bscore mate (-?\d+)", l)
                if mm:
                    mate = int(mm.group(1))
                    score_cp = None
        return best, nodes, score_cp, mate

    def close(self) -> None:
        try:
            self.send("quit")
            self.proc.wait(timeout=3)
        except Exception:
            self.proc.kill()


# ------------------------- Experiments -------------------------

def exp0_gate() -> dict[str, Any]:
    comp = subprocess.run([str(FASTCHESS), "--compliance", str(NABLA)], capture_output=True, text=True, check=True)
    clean_out = re.sub(r"\x1b\[[0-9;]*m", "", comp.stdout)
    passed_steps = len(re.findall(r"Passed Step \d+:", clean_out))
    if "Engine passed all compliance checks." not in clean_out or passed_steps != 40:
        raise RuntimeError(f"fastchess --compliance failed ({passed_steps}/40):\n{clean_out}")

    runs = []
    for lvl in (0, 1, 2):
        res = run_fastchess(
            f"exp0_gate_L{lvl}",
            engine_spec(f"Nabla-L{lvl}", {"name": f"Nabla-L{lvl}-A", "option.Temperature": 30, "option.Seed": 1}, tc=TC_GATE),
            engine_spec(f"Nabla-L{lvl}", {"name": f"Nabla-L{lvl}-B", "option.Temperature": 30, "option.Seed": 2}, tc=TC_GATE),
            f"Nabla-L{lvl}-A", f"Nabla-L{lvl}-B",
            rounds=100, book=BOOK_NOOB, seed=BASE_SEED + lvl,
        )
        bad = {k: v for k, v in res["terminations"].items() if k != "normal"}
        if bad:
            raise RuntimeError(f"Stability gate FAILED for Level {lvl}: non-normal terminations {bad}")
        runs.append(res)
    return {"compliance_steps": passed_steps, "stability_runs": runs, "total_games": 600, "time_losses": 0, "illegal_or_crash": 0}


def exp1_probe() -> dict[str, Any]:
    m1320 = run_fastchess(
        "exp1_probe_SF1320",
        engine_spec("Nabla-L2"), engine_spec("SF-1320"),
        "Nabla-L2", "SF-1320",
        rounds=10, book=BOOK_8MOVES, seed=101,
    )
    sf_sec_per_game = m1320["wall_s"] / m1320["games"]
    if sf_sec_per_game > 8.0:
        raise RuntimeError(f"Stockfish probe exceeded 8 s/game ({sf_sec_per_game:.2f} s/g); re-plan required.")
    probes = [m1320]
    if m1320["score"] > 0.25:
        m1500 = run_fastchess(
            "exp1_probe_SF1500",
            engine_spec("Nabla-L2"), engine_spec("SF-1500"),
            "Nabla-L2", "SF-1500",
            rounds=10, book=BOOK_8MOVES, seed=102,
        )
        probes.append(m1500)
    return {"probes": probes, "sf_sec_per_game": round(sf_sec_per_game, 3)}


def exp2_elo_pool(probe: dict[str, Any]) -> dict[str, Any]:
    sf_sec = probe["sf_sec_per_game"]
    print(f"[exp2] SF measured {sf_sec:.2f} s/game -> running connected 15-engine anchored pool")

    pairings: list[tuple[str, str, int]] = [
        # Internal Nabla ladder
        ("Nabla-L2", "Nabla-L1", 100),
        ("Nabla-L1", "Nabla-L0", 100),
        ("Nabla-L2", "Nabla-L0", 100),
        # Nabla vs Maia
        ("Nabla-L2", "Maia-1100", 100),
        ("Nabla-L2", "Maia-1500", 100),
        ("Nabla-L2", "Maia-1900", 100),
        ("Nabla-L1", "Maia-1100", 100),
        ("Nabla-L1", "Maia-1500", 100),
        ("Nabla-L0", "Maia-1100", 100),
        # Classical baselines & Maia ladder
        ("Nabla-L2", "AB-PeSTO-2", 100),
        ("Nabla-L2", "AB-PeSTO-1", 100),
        ("Nabla-L1", "AB-PeSTO-1", 100),
        ("Nabla-L1", "Material-1ply", 100),
        ("Nabla-L0", "AB-PeSTO-0", 100),
        ("Nabla-L0", "Material-1ply", 100),
        ("Nabla-L0", "Random", 50),
        ("AB-PeSTO-2", "Maia-1500", 100),
        ("AB-PeSTO-1", "Maia-1100", 100),
        ("AB-PeSTO-0", "Material-1ply", 100),
        ("Material-1ply", "Random", 50),
        ("Maia-1100", "Maia-1500", 100),
        ("Maia-1500", "Maia-1900", 100),
        # Stockfish CCRL-Blitz anchors (560 games total across SF-1320/1500/1700/1900)
        ("Nabla-L2", "SF-1320", 50),
        ("Nabla-L2", "SF-1500", 50),
        ("Nabla-L2", "SF-1700", 50),
        ("Nabla-L1", "SF-1320", 30),
        ("Maia-1500", "SF-1500", 50),
        ("Maia-1900", "SF-1700", 30),
        ("Maia-1900", "SF-1900", 30),
    ]

    matches = []
    combined_pgn = RAW_DIR / "exp2_pool_all.pgn"
    for idx, (a, b, rnd) in enumerate(pairings):
        tag = f"exp2_{idx:02d}_{a}_vs_{b}"
        conc = 2 if (a.startswith("SF-") or b.startswith("SF-")) else CONCURRENCY
        matches.append(
            run_fastchess(
                tag,
                engine_spec(a),
                engine_spec(b),
                a, b,
                rounds=rnd,
                book=BOOK_8MOVES,
                seed=BASE_SEED + idx,
                concurrency=conc,
            )
        )

    # Combine PGNs cleanly for Ordo.
    with combined_pgn.open("wb") as dst:
        for m in matches:
            p = ROOT / m["pgn"]
            dst.write(p.read_bytes())
            dst.write(b"\n")

    anchors_csv = RAW_DIR / "anchors.csv"
    present = {m["engine_a"] for m in matches} | {m["engine_b"] for m in matches}
    anchors = [(e, int(e.split("SF-")[1])) for e in ("SF-1320", "SF-1500", "SF-1700", "SF-1900") if e in present]
    anchors_csv.write_text(
        "\n".join(f'"{name}",{rating}' for name, rating in anchors) + "\n",
        encoding="utf-8",
    )

    ordo_csv = RES_DIR / "ordo_ratings.csv"
    ordo_txt = RES_DIR / "ordo_report.txt"
    subprocess.run(
        [
            str(ORDO), "-q", "-W", "-M",
            "-p", str(combined_pgn),
            "-m", str(anchors_csv),
            "-s", "1000",
            "-c", str(ordo_csv),
            "-o", str(ordo_txt),
        ],
        check=True,
    )

    ordo_rows = parse_ordo_csv(ordo_csv, {n for n, _ in anchors})
    # Aggregate compute nodes/ms from matches per engine.
    compute_agg: dict[str, dict[str, list[float]]] = {}
    for m in matches:
        for eng, info in m["compute"].items():
            c = compute_agg.setdefault(eng, {"mean_nodes": [], "median_nodes": [], "mean_ms": [], "median_ms": []})
            for k in c:
                if info[k] is not None:
                    c[k].append(info[k])
    compute_summary = {
        eng: {k: (round(statistics.mean(vals), 2) if vals else None) for k, vals in d.items()}
        for eng, d in compute_agg.items()
    }

    # Book robustness on noob_3moves.epd.
    book_checks = [
        run_fastchess("exp2_noob_L2_vs_L1", engine_spec("Nabla-L2", tc="30+0.3"), engine_spec("Nabla-L1", tc="30+0.3"), "Nabla-L2", "Nabla-L1", rounds=100, book=BOOK_NOOB, seed=BASE_SEED + 200, concurrency=1),
        run_fastchess("exp2_noob_L2_vs_Maia1500", engine_spec("Nabla-L2", tc="30+0.3"), engine_spec("Maia-1500", tc="30+0.3"), "Nabla-L2", "Maia-1500", rounds=100, book=BOOK_NOOB, seed=BASE_SEED + 201, concurrency=1),
    ]

    return {
        "sf_games": 560,
        "anchors": dict(anchors),
        "ordo_ratings": ordo_rows,
        "matches": matches,
        "book_robustness": book_checks,
        "compute": compute_summary,
    }


def parse_ordo_csv(path: pathlib.Path, anchor_names: set[str]) -> list[dict[str, Any]]:
    import csv
    rows = []
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            cleaned = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
            name = cleaned.get("PLAYER", "")
            if not name:
                continue
            r_raw = cleaned.get("RATING", "")
            try:
                rating = float(r_raw)
            except ValueError:
                rating = None
            err_raw = cleaned.get("ERROR", "")
            try:
                err = 0.0 if err_raw in ("", "-", "----") else float(err_raw)
            except ValueError:
                err = 0.0
            games = int(float(cleaned.get("PLAYED") or 0))
            pts = float(cleaned.get("POINTS") or 0.0)
            score_pct = float(cleaned.get("(%)") or 0.0)
            rows.append({
                "player": name,
                "rating": round(rating, 1) if rating is not None else None,
                "error_95": round(err, 1),
                "ci95_low": round(rating - err, 1) if (rating is not None and err > 0) else rating,
                "ci95_high": round(rating + err, 1) if (rating is not None and err > 0) else rating,
                "games": games,
                "points": round(pts, 1),
                "score_pct": round(score_pct, 1),
                "is_anchor": name in anchor_names,
            })
    rows.sort(key=lambda r: (r["rating"] is not None, r["rating"] or -1e9), reverse=True)
    return rows


def holm_bonferroni(items: list[dict[str, Any]]) -> None:
    indexed = sorted(enumerate(items), key=lambda x: x[1]["p_value"])
    m = len(indexed)
    running_max = 0.0
    for rank, (orig_idx, item) in enumerate(indexed):
        adj = min(1.0, (m - rank) * item["p_value"])
        running_max = max(running_max, adj)
        items[orig_idx]["p_holm"] = round(running_max, 6)


def exp3_ablations() -> dict[str, Any]:
    l1_specs = [
        ("chi_0", "No X-ray (chi=0)", {"option.Param_chi": 0}),
        ("lambda_0", "No attenuation (lambda=0)", {"option.Param_lambda": 0}),
        ("ablate_flux", "No Mobility (flux)", {"option.Ablate_flux": "true"}),
        ("ablate_terr", "No Territory (terr)", {"option.Ablate_terr": "true"}),
        ("ablate_ex", "No Exchange (ex)", {"option.Ablate_ex": "true"}),
        ("ablate_king", "No King safety (king)", {"option.Ablate_king": "true"}),
        ("ablate_trop", "No Tropism (trop)", {"option.Ablate_trop": "true"}),
        ("ablate_pawn", "No Pawns (pawn)", {"option.Ablate_pawn": "true"}),
        ("ablate_conf", "No Confinement (conf)", {"option.Ablate_conf": "true"}),
        ("ablate_tempo", "No Tempo (tempo)", {"option.Ablate_tempo": "true"}),
    ]
    l0_specs = [
        ("chi_0", "No X-ray (chi=0)", {"option.Param_chi": 0}),
        ("lambda_0", "No attenuation (lambda=0)", {"option.Param_lambda": 0}),
        ("ablate_terr", "No Territory (terr)", {"option.Ablate_terr": "true"}),
        ("ablate_ex", "No Exchange (ex)", {"option.Ablate_ex": "true"}),
        ("ablate_king", "No King safety (king)", {"option.Ablate_king": "true"}),
        ("ablate_pawn", "No Pawns (pawn)", {"option.Ablate_pawn": "true"}),
    ]

    def run_family(level: int, specs: list[tuple[str, str, dict[str, Any]]], seed_off: int) -> list[dict[str, Any]]:
        out = []
        base_name = f"Nabla-L{level}"
        for idx, (slug, label, opts) in enumerate(specs):
            var_name = f"L{level}_{slug}"
            res = run_fastchess(
                f"exp3_L{level}_{slug}",
                engine_spec(base_name, {"name": var_name, **opts}, tc="30+0.3"),
                engine_spec(base_name, tc="30+0.3"),
                var_name, base_name,
                rounds=100, book=BOOK_8MOVES, seed=BASE_SEED + seed_off + idx, concurrency=1,
            )
            res["label"] = label
            res["slug"] = slug
            out.append(res)
        holm_bonferroni(out)
        return out

    return {
        "level1": run_family(1, l1_specs, 300),
        "level0": run_family(0, l0_specs, 350),
    }


def _score_moves_worker(worker_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sf = UciClient(STOCKFISH, options={"Threads": 1, "Hash": 16})
    out = []
    try:
        for item in worker_items:
            fen = item["fen"]
            uci_move = item["move_uci"]
            best_mv, _, cp0, mate0 = sf.go(f"position fen {fen}", "go depth 10", newgame=False)
            _, _, cp1, mate1 = sf.go(f"position fen {fen} moves {uci_move}", "go depth 10", newgame=False)
            if mate0 is not None:
                c0 = 1500 if mate0 > 0 else -1500
            else:
                c0 = cp0 if cp0 is not None else 0
            if mate1 is not None:
                # mate1 is opponent POV: mate1 > 0 means opponent mates us -> -1500 for us
                c1 = -1500 if mate1 > 0 else 1500
            else:
                c1 = -(cp1 if cp1 is not None else 0)
            cpl = max(0, min(2000, c0 - c1))
            if best_mv == uci_move:
                cpl = 0
            out.append({
                "tag": item["tag"],
                "cpl": cpl,
                "blunder_200": cpl >= 200,
                "exact_match": best_mv == uci_move,
            })
    finally:
        sf.close()
    return out


def extract_pgn_records(pgn_path: pathlib.Path, min_ply: int = 10, max_per_game: int = 4) -> list[dict[str, Any]]:
    proc = subprocess.run(
        [str(BASELINES), "--tool", "pgn-extract", "--pgn", str(pgn_path), "--min-ply", str(min_ply), "--max-per-game", str(max_per_game)],
        capture_output=True, text=True, check=True,
    )
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def exp4_temperature() -> dict[str, Any]:
    temps_cp = [0, 10, 25, 50, 100, 200]
    matches = []
    for idx, t_cp in enumerate(temps_cp[1:]):
        vname = f"Nabla-L2-T{t_cp}"
        res = run_fastchess(
            f"exp4_temp_{t_cp}",
            engine_spec("Nabla-L2", {"name": vname, "option.Temperature": t_cp, "option.Seed": 1}, tc="30+0.3"),
            engine_spec("Nabla-L2", tc="30+0.3"),
            vname, "Nabla-L2",
            rounds=50, book=BOOK_8MOVES, seed=BASE_SEED + 400 + idx, concurrency=1,
        )
        res["temp_pawns"] = t_cp / 100.0
        matches.append(res)

    # Policy Shannon entropy over 16 bench FENs.
    entropy_rows = []
    for t_cp in temps_cp:
        cli = UciClient(NABLA, options={"Level": 2, "Temperature": t_cp, "Seed": 1})
        try:
            hs = []
            for fen in BENCH_FENS:
                cands = cli.explain_nabla(fen, 256)
                probs = [max(0.0, c["prob"]) for c in cands if c["prob"] > 0.0]
                s = sum(probs)
                if s > 0:
                    probs = [p / s for p in probs]
                h = -sum(p * math.log(p) for p in probs if p > 0)
                hs.append(h)
        finally:
            cli.close()
        mean_h = statistics.mean(hs)
        entropy_rows.append({
            "temp_pawns": t_cp / 100.0,
            "mean_entropy_nats": round(mean_h, 4),
            "perplexity": round(math.exp(mean_h), 3),
        })

    # Collect 400 sampled non-book moves per engine config for ACPL & blunder rate.
    rng = random.Random(BASE_SEED + 499)
    move_sources: list[tuple[str, list[pathlib.Path], set[str]]] = [
        ("Nabla-L0", sorted(RAW_DIR.glob("exp2_[0-9][0-9]_*Nabla-L0*.pgn")), {"Nabla-L0"}),
        ("Nabla-L1", sorted(RAW_DIR.glob("exp2_[0-9][0-9]_*Nabla-L1*.pgn")), {"Nabla-L1"}),
        ("Nabla-L2 (T=0.00)", sorted(RAW_DIR.glob("exp2_[0-9][0-9]_*Nabla-L2*.pgn")), {"Nabla-L2"}),
        ("Maia-1500", sorted(RAW_DIR.glob("exp2_[0-9][0-9]_*Maia-1500*.pgn")), {"Maia-1500"}),
    ]
    for t_cp in temps_cp[1:]:
        move_sources.append((f"Nabla-L2 (T={t_cp/100:.2f})", [RAW_DIR / f"exp4_temp_{t_cp}.pgn"], {f"Nabla-L2-T{t_cp}"}))

    tasks: list[dict[str, Any]] = []
    for label, paths, names in move_sources:
        pool: list[dict[str, Any]] = []
        for p in paths:
            if not p.exists():
                continue
            for r in extract_pgn_records(p, min_ply=10, max_per_game=6):
                mover = r["white"] if r["turn"] == "white" else r["black"]
                if mover in names:
                    pool.append({"tag": label, "fen": r["fen"], "move_uci": r["move_uci"]})
        rng.shuffle(pool)
        tasks.extend(pool[:400])

    print(f"[exp4] Scoring {len(tasks)} moves across {len(move_sources)} profiles with Stockfish depth 10...", flush=True)
    chunks = [tasks[i::CONCURRENCY] for i in range(CONCURRENCY)]
    scored: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        for res in ex.map(_score_moves_worker, chunks):
            scored.extend(res)

    by_tag: dict[str, list[dict[str, Any]]] = {}
    for s in scored:
        by_tag.setdefault(s["tag"], []).append(s)

    acpl_rows = []
    for label, _, _ in move_sources:
        rows = by_tag.get(label, [])
        n = len(rows)
        cpls = [r["cpl"] for r in rows]
        blunders = sum(1 for r in rows if r["blunder_200"])
        exact = sum(1 for r in rows if r["exact_match"])
        w_lo, w_hi = wilson_ci(blunders, n)
        acpl_rows.append({
            "label": label,
            "moves": n,
            "mean_acpl": round(statistics.mean(cpls), 2) if cpls else None,
            "median_cpl": round(statistics.median(cpls), 1) if cpls else None,
            "blunder_count": blunders,
            "blunder_rate": round(blunders / max(n, 1), 4),
            "blunder_ci95": [round(w_lo, 4), round(w_hi, 4)],
            "sf_top1_match": round(exact / max(n, 1), 4),
        })

    return {"matches": matches, "entropy": entropy_rows, "acpl_blunders": acpl_rows}


def load_epd_suite(path: pathlib.Path, suite_name: str) -> list[dict[str, Any]]:
    raw_lines = path.read_bytes().replace(b"\x00", b"").decode("utf-8", errors="replace").splitlines()
    parsed = []
    for idx, raw in enumerate(raw_lines):
        s = raw.strip()
        if not s:
            continue
        fields = s.split()
        fen = " ".join(fields[:4]) + " 0 1"
        rest = s.split(None, 4)[4] if len(fields) > 4 else ""
        # Collapse spaces right before + or # (handles "Qd1 +" in bk.epd).
        rest = re.sub(r"\s+([+#])", r"\1", rest)
        bm_sans: list[str] = []
        am_sans: list[str] = []
        id_m = re.search(r'\bid\s+"?([^";]+)"?', rest)
        pid = id_m.group(1).strip() if id_m else f"{suite_name}.{idx+1:03d}"
        bm_m = re.search(r'(?:^|[;\s])bm\s+([^;]+)', rest)
        if bm_m:
            bm_sans = bm_m.group(1).strip().split()
        am_m = re.search(r'(?:^|[;\s])am\s+([^;]+)', rest)
        if am_m:
            am_sans = am_m.group(1).strip().split()
        parsed.append({"id": pid, "fen": fen, "bm_sans": bm_sans, "am_sans": am_sans})

    # Batch convert SAN -> UCI via baselines helper.
    def convert_list(key: str) -> list[list[str]]:
        stdin = "\n".join(f"{r['fen']}\t{' '.join(r[key])}" if r[key] else "" for r in parsed) + "\n"
        res = subprocess.run([str(BASELINES), "--tool", "san-to-uci"], input=stdin, capture_output=True, text=True, check=True)
        lines = res.stdout.splitlines()
        out = []
        for i, r in enumerate(parsed):
            if not r[key]:
                out.append([])
            else:
                toks = lines[i].split() if i < len(lines) else []
                if any(t == "ERR" for t in toks) or len(toks) != len(r[key]):
                    raise RuntimeError(f"Failed SAN->UCI for {r['id']} {r[key]} in {suite_name}: {toks}")
                out.append(toks)
        return out

    bms = convert_list("bm_sans")
    ams = convert_list("am_sans")
    for r, bm, am in zip(parsed, bms, ams):
        r["bm_uci"] = bm
        r["am_uci"] = am
    return parsed


def _run_tactics_worker(cfg: dict[str, Any], positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cli = UciClient(cfg["exe"], args=cfg.get("args"), options=cfg.get("options"))
    out = []
    try:
        for p in positions:
            mv, nodes, _, _ = cli.go(f"position fen {p['fen']}", cfg["go"], newgame=True)
            if p["bm_uci"]:
                solved = mv in p["bm_uci"]
            elif p["am_uci"]:
                solved = mv not in p["am_uci"]
            else:
                solved = False
            out.append({"id": p["id"], "move": mv, "solved": solved, "nodes": nodes or 0})
    finally:
        cli.close()
    return out


def exp5_tactics() -> dict[str, Any]:
    wac = load_epd_suite(EPD_WAC, "WAC")
    bk = load_epd_suite(EPD_BK, "BK")
    assert len(wac) == 300, f"Expected 300 WAC positions, got {len(wac)}"
    assert len(bk) == 24, f"Expected 24 BK positions, got {len(bk)}"

    engines = [
        {"name": "Nabla-L0", "exe": NABLA, "args": [], "options": {"Level": 0, "Temperature": 0}, "go": "go movetime 5000"},
        {"name": "Nabla-L1", "exe": NABLA, "args": [], "options": {"Level": 1, "Temperature": 0}, "go": "go movetime 5000"},
        {"name": "Nabla-L2", "exe": NABLA, "args": [], "options": {"Level": 2, "Temperature": 0}, "go": "go movetime 5000"},
        {"name": "AB-PeSTO-1", "exe": BASELINES, "args": ["--mode", "pesto", "--depth", "1"], "options": {}, "go": "go movetime 5000"},
        {"name": "AB-PeSTO-2", "exe": BASELINES, "args": ["--mode", "pesto", "--depth", "2"], "options": {}, "go": "go movetime 5000"},
        {"name": "Maia-1500", "exe": LC0, "args": [], "options": {"WeightsFile": str(BIN_DIR / "maia-1500.pb.gz"), "Threads": 1}, "go": "go nodes 1"},
    ]

    results = {}
    for suite_name, suite in [("wac300", wac), ("bk24", bk)]:
        rows = []
        for eng in engines:
            chunks = [suite[i::CONCURRENCY] for i in range(CONCURRENCY)]
            all_res: list[dict[str, Any]] = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
                for part in ex.map(lambda ch: _run_tactics_worker(eng, ch), chunks):
                    all_res.extend(part)
            solved = sum(1 for r in all_res if r["solved"])
            n = len(all_res)
            lo, hi = wilson_ci(solved, n)
            mean_nodes = statistics.mean(r["nodes"] for r in all_res)
            row = {
                "engine": eng["name"],
                "solved": solved,
                "total": n,
                "rate": round(solved / n, 4),
                "ci95": [round(lo, 4), round(hi, 4)],
                "mean_nodes": round(mean_nodes, 1),
            }
            print(f"[exp5:{suite_name}] {eng['name']:<12} {solved}/{n} ({100*row['rate']:.1f}%) nodes={row['mean_nodes']}", flush=True)
            rows.append(row)
        results[suite_name] = rows
    return results


def _filter_won_chunk(fens: list[str]) -> list[str]:
    sf = UciClient(STOCKFISH, options={"Threads": 1, "Hash": 16})
    won = []
    try:
        for fen in fens:
            _, _, cp, mate = sf.go(f"position fen {fen}", "go depth 10", newgame=False)
            if (mate is not None and mate > 0) or (cp is not None and cp >= 300):
                won.append(fen)
    finally:
        sf.close()
    return won


def _play_endgame_worker(opts: dict[str, Any], fens: list[str]) -> list[dict[str, Any]]:
    nabla = UciClient(NABLA, options=opts)
    sf = UciClient(STOCKFISH, options={"Threads": 1, "Hash": 16})
    ref = subprocess.Popen(
        [str(BASELINES), "--tool", "referee"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, bufsize=1,
    )
    assert ref.stdin and ref.stdout
    out = []
    try:
        for fen in fens:
            ref.stdin.write(f"init {fen}\n")
            ref.stdin.flush()
            ref.stdout.readline()
            moves: list[str] = []
            state, detail = "play", "ongoing"
            white_moves = 0
            while state == "play" and white_moves < 50:
                pos_cmd = f"position fen {fen}" if not moves else f"position fen {fen} moves {' '.join(moves)}"
                # White (Nabla) moves
                wm, _, _, _ = nabla.go(pos_cmd, "go movetime 2000", newgame=(len(moves) == 0))
                if wm == "0000":
                    break
                moves.append(wm)
                white_moves += 1
                ref.stdin.write(f"play {wm}\n")
                ref.stdin.flush()
                parts = ref.stdout.readline().strip().split()
                state, detail = parts[1], parts[2]
                if state != "play":
                    break
                # Black (full-strength Stockfish depth 8 defender) moves
                pos_cmd = f"position fen {fen} moves {' '.join(moves)}"
                bm, _, _, _ = sf.go(pos_cmd, "go depth 8", newgame=(len(moves) == 1))
                if bm == "0000":
                    break
                moves.append(bm)
                ref.stdin.write(f"play {bm}\n")
                ref.stdin.flush()
                parts = ref.stdout.readline().strip().split()
                state, detail = parts[1], parts[2]
            converted = state == "checkmate" and (len(moves) % 2 == 1)
            reason = "mate" if converted else (detail if state != "play" else "50move_limit")
            out.append({"converted": converted, "plies": len(moves), "reason": reason})
    finally:
        nabla.close()
        sf.close()
        ref.stdin.write("quit\n")
        ref.stdin.flush()
        ref.wait(timeout=3)
    return out


def exp6_endgames() -> dict[str, Any]:
    target = 200
    fens_by_kind: dict[str, list[str]] = {}
    for i, kind in enumerate(("kqk", "krk", "kpk")):
        p = subprocess.run(
            [str(BASELINES), "--tool", "gen-endgames", "--kind", kind, "--count", "1200", "--seed", str(BASE_SEED + 600 + i)],
            capture_output=True, text=True, check=True,
        )
        cands = [l.strip() for l in p.stdout.splitlines() if l.strip()]
        chunks = [cands[j::CONCURRENCY] for j in range(CONCURRENCY)]
        won: list[str] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            for part in ex.map(_filter_won_chunk, chunks):
                won.extend(part)
        if len(won) < target:
            raise RuntimeError(f"Only found {len(won)} won positions for {kind}, need {target}")
        fens_by_kind[kind] = won[:target]
        print(f"[exp6] Verified {target}/{len(cands)} won {kind.upper()} positions", flush=True)

    configs = [
        ("Nabla-L0", {"Level": 0, "Temperature": 0}),
        ("Nabla-L1", {"Level": 1, "Temperature": 0}),
        ("Nabla-L2", {"Level": 2, "Temperature": 0}),
        ("Nabla-L2 (no conf)", {"Level": 2, "Temperature": 0, "Ablate_conf": "true"}),
    ]
    summary = []
    for label, opts in configs:
        for kind in ("kqk", "krk", "kpk"):
            fens = fens_by_kind[kind]
            chunks = [fens[j::CONCURRENCY] for j in range(CONCURRENCY)]
            games: list[dict[str, Any]] = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
                for part in ex.map(lambda ch: _play_endgame_worker(opts, ch), chunks):
                    games.extend(part)
            conv = sum(1 for g in games if g["converted"])
            lo, hi = wilson_ci(conv, len(games))
            mate_plies = [g["plies"] for g in games if g["converted"]]
            reasons: dict[str, int] = {}
            for g in games:
                reasons[g["reason"]] = reasons.get(g["reason"], 0) + 1
            row = {
                "engine": label,
                "kind": kind.upper(),
                "games": len(games),
                "converted": conv,
                "rate": round(conv / len(games), 4),
                "ci95": [round(lo, 4), round(hi, 4)],
                "mean_plies_to_mate": round(statistics.mean(mate_plies), 1) if mate_plies else None,
                "reasons": reasons,
            }
            print(f"[exp6] {label:<18} {kind.upper()} {conv}/{len(games)} ({100*row['rate']:.1f}%) {reasons}", flush=True)
            summary.append(row)
    return {"positions_per_endgame": target, "results": summary}


def _eval_corr_worker(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sf = UciClient(STOCKFISH, options={"Threads": 1, "Hash": 16})
    nb1 = UciClient(NABLA, options={"Level": 1})
    nb0 = UciClient(NABLA, options={"Level": 0})
    out = []
    try:
        for it in items:
            fen = it["fen"]
            _, _, cp, mate = sf.go(f"position fen {fen}", "go depth 10", newgame=False)
            if mate is not None or cp is None:
                continue
            sf_white_pawns = (cp if it["turn"] == "white" else -cp) / 100.0
            t1 = nb1.eval_nabla(fen)
            t0 = nb0.eval_nabla(fen)
            out.append({
                "fen": fen,
                "phase": it["phase"],
                "sf": sf_white_pawns,
                "nabla_l1": t1["total"],
                "nabla_l0": t0["total"],
                "terms": t1,
            })
    finally:
        sf.close()
        nb1.close()
        nb0.close()
    return out


def exp7_eval_corr() -> dict[str, Any]:
    seen: set[str] = set()
    quiet_pool: list[dict[str, Any]] = []
    pgns = sorted(RAW_DIR.glob("exp2_*.pgn"))
    for pgn in pgns:
        if pgn.name == "exp2_pool_all.pgn":
            continue
        for rec in extract_pgn_records(pgn, min_ply=12, max_per_game=6):
            if rec["is_check"] or rec["is_capture"] or rec["gives_check"] or rec["is_promotion"]:
                continue
            fen = rec["fen"]
            key = " ".join(fen.split()[:4])
            if key in seen:
                continue
            seen.add(key)
            quiet_pool.append(rec)

    rng = random.Random(BASE_SEED + 700)
    rng.shuffle(quiet_pool)
    sample = quiet_pool[:2400]
    print(f"[exp7] Evaluating {len(sample)} unique quiet positions against Stockfish depth 10...", flush=True)
    chunks = [sample[i::CONCURRENCY] for i in range(CONCURRENCY)]
    rows: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        for part in ex.map(_eval_corr_worker, chunks):
            rows.extend(part)
    rows = rows[:2000]

    def metrics(sub: list[dict[str, Any]], key: str) -> dict[str, Any]:
        sf_vals = [r["sf"] for r in sub]
        nb_vals = [r[key] for r in sub]
        rho, p_rho = stats.spearmanr(sf_vals, nb_vals)
        sf_cap = [max(-15.0, min(15.0, v)) for v in sf_vals]
        nb_cap = [max(-15.0, min(15.0, v)) for v in nb_vals]
        r_pear, _ = stats.pearsonr(sf_cap, nb_cap)
        diffs = [abs(a - b) for a, b in zip(sf_cap, nb_cap)]
        sign_sub = [(a, b) for a, b in zip(sf_vals, nb_vals) if abs(a) >= 0.5]
        sign_agree = sum(1 for a, b in sign_sub if (a > 0 and b > 0) or (a < 0 and b < 0)) / max(len(sign_sub), 1)
        return {
            "n": len(sub),
            "spearman_rho": round(float(rho), 4),
            "spearman_p": float(p_rho),
            "pearson_r_cap15": round(float(r_pear), 4),
            "mae_pawns": round(statistics.mean(diffs), 3),
            "rmse_pawns": round(math.sqrt(statistics.mean(d * d for d in diffs)), 3),
            "sign_agreement_ge05": round(sign_agree, 4),
        }

    phases = {
        "all": rows,
        "opening_ge0.7": [r for r in rows if r["phase"] >= 0.7],
        "middlegame_0.3_0.7": [r for r in rows if 0.3 <= r["phase"] < 0.7],
        "endgame_lt0.3": [r for r in rows if r["phase"] < 0.3],
    }
    term_corrs = {}
    for t in ("mat", "flux", "terr", "ex", "king", "trop", "pawn", "conf", "tempo"):
        rho, _ = stats.spearmanr([r["sf"] for r in rows], [r["terms"][t] for r in rows])
        term_corrs[t] = round(float(rho), 4)

    return {
        "n": len(rows),
        "level1_static": {k: metrics(v, "nabla_l1") for k, v in phases.items() if v},
        "level0_eval": {"all": metrics(rows, "nabla_l0")},
        "term_spearman": term_corrs,
        # Keep lightweight sample for scatter plot.
        "points": [{"sf": round(r["sf"], 3), "l1": round(r["nabla_l1"], 3), "phase": round(r["phase"], 3)} for r in rows],
    }


def exp8_perf() -> dict[str, Any]:
    bench_stats = {}
    for lvl in (0, 1, 2):
        times_ms, nps_list, dec_ms = [], [], []
        nodes = evals = 0
        checksum = param_hash = ""
        for _ in range(5):
            r = subprocess.run([str(NABLA), "bench", str(lvl)], capture_output=True, text=True, check=True)
            txt = r.stdout
            nodes = int(re.search(r"Nodes searched\s*:\s*(\d+)", txt).group(1))
            evals = int(re.search(r"Evaluations\s*:\s*(\d+)", txt).group(1))
            times_ms.append(float(re.search(r"Time \(ms\)\s*:\s*(\d+)", txt).group(1)))
            nps_list.append(float(re.search(r"Nodes/second\s*:\s*(\d+)", txt).group(1)))
            dec_ms.append(float(re.search(r"Decision \(ms\)\s*:\s*([\d.]+)", txt).group(1)))
            checksum = re.search(r"Checksum\s*:\s*([0-9a-f]+)", txt).group(1)
            param_hash = re.search(r"Parameter hash\s*:\s*([0-9a-f]+)", txt).group(1)

        def iqr(xs: list[float]) -> float:
            q = statistics.quantiles(xs, n=4)
            return round(q[2] - q[0], 3)

        med_dec = round(statistics.median(dec_ms), 2)
        med_nps = statistics.median(nps_list)
        bench_stats[f"L{lvl}"] = {
            "nodes": nodes,
            "evaluations": evals,
            "median_decision_ms": med_dec,
            "iqr_decision_ms": iqr(dec_ms),
            "median_nps": int(med_nps),
            "us_per_node": round(1e6 / med_nps, 2),
            "checksum": checksum,
            "param_hash": param_hash,
        }

    wasm_res = subprocess.run(["node", "tools/check_wasm_parity.mjs"], cwd=str(ROOT), capture_output=True, text=True, check=True)
    wasm_means: dict[str, float] = {}
    for lvl in (0, 1, 2):
        m = re.search(rf"Level {lvl}:\s*16/16 parity OK\s*\(WASM mean\s*([\d.]+)\s*ms/pos\)", wasm_res.stdout)
        if m:
            wasm_means[f"L{lvl}"] = float(m.group(1))
    parity_ok = "All 48 native-vs-WASM cross-target checks passed bit-identically." in wasm_res.stdout
    ratios = {
        k: round(wasm_means[k] / max(bench_stats[k]["median_decision_ms"], 1e-6), 2)
        for k in wasm_means
    }
    return {"native_bench": bench_stats, "wasm_mean_ms": wasm_means, "wasm_slowdown_x": ratios, "bit_identical_48_48": parity_ok}


def write_manifest(exp_names: list[str]) -> dict[str, Any]:
    git_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(ROOT), capture_output=True, text=True, check=True).stdout.strip()
    rustc_v = subprocess.run(["rustc", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    fc_v = subprocess.run([str(FASTCHESS), "--version"], capture_output=True, text=True, check=True).stdout.strip().splitlines()[0]
    sf_v = subprocess.run([str(STOCKFISH)], input="uci\nquit\n", capture_output=True, text=True).stdout.splitlines()[0]
    manifest = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "git_commit": git_sha,
        "os": f"{sys.platform} ({os.name})",
        "cpu": os.environ.get("PROCESSOR_IDENTIFIER", "Intel Core i7-7700HQ"),
        "concurrency": CONCURRENCY,
        "adjudication": "none",
        "time_control_main": TC_MAIN,
        "time_control_gate": TC_GATE,
        "base_seed": BASE_SEED,
        "tools": {"rustc": rustc_v, "fastchess": fc_v, "stockfish": sf_v},
        "experiments_cached": exp_names,
    }
    save_json(RES_DIR / "manifest.json", manifest)
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Comma-separated experiment names (e.g. exp0_gate,exp1_probe)")
    ap.add_argument("--force", action="store_true", help="Re-run even if cached JSON exists")
    args = ap.parse_args()

    RES_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    wanted = set(args.only.split(",")) if args.only else {
        "exp0_gate", "exp1_probe", "exp2_elo_pool", "exp3_ablations",
        "exp4_temperature", "exp5_tactics", "exp6_endgames", "exp7_eval_corr", "exp8_perf",
    }

    def run_or_load(name: str, fn: Any) -> Any:
        out_path = RES_DIR / f"{name}.json"
        if not args.force:
            cached = load_json(out_path)
            if cached is not None:
                print(f"[cache] loaded {out_path.name}", flush=True)
                return cached
        data = fn()
        save_json(out_path, data)
        return data

    if "exp0_gate" in wanted:
        run_or_load("exp0_gate", exp0_gate)
    probe = None
    if "exp1_probe" in wanted or "exp2_elo_pool" in wanted:
        probe = run_or_load("exp1_probe", exp1_probe)
    if "exp2_elo_pool" in wanted:
        assert probe is not None
        run_or_load("exp2_elo_pool", lambda: exp2_elo_pool(probe))
    if "exp3_ablations" in wanted:
        run_or_load("exp3_ablations", exp3_ablations)
    if "exp4_temperature" in wanted:
        run_or_load("exp4_temperature", exp4_temperature)
    if "exp5_tactics" in wanted:
        run_or_load("exp5_tactics", exp5_tactics)
    if "exp6_endgames" in wanted:
        run_or_load("exp6_endgames", exp6_endgames)
    if "exp7_eval_corr" in wanted:
        run_or_load("exp7_eval_corr", exp7_eval_corr)
    if "exp8_perf" in wanted:
        run_or_load("exp8_perf", exp8_perf)

    cached_names = sorted(p.stem for p in RES_DIR.glob("exp*.json"))
    write_manifest(cached_names)
    print(f"[done] cached experiments: {', '.join(cached_names)}", flush=True)


if __name__ == "__main__":
    main()
