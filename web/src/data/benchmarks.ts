import exp2 from "../../../benchmarks/results/exp2_elo_pool.json";
import exp3 from "../../../benchmarks/results/exp3_ablations.json";
import exp4 from "../../../benchmarks/results/exp4_temperature.json";
import exp5 from "../../../benchmarks/results/exp5_tactics.json";
import exp6 from "../../../benchmarks/results/exp6_endgames.json";
import exp7 from "../../../benchmarks/results/exp7_eval_corr.json";
import exp8 from "../../../benchmarks/results/exp8_perf.json";

export interface ModelLatencyRow {
  level: "Level 0" | "Level 1" | "Level 2";
  nativeMs: number;
  wasmMs: number;
  nodes: number;
  evaluations: number;
  nps: number;
  usPerNode: number;
  iqrMs: number;
  slowdownX: number;
  checksum: string;
}

export type EngineFamily = "nabla" | "sf" | "maia" | "pesto" | "floor";

export interface EloLadderRow {
  player: string;
  family: EngineFamily;
  rating: number;
  error95: number;
  ci95Low: number;
  ci95High: number;
  err: [number, number] | null;
  games: number;
  scorePct: number;
  isAnchor: boolean;
  meanNodes: number;
  meanMs: number;
  plotMs: number;
}

export type AblationSig = "holm" | "raw" | "ns";

export interface AblationRow {
  label: string;
  rawLabel: string;
  slug: string;
  elo: number;
  error95: number;
  ci95Low: number;
  ci95High: number;
  err: [number, number];
  wins: number;
  losses: number;
  draws: number;
  pValue: number;
  pHolm: number;
  sig: AblationSig;
}

export interface AblationsData {
  level1: AblationRow[];
  level0: AblationRow[];
}

export interface TempCurvePoint {
  tempLabel: string;
  tempPawns: number;
  elo: number;
  eloErr: number;
  err: [number, number] | null;
  eloLabel: string;
  isLowerBound: boolean;
  entropy: number;
  perplexity: number;
  record: string;
}

export interface BlunderRow {
  label: string;
  shortLabel: string;
  isRef: boolean;
  isDeterministicL2: boolean;
  moves: number;
  meanAcpl: number;
  medianCpl: number;
  blunderPct: number;
  err: [number, number];
  ciLowPct: number;
  ciHighPct: number;
  sfTop1Pct: number;
}

export interface TemperatureData {
  curve: TempCurvePoint[];
  blunders: BlunderRow[];
}

export interface EndgameVariantCell {
  ratePct: number;
  err: [number, number];
  ciLowPct: number;
  ciHighPct: number;
  converted: number;
  games: number;
  meanPlies: number;
  failures: string;
}

export interface EndgameGroupRow {
  kind: "KQK" | "KRK" | "KPK";
  l2: EndgameVariantCell;
  l2NoConf: EndgameVariantCell;
  l1: EndgameVariantCell;
  l0: EndgameVariantCell;
  // Flat fields for grouped Recharts BarChart + ErrorBar
  l2Pct: number;
  l2Err: [number, number];
  l2NoConfPct: number;
  l2NoConfErr: [number, number];
  l1Pct: number;
  l1Err: [number, number];
  l0Pct: number;
  l0Err: [number, number];
}

export interface TacticsRow {
  engine: string;
  wacPct: number;
  wacErr: [number, number];
  wacSolved: string;
  wacNodes: number;
  bkPct: number;
  bkErr: [number, number];
  bkSolved: string;
  bkNodes: number;
}

export interface TacticsEndgamesData {
  endgames: EndgameGroupRow[];
  tactics: TacticsRow[];
}

export interface EvalSliceStats {
  n: number;
  spearmanRho: number;
  pearsonRCap15: number;
  maePawns: number;
  rmsePawns: number;
  signAgreementPct: number;
}

export interface TermCorrRow {
  term: string;
  label: string;
  rho: number;
}

export interface EvalScatterPoint {
  sf: number;
  l1: number;
  rawSf: number;
  rawL1: number;
  phase: number;
}

export interface StaticEvalData {
  summary: {
    all: EvalSliceStats;
    opening: EvalSliceStats;
    middlegame: EvalSliceStats;
    endgame: EvalSliceStats;
  };
  terms: TermCorrRow[];
  scatter: {
    opening: EvalScatterPoint[];
    middlegame: EvalScatterPoint[];
    endgame: EvalScatterPoint[];
  };
  scatterSampleCount: number;
}

