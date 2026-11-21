import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "../ui/chart";
import type {
  AblationRow,
  AblationSig,
  AblationsData,
  BlunderRow,
  EndgameGroupRow,
  EvalScatterPoint,
  StaticEvalData,
  TacticsEndgamesData,
  TacticsRow,
  TempCurvePoint,
  TemperatureData,
  TermCorrRow,
} from "../../data/benchmarks";

type TabId = "ablations" | "temperature" | "tacticsEndgames" | "staticEval";

const chartConfig = {
  elo: { label: "Elo Δ vs baseline", color: "var(--chart-1)" },
  entropy: { label: "Policy entropy H", color: "var(--chart-3)" },
  holm: { label: "Holm p < 0.05", color: "var(--chart-5)" },
  raw: { label: "Raw p < 0.05", color: "var(--chart-3)" },
  ns: { label: "Within noise", color: "var(--chart-muted)" },
  l2: { label: "Nabla-L2", color: "var(--chart-1)" },
  l2NoConf: { label: "Nabla-L2 (no conf)", color: "var(--chart-5)" },
  l1: { label: "Nabla-L1", color: "var(--chart-2)" },
  l0: { label: "Nabla-L0", color: "var(--chart-muted)" },
  wac: { label: "WAC-300", color: "var(--chart-1)" },
  bk: { label: "BK-24", color: "var(--chart-3)" },
  opening: { label: "Opening (φ ≥ 0.7)", color: "var(--chart-muted)" },
  middlegame: { label: "Middlegame (0.3 ≤ φ < 0.7)", color: "var(--chart-1)" },
  endgame: { label: "Endgame (φ < 0.3)", color: "var(--chart-3)" },
} satisfies ChartConfig;

const ABLATION_COLOR: Record<AblationSig, string> = {
  holm: "var(--chart-5)",
  raw: "var(--chart-3)",
  ns: "var(--chart-muted)",
};

function fmtP(p: number): string {
  if (p === 0 || p < 1e-300) return "< 1e-300";
  if (p < 0.001) return p.toExponential(1);
  return p.toFixed(4);
}

function renderAngledEngineTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const label = String(props.payload?.value ?? "");
  const isNabla = label.startsWith("Nabla");
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="end"
        transform="rotate(-25)"
        fontFamily="var(--mono)"
        fontSize={11}
        fontWeight={isNabla ? 700 : 400}
        fill={isNabla ? "var(--ink)" : "var(--ink-3)"}
      >
        {label}
      </text>
    </g>
  );
}

function AblationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: AblationRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;
  const sigLabel =
    r.sig === "holm"
      ? "Significant (Holm p < 0.05)"
      : r.sig === "raw"
        ? "Marginal (raw p < 0.05 only)"
        : "Within measurement noise";

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{r.rawLabel}</div>
      <div className="shadcn-tooltip-sub">{sigLabel}</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": ABLATION_COLOR[r.sig] } as React.CSSProperties}
            />
            <span>Elo Δ (95% CI)</span>
          </span>
          <span className="shadcn-tooltip-value">
            {r.elo > 0 ? `+${r.elo.toFixed(1)}` : r.elo.toFixed(1)} ±{" "}
            {r.error95.toFixed(1)}
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Record (200g)</span>
          <span className="shadcn-tooltip-value">
            {r.wins}W–{r.losses}L–{r.draws}D
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Raw / Holm p</span>
          <span className="shadcn-tooltip-value">
            {fmtP(r.pValue)} / {fmtP(r.pHolm)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TempCurveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TempCurvePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">Temperature τ = {r.tempLabel} pawns</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": "var(--chart-1)" } as React.CSSProperties}
            />
            <span>Elo vs T=0</span>
          </span>
          <span className="shadcn-tooltip-value">{r.eloLabel}</span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Match record</span>
          <span className="shadcn-tooltip-value">{r.record}</span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dashed"
              style={{ "--indicator-color": "var(--chart-3)" } as React.CSSProperties}
            />
            <span>Entropy / Perplexity</span>
          </span>
          <span className="shadcn-tooltip-value">
            {r.entropy.toFixed(3)} nats / {r.perplexity.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BlunderTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BlunderRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{r.label}</div>
      <div className="shadcn-tooltip-sub">{r.moves} scored moves vs SF depth 10</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Blunders (≥200 cp)</span>
          <span className="shadcn-tooltip-value">
            {r.blunderPct.toFixed(1)}% [{r.ciLowPct.toFixed(1)}, {r.ciHighPct.toFixed(1)}]
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Mean ACPL / Median</span>
          <span className="shadcn-tooltip-value">
            {r.meanAcpl.toFixed(1)} / {r.medianCpl.toFixed(1)} cp
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">SF Top-1 agreement</span>
          <span className="shadcn-tooltip-value">{r.sfTop1Pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function EndgameTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EndgameGroupRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  const entries = [
    ["Nabla-L2", r.l2, "var(--chart-1)"],
    ["Nabla-L2 (no conf)", r.l2NoConf, "var(--chart-5)"],
    ["Nabla-L1", r.l1, "var(--chart-2)"],
    ["Nabla-L0", r.l0, "var(--chart-muted)"],
  ] as const;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{r.kind} vs Stockfish depth 8</div>
      <div className="shadcn-tooltip-sub">200 verified wins, 50-move limit</div>
      <div className="shadcn-tooltip-items">
        {entries.map(([name, cell, color]) => (
          <div key={name} className="shadcn-tooltip-item">
            <span className="shadcn-tooltip-key">
              <span
                className="shadcn-indicator dot"
                style={{ "--indicator-color": color } as React.CSSProperties}
              />
              <span>{name}</span>
            </span>
            <span className="shadcn-tooltip-value">
              {cell.ratePct.toFixed(1)}% ({cell.converted}/{cell.games})
            </span>
          </div>
        ))}
      </div>
      <div className="shadcn-tooltip-extra">
        <div>
          L2 mean plies: <strong>{r.l2.meanPlies.toFixed(1)}</strong> · fails:{" "}
          {r.l2.failures}
        </div>
        <div>No-conf fails: {r.l2NoConf.failures}</div>
      </div>
    </div>
  );
}

function TacticsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TacticsRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{r.engine}</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": "var(--chart-1)" } as React.CSSProperties}
            />
            <span>WAC-300</span>
          </span>
          <span className="shadcn-tooltip-value">
            {r.wacPct.toFixed(1)}% ({r.wacSolved}) · {Math.round(r.wacNodes)} n
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": "var(--chart-3)" } as React.CSSProperties}
            />
            <span>BK-24</span>
          </span>
          <span className="shadcn-tooltip-value">
            {r.bkPct.toFixed(1)}% ({r.bkSolved}) · {Math.round(r.bkNodes)} n
          </span>
        </div>
      </div>
    </div>
  );
}

function EvalScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EvalScatterPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">Quiet probe (φ = {p.phase.toFixed(2)})</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Stockfish d10</span>
          <span className="shadcn-tooltip-value">{p.rawSf.toFixed(2)} p</span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Nabla static E(S)</span>
          <span className="shadcn-tooltip-value">{p.rawL1.toFixed(2)} p</span>
        </div>
      </div>
    </div>
  );
}

function TermCorrTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TermCorrRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{r.label}</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Spearman ρ vs SF d10</span>
          <span className="shadcn-tooltip-value">{r.rho.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticsCharts({
  ablations,
  temperature,
  tacticsEndgames,
  staticEval,
}: {
  ablations: AblationsData;
  temperature: TemperatureData;
  tacticsEndgames: TacticsEndgamesData;
  staticEval: StaticEvalData;
}) {
  const [tab, setTab] = useState<TabId>("ablations");
  const [ablationLevel, setAblationLevel] = useState<"level1" | "level0">("level1");
  const [tempView, setTempView] = useState<"curve" | "blunders">("curve");
  const [teView, setTeView] = useState<"endgames" | "tactics">("endgames");
  const [evalView, setEvalView] = useState<"scatter" | "terms">("scatter");

  const activeAblations = ablations[ablationLevel];

  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <div className="chart-head-copy">
          <h3 className="chart-title">Diagnostic experiments</h3>
          <p className="chart-sub">
            Component ablations, temperature policy, tactics/endgames, and static evaluation correlation
          </p>
        </div>
      </div>

      <div className="chart-tabs" role="tablist" aria-label="Diagnostic benchmark views">
        {(
          [
            ["ablations", "Ablations"],
            ["temperature", "Temperature & Blunders"],
            ["tacticsEndgames", "Tactics & Endgames"],
            ["staticEval", "Static Eval"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="chart-tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ablations" && (
        <>
          <div className="chart-subcontrols">
            <div className="chart-seg" role="group" aria-label="Ablation level">
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={ablationLevel === "level1"}
                onClick={() => setAblationLevel("level1")}
              >
                Level 1 (10 terms)
              </button>
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={ablationLevel === "level0"}
                onClick={() => setAblationLevel("level0")}
              >
                Level 0 (6 terms)
              </button>
            </div>
            <div className="chart-legend-row" style={{ margin: 0 }}>
              <span className="chart-legend-item">
                <span className="chart-swatch" style={{ backgroundColor: "var(--chart-5)" }} />
                <span>Holm p &lt; 0.05</span>
              </span>
              <span className="chart-legend-item">
                <span className="chart-swatch" style={{ backgroundColor: "var(--chart-3)" }} />
                <span>Raw p &lt; 0.05</span>
              </span>
              <span className="chart-legend-item">
                <span className="chart-swatch" style={{ backgroundColor: "var(--chart-muted)" }} />
                <span>Within noise</span>
              </span>
            </div>
          </div>

          <div
            className="chart-box"
            style={{ height: ablationLevel === "level1" ? 330 : 250 }}
          >
            <ChartContainer config={chartConfig}>
              <BarChart
                data={activeAblations}
                layout="vertical"
                margin={{ top: 6, right: 20, left: 4, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  domain={ablationLevel === "level1" ? [-140, 80] : [-1080, 120]}
                  ticks={
                    ablationLevel === "level1"
                      ? [-120, -80, -40, 0, 40, 80]
                      : [-1000, -750, -500, -250, 0, 100]
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={124}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine x={0} stroke="var(--ink-2)" />
                <ChartTooltip
                  cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                  content={<AblationTooltip />}
                />
                <Bar
                  dataKey="elo"
                  radius={[3, 3, 3, 3]}
                  barSize={16}
                  isAnimationActive={false}
                >
                  {activeAblations.map((row) => (
                    <Cell key={row.slug} fill={ABLATION_COLOR[row.sig]} />
                  ))}
                  <ErrorBar
                    dataKey="err"
                    direction="x"
                    width={4}
                    strokeWidth={1.3}
                    stroke="var(--ink-2)"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          <figcaption className="chart-foot">
            Figure 3 (200 games/variant at 30+0.3 s). At Level 0, removing
            exchange evaluation collapses play by <strong>−919.5 ± 155.7 Elo</strong>;
            at Level 1, pawns (−70.4) and king safety (−59.6) are
            Holm-significant, while untuned X-ray pressure stays within noise (−3.5 to −15.7 Elo).
          </figcaption>
        </>
      )}

      {tab === "temperature" && (
        <>
          <div className="chart-subcontrols">
            <div className="chart-seg" role="group" aria-label="Temperature view">
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={tempView === "curve"}
                onClick={() => setTempView("curve")}
              >
                Elo &amp; Entropy vs τ
              </button>
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={tempView === "blunders"}
                onClick={() => setTempView("blunders")}
              >
                Blunder Rate &amp; ACPL
              </button>
            </div>
            {tempView === "curve" ? (
              <div className="chart-legend-row" style={{ margin: 0 }}>
                <span className="chart-legend-item">
                  <span className="chart-swatch dot" style={{ backgroundColor: "var(--chart-1)" }} />
                  <span>Elo Δ vs T=0 (left)</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-3)" }} />
                  <span>Entropy H nats (right)</span>
                </span>
              </div>
            ) : (
              <div className="chart-legend-row" style={{ margin: 0 }}>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-1)" }} />
                  <span>Deterministic <strong style={{ color: "var(--ink)", fontWeight: 700 }}>Nabla</strong></span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-3)" }} />
                  <span>Maia-1500 ref</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-5)" }} />
                  <span><strong style={{ color: "var(--ink)", fontWeight: 700 }}>Nabla-L2</strong> (τ &gt; 0)</span>
                </span>
              </div>
            )}
          </div>

          <div className="chart-box" style={{ height: 295 }}>
            <ChartContainer config={chartConfig}>
              {tempView === "curve" ? (
                <ComposedChart
                  data={temperature.curve}
                  margin={{ top: 12, right: 6, left: -2, bottom: 4 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="tempLabel" tickLine={false} axisLine={false} tickMargin={6} />
                  <YAxis
                    yAxisId="elo"
                    domain={[-1000, 80]}
                    ticks={[-921, -750, -500, -250, 0]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="ent"
                    orientation="right"
                    domain={[0, 3.2]}
                    ticks={[0, 0.8, 1.6, 2.4, 3.2]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine yAxisId="elo" y={0} stroke="var(--line-2)" />
                  <ChartTooltip content={<TempCurveTooltip />} />
                  <Line
                    yAxisId="elo"
                    type="monotone"
                    dataKey="elo"
                    stroke="var(--chart-1)"
                    strokeWidth={2.2}
                    dot={(dotProps) => {
                      const cx = Number(dotProps.cx);
                      const cy = Number(dotProps.cy);
                      const row = dotProps.payload as TempCurvePoint | undefined;
                      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
                        return <g key={dotProps.key} />;
                      }
                      return (
                        <circle
                          key={dotProps.key}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={row?.isLowerBound ? "var(--bg)" : "var(--chart-1)"}
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                        />
                      );
                    }}
                    isAnimationActive={false}
                  >
                    <ErrorBar
                      dataKey="err"
                      direction="y"
                      width={4}
                      strokeWidth={1.3}
                      stroke="var(--chart-1)"
                    />
                  </Line>
                  <Line
                    yAxisId="ent"
                    type="monotone"
                    dataKey="entropy"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ r: 3.5, fill: "var(--chart-3)" }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              ) : (
                <BarChart
                  data={temperature.blunders}
                  margin={{ top: 12, right: 12, left: -4, bottom: 16 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    interval={0}
                    height={58}
                    tickLine={false}
                    axisLine={false}
                    tick={renderAngledEngineTick}
                  />
                  <YAxis
                    domain={[0, 28]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                    content={<BlunderTooltip />}
                  />
                  <Bar
                    dataKey="blunderPct"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                    isAnimationActive={false}
                  >
                    {temperature.blunders.map((row) => (
                      <Cell
                        key={row.label}
                        fill={
                          row.isRef
                            ? "var(--chart-3)"
                            : !row.isDeterministicL2 && row.label.includes("T=")
                              ? "var(--chart-5)"
                              : "var(--chart-1)"
                        }
                      />
                    ))}
                    <ErrorBar
                      dataKey="err"
                      direction="y"
                      width={4}
                      strokeWidth={1.3}
                      stroke="var(--ink-2)"
                    />
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </div>

          <figcaption className="chart-foot">
            Figure 4. Strength drops strictly monotonically from temperature{" "}
            <code>τ = 0</code> to <code>2.00</code> pawns (open circle at −921 is the 0/100 score bound) while
            entropy rises 0 → 2.785 nats. Deterministic <code>Nabla-L2</code> records{" "}
            <strong>7.8% blunders</strong> (≥200 cp vs Stockfish depth 10) vs <strong>10.5%</strong> for <code>Maia-1500</code>.
          </figcaption>
        </>
      )}

      {tab === "tacticsEndgames" && (
        <>
          <div className="chart-subcontrols">
            <div className="chart-seg" role="group" aria-label="Tactics and endgames view">
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={teView === "endgames"}
                onClick={() => setTeView("endgames")}
              >
                Endgame conversions
              </button>
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={teView === "tactics"}
                onClick={() => setTeView("tactics")}
              >
                WAC-300 &amp; BK-24 tactics
              </button>
            </div>
            {teView === "endgames" ? (
              <div className="chart-legend-row" style={{ margin: 0 }}>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-1)" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>Nabla-L2</strong>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-5)" }} />
                  <span>L2 (no conf)</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-2)" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>Nabla-L1</strong>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-muted)" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>Nabla-L0</strong>
                </span>
              </div>
            ) : (
              <div className="chart-legend-row" style={{ margin: 0 }}>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-1)" }} />
                  <span>WAC-300 (300 pos)</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch" style={{ backgroundColor: "var(--chart-3)" }} />
                  <span>BK-24 (24 pos)</span>
                </span>
              </div>
            )}
          </div>

          <div className="chart-box" style={{ height: 300 }}>
            <ChartContainer config={chartConfig}>
              {teView === "endgames" ? (
                <BarChart
                  data={tacticsEndgames.endgames}
                  margin={{ top: 12, right: 12, left: -8, bottom: 4 }}
                  barGap={4}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="kind" tickLine={false} axisLine={false} tickMargin={6} />
                  <YAxis
                    domain={[0, 105]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                    content={<EndgameTooltip />}
                  />
                  <Bar dataKey="l2Pct" fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="l2Err" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                  <Bar dataKey="l2NoConfPct" fill="var(--chart-5)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="l2NoConfErr" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                  <Bar dataKey="l1Pct" fill="var(--chart-2)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="l1Err" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                  <Bar dataKey="l0Pct" fill="var(--chart-muted)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="l0Err" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                </BarChart>
              ) : (
                <BarChart
                  data={tacticsEndgames.tactics}
                  margin={{ top: 12, right: 12, left: -4, bottom: 16 }}
                  barGap={4}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="engine"
                    interval={0}
                    height={58}
                    tickLine={false}
                    axisLine={false}
                    tick={renderAngledEngineTick}
                  />
                  <YAxis
                    domain={[0, 46]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                    content={<TacticsTooltip />}
                  />
                  <Bar dataKey="wacPct" fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="wacErr" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                  <Bar dataKey="bkPct" fill="var(--chart-3)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <ErrorBar dataKey="bkErr" direction="y" width={3} strokeWidth={1.2} stroke="var(--ink-2)" />
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </div>

          <figcaption className="chart-foot">
            Figure 5. Confinement lifts <strong>Nabla-L2</strong> vs Stockfish depth 8 from
            59.5% → <strong>95.0%</strong> (KQK), 7.5% → <strong>48.5%</strong> (KRK), and
            38.5% → <strong>74.5%</strong> (KPK), while 2-ply lookahead caps deep KRK
            triangulation (89 50-move draws) and deep Win at Chess (<code>WAC-300</code>) combinations (28.3%).
          </figcaption>
        </>
      )}

      {tab === "staticEval" && (
        <>
          <div className="chart-subcontrols">
            <div className="chart-seg" role="group" aria-label="Static evaluation view">
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={evalView === "scatter"}
                onClick={() => setEvalView("scatter")}
              >
                Scatter vs Stockfish d10
              </button>
              <button
                type="button"
                className="chart-seg-btn"
                aria-pressed={evalView === "terms"}
                onClick={() => setEvalView("terms")}
              >
                Per-term Spearman ρ
              </button>
            </div>
            {evalView === "scatter" && (
              <div className="chart-legend-row" style={{ margin: 0 }}>
                <span className="chart-legend-item">
                  <span className="chart-swatch dot" style={{ backgroundColor: "var(--chart-muted)" }} />
                  <span>Opening</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch dot" style={{ backgroundColor: "var(--chart-1)" }} />
                  <span>Middlegame</span>
                </span>
                <span className="chart-legend-item">
                  <span className="chart-swatch dot" style={{ backgroundColor: "var(--chart-3)" }} />
                  <span>Endgame</span>
                </span>
              </div>
            )}
          </div>

          <div className="chart-stats">
            {evalView === "scatter" ? (
              <>
                <div className="chart-stat">
                  <span>Probes</span>
                  <strong>n = {staticEval.summary.all.n.toLocaleString()}</strong>
                </div>
                <div className="chart-stat">
                  <span>Spearman ρ</span>
                  <strong>{staticEval.summary.all.spearmanRho.toFixed(3)}</strong>
                </div>
                <div className="chart-stat">
                  <span>Pearson r (±15)</span>
                  <strong>{staticEval.summary.all.pearsonRCap15.toFixed(3)}</strong>
                </div>
                <div className="chart-stat">
                  <span>Sign agreement</span>
                  <strong>{staticEval.summary.all.signAgreementPct.toFixed(1)}%</strong>
                </div>
                <div className="chart-stat">
                  <span>MAE</span>
                  <strong>{staticEval.summary.all.maePawns.toFixed(2)} p</strong>
                </div>
              </>
            ) : (
              <>
                <div className="chart-stat">
                  <span>Opening</span>
                  <strong>ρ = {staticEval.summary.opening.spearmanRho.toFixed(3)}</strong>
                </div>
                <div className="chart-stat">
                  <span>Middlegame</span>
                  <strong>ρ = {staticEval.summary.middlegame.spearmanRho.toFixed(3)}</strong>
                </div>
                <div className="chart-stat">
                  <span>Endgame</span>
                  <strong>ρ = {staticEval.summary.endgame.spearmanRho.toFixed(3)}</strong>
                </div>
              </>
            )}
          </div>

          <div className="chart-box" style={{ height: 310 }}>
            <ChartContainer config={chartConfig}>
              {evalView === "scatter" ? (
                <ScatterChart margin={{ top: 10, right: 18, left: -6, bottom: 8 }}>
                  <CartesianGrid />
                  <XAxis
                    type="number"
                    dataKey="sf"
                    domain={[-15, 15]}
                    ticks={[-15, -10, -5, 0, 5, 10, 15]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="l1"
                    domain={[-15, 15]}
                    ticks={[-15, -10, -5, 0, 5, 10, 15]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ZAxis range={[20, 20]} />
                  <ReferenceLine
                    segment={[
                      { x: -15, y: -15 },
                      { x: 15, y: 15 },
                    ]}
                    stroke="var(--ink-2)"
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                  <ChartTooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "var(--line-2)" }}
                    content={<EvalScatterTooltip />}
                  />
                  <Scatter
                    name="Opening"
                    data={staticEval.scatter.opening}
                    fill="var(--chart-muted)"
                    fillOpacity={0.62}
                    isAnimationActive={false}
                  />
                  <Scatter
                    name="Middlegame"
                    data={staticEval.scatter.middlegame}
                    fill="var(--chart-1)"
                    fillOpacity={0.78}
                    isAnimationActive={false}
                  />
                  <Scatter
                    name="Endgame"
                    data={staticEval.scatter.endgame}
                    fill="var(--chart-3)"
                    fillOpacity={0.82}
                    isAnimationActive={false}
                  />
                </ScatterChart>
              ) : (
                <BarChart
                  data={staticEval.terms}
                  layout="vertical"
                  margin={{ top: 6, right: 20, left: 6, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[-0.2, 1.0]}
                    ticks={[-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={126}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine x={0} stroke="var(--ink-2)" />
                  <ChartTooltip
                    cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                    content={<TermCorrTooltip />}
                  />
                  <Bar
                    dataKey="rho"
                    radius={[3, 3, 3, 3]}
                    barSize={16}
                    isAnimationActive={false}
                  >
                    {staticEval.terms.map((row) => (
                      <Cell
                        key={row.term}
                        fill={
                          row.rho >= 0.4
                            ? "var(--chart-1)"
                            : row.rho > 0
                              ? "var(--chart-2)"
                              : "var(--chart-5)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartContainer>
          </div>

          <figcaption className="chart-foot">
            Figure 6. Summary metrics cover all <strong>2,000</strong> quiet non-check
            positions (ply ≥ 12) vs Stockfish 19 depth 10; the scatter plots a{" "}
            {staticEval.scatterSampleCount}-position sample clipped to [−15, +15] pawns.
          </figcaption>
        </>
      )}
    </figure>
  );
}