export const modelLatencyData: ModelLatencyRow[] = (
  [
    ["L0", "Level 0"],
    ["L1", "Level 1"],
    ["L2", "Level 2"],
  ] as const
).map(([key, label]) => {
  const b = exp8.native_bench[key];
  return {
    level: label,
    nativeMs: b.median_decision_ms,
    wasmMs: exp8.wasm_mean_ms[key],
    nodes: b.nodes,
    evaluations: b.evaluations,
    nps: b.median_nps,
    usPerNode: b.us_per_node,
    iqrMs: b.iqr_decision_ms,
    slowdownX: exp8.wasm_slowdown_x[key],
    checksum: b.checksum,
  };
});

function classifyFamily(player: string): EngineFamily {
  if (player.startsWith("Nabla")) return "nabla";
  if (player.startsWith("SF-")) return "sf";
  if (player.startsWith("Maia-")) return "maia";
  if (player.startsWith("AB-PeSTO")) return "pesto";
  return "floor";
}

const exp2Compute = exp2.compute as Record<
  string,
  { mean_nodes: number; median_nodes: number; mean_ms: number; median_ms: number }
>;

export const eloLadderData: EloLadderRow[] = exp2.ordo_ratings.map((row) => {
  const comp = exp2Compute[row.player];
  const meanNodes = comp?.mean_nodes ?? 0;
  const meanMs = comp?.mean_ms ?? 0;
  return {
    player: row.player,
    family: classifyFamily(row.player),
    rating: row.rating,
    error95: row.error_95,
    ci95Low: row.ci95_low,
    ci95High: row.ci95_high,
    err: row.is_anchor
      ? null
      : [
          Math.max(0, +(row.rating - row.ci95_low).toFixed(1)),
          Math.max(0, +(row.ci95_high - row.rating).toFixed(1)),
        ],
    games: row.games,
    scorePct: row.score_pct,
    isAnchor: row.is_anchor,
    meanNodes,
    meanMs,
    plotMs: Math.max(0.005, meanMs),
  };
});

const ABLATION_LABELS: Record<string, string> = {
  chi_0: "No X-ray (χ=0)",
  lambda_0: "No Attenuation (λ=0)",
  ablate_flux: "No Mobility",
  ablate_terr: "No Territory",
  ablate_ex: "No Exchange",
  ablate_king: "No King safety",
  ablate_trop: "No Tropism",
  ablate_pawn: "No Pawns",
  ablate_conf: "No Confinement",
  ablate_tempo: "No Tempo",
};

interface RawAblation {
  slug: string;
  label: string;
  elo: number;
  elo_err: number;
  ci95_low: number;
  ci95_high: number;
  wins: number;
  losses: number;
  draws: number;
  p_value: number;
  p_holm: number;
}

function mapAblationRows(rows: RawAblation[]): AblationRow[] {
  return [...rows]
    .sort((a, b) => a.elo - b.elo)
    .map((r) => ({
      label: ABLATION_LABELS[r.slug] ?? r.label,
      rawLabel: r.label,
      slug: r.slug,
      elo: +r.elo.toFixed(1),
      error95: +r.elo_err.toFixed(1),
      ci95Low: +r.ci95_low.toFixed(1),
      ci95High: +r.ci95_high.toFixed(1),
      err: [
        Math.max(0, +(r.elo - r.ci95_low).toFixed(1)),
        Math.max(0, +(r.ci95_high - r.elo).toFixed(1)),
      ],
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      pValue: r.p_value,
      pHolm: r.p_holm,
      sig: r.p_holm < 0.05 ? "holm" : r.p_value < 0.05 ? "raw" : "ns",
    }));
}

export const ablationsData: AblationsData = {
  level1: mapAblationRows(exp3.level1 as unknown as RawAblation[]),
  level0: mapAblationRows(exp3.level0 as unknown as RawAblation[]),
};

const matchByTemp = new Map(exp4.matches.map((m) => [m.temp_pawns, m]));

const SHORT_BLUNDER_LABELS: Record<string, string> = {
  "Nabla-L0": "Nabla-L0",
  "Nabla-L1": "Nabla-L1",
  "Nabla-L2 (T=0.00)": "Nabla-L2",
  "Maia-1500": "Maia-1500",
  "Nabla-L2 (T=0.10)": "T=0.10",
  "Nabla-L2 (T=0.25)": "T=0.25",
  "Nabla-L2 (T=0.50)": "T=0.50",
  "Nabla-L2 (T=1.00)": "T=1.00",
  "Nabla-L2 (T=2.00)": "T=2.00",
};

export const temperatureData: TemperatureData = {
  curve: exp4.entropy.map((e) => {
    const m = matchByTemp.get(e.temp_pawns);
    if (!m) {
      return {
        tempLabel: "0.00",
        tempPawns: 0,
        elo: 0,
        eloErr: 0,
        err: null,
        eloLabel: "0.0 (ref)",
        isLowerBound: false,
        entropy: +e.mean_entropy_nats.toFixed(3),
        perplexity: +e.perplexity.toFixed(2),
        record: "ref",
      };
    }
    const isLowerBound = m.score === 0;
    const eloPlot = isLowerBound ? -921.0 : +m.elo.toFixed(1);
    const ciLow = isLowerBound ? eloPlot : m.ci95_low;
    const ciHigh = isLowerBound ? eloPlot : m.ci95_high;
    return {
      tempLabel: e.temp_pawns.toFixed(2),
      tempPawns: e.temp_pawns,
      elo: eloPlot,
      eloErr: +m.elo_err.toFixed(1),
      err: isLowerBound
        ? null
        : [
            Math.max(0, +(eloPlot - ciLow).toFixed(1)),
            Math.max(0, +(ciHigh - eloPlot).toFixed(1)),
          ],
      eloLabel: isLowerBound
        ? "< −921 (0/100)"
        : `${m.elo > 0 ? "+" : ""}${m.elo.toFixed(1)} ± ${m.elo_err.toFixed(1)}`,
      isLowerBound,
      entropy: +e.mean_entropy_nats.toFixed(3),
      perplexity: +e.perplexity.toFixed(2),
      record: `${m.wins}W–${m.losses}L–${m.draws}D`,
    };
  }),
  blunders: exp4.acpl_blunders.map((b) => {
    const pct = +(b.blunder_rate * 100).toFixed(1);
    const lowPct = +(b.blunder_ci95[0] * 100).toFixed(1);
    const highPct = +(b.blunder_ci95[1] * 100).toFixed(1);
    return {
      label: b.label,
      shortLabel: SHORT_BLUNDER_LABELS[b.label] ?? b.label,
      isRef: b.label === "Maia-1500",
      isDeterministicL2: b.label === "Nabla-L2 (T=0.00)",
      moves: b.moves,
      meanAcpl: +b.mean_acpl.toFixed(1),
      medianCpl: b.median_cpl,
      blunderPct: pct,
      err: [
        Math.max(0, +(pct - lowPct).toFixed(1)),
        Math.max(0, +(highPct - pct).toFixed(1)),
      ],
      ciLowPct: lowPct,
      ciHighPct: highPct,
      sfTop1Pct: +(b.sf_top1_match * 100).toFixed(1),
    };
  }),
};

function formatReasons(reasons: Record<string, number | undefined>): string {
  const LABELS: Record<string, string> = {
    fifty: "50-move",
    "50move_limit": "50-move",
    material: "insufficient material",
    repetition: "repetition",
    stalemate: "stalemate",
  };
  const parts = Object.entries(reasons)
    .filter((pair): pair is [string, number] => pair[0] !== "mate" && typeof pair[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${LABELS[k] ?? k}`);
  return parts.length ? parts.join(", ") : "none";
}

function toEndgameCell(
  entry: (typeof exp6.results)[number],
): EndgameVariantCell {
  const pct = +(entry.rate * 100).toFixed(1);
  const lowPct = +(entry.ci95[0] * 100).toFixed(1);
  const highPct = +(entry.ci95[1] * 100).toFixed(1);
  return {
    ratePct: pct,
    err: [
      Math.max(0, +(pct - lowPct).toFixed(1)),
      Math.max(0, +(highPct - pct).toFixed(1)),
    ],
    ciLowPct: lowPct,
    ciHighPct: highPct,
    converted: entry.converted,
    games: entry.games,
    meanPlies: entry.mean_plies_to_mate,
    failures: formatReasons(entry.reasons),
  };
}

const bkByEngine = new Map(exp5.bk24.map((r) => [r.engine, r]));

export const tacticsEndgamesData: TacticsEndgamesData = {
  endgames: (["KQK", "KRK", "KPK"] as const).map((kind) => {
    const find = (engine: string) => {
      const hit = exp6.results.find((r) => r.kind === kind && r.engine === engine);
      if (!hit) throw new Error(`Missing endgame row ${kind} / ${engine}`);
      return toEndgameCell(hit);
    };
    const l2 = find("Nabla-L2");
    const l2NoConf = find("Nabla-L2 (no conf)");
    const l1 = find("Nabla-L1");
    const l0 = find("Nabla-L0");
    return {
      kind,
      l2,
      l2NoConf,
      l1,
      l0,
      l2Pct: l2.ratePct,
      l2Err: l2.err,
      l2NoConfPct: l2NoConf.ratePct,
      l2NoConfErr: l2NoConf.err,
      l1Pct: l1.ratePct,
      l1Err: l1.err,
      l0Pct: l0.ratePct,
      l0Err: l0.err,
    };
  }),
  tactics: exp5.wac300.map((w) => {
    const bk = bkByEngine.get(w.engine);
    if (!bk) throw new Error(`Missing BK-24 row for ${w.engine}`);
    const wacPct = +(w.rate * 100).toFixed(1);
    const bkPct = +(bk.rate * 100).toFixed(1);
    return {
      engine: w.engine,
      wacPct,
      wacErr: [
        Math.max(0, +(wacPct - w.ci95[0] * 100).toFixed(1)),
        Math.max(0, +(w.ci95[1] * 100 - wacPct).toFixed(1)),
      ],
      wacSolved: `${w.solved}/${w.total}`,
      wacNodes: w.mean_nodes,
      bkPct,
      bkErr: [
        Math.max(0, +(bkPct - bk.ci95[0] * 100).toFixed(1)),
        Math.max(0, +(bk.ci95[1] * 100 - bkPct).toFixed(1)),
      ],
      bkSolved: `${bk.solved}/${bk.total}`,
      bkNodes: bk.mean_nodes,
    };
  }),
};

function toSliceStats(s: typeof exp7.level1_static.all): EvalSliceStats {
  return {
    n: s.n,
    spearmanRho: +s.spearman_rho.toFixed(3),
    pearsonRCap15: +s.pearson_r_cap15.toFixed(3),
    maePawns: +s.mae_pawns.toFixed(2),
    rmsePawns: +s.rmse_pawns.toFixed(2),
    signAgreementPct: +(s.sign_agreement_ge05 * 100).toFixed(1),
  };
}

const TERM_NAMES: Record<string, string> = {
  mat: "Material",
  conf: "Confinement",
  terr: "Territory",
  flux: "Mobility",
  king: "King safety",
  pawn: "Pawns",
  trop: "Tropism",
  ex: "Exchange",
  tempo: "Tempo",
};

const clamp15 = (v: number) => Math.max(-15, Math.min(15, +v.toFixed(2)));

const sampledScatter = exp7.points
  .filter((_, idx) => idx % 4 === 0)
  .map((p) => ({
    sf: clamp15(p.sf),
    l1: clamp15(p.l1),
    rawSf: +p.sf.toFixed(2),
    rawL1: +p.l1.toFixed(2),
    phase: +p.phase.toFixed(3),
  }));

export const staticEvalData: StaticEvalData = {
  summary: {
    all: toSliceStats(exp7.level1_static.all),
    opening: toSliceStats(exp7.level1_static["opening_ge0.7"]),
    middlegame: toSliceStats(exp7.level1_static["middlegame_0.3_0.7"]),
    endgame: toSliceStats(exp7.level1_static["endgame_lt0.3"]),
  },
  terms: Object.entries(exp7.term_spearman)
    .map(([term, rho]) => ({
      term,
      label: TERM_NAMES[term] ?? term,
      rho: +rho.toFixed(3),
    }))
    .sort((a, b) => b.rho - a.rho),
  scatter: {
    opening: sampledScatter.filter((p) => p.phase >= 0.7),
    middlegame: sampledScatter.filter((p) => p.phase >= 0.3 && p.phase < 0.7),
    endgame: sampledScatter.filter((p) => p.phase < 0.3),
  },
  scatterSampleCount: sampledScatter.length,
};
