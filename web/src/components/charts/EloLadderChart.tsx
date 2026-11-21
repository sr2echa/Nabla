import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "../ui/chart";
import type { EloLadderRow, EngineFamily } from "../../data/benchmarks";

const FAMILY_META: Record<
  EngineFamily,
  { label: string; colorVar: string }
> = {
  nabla: { label: "Nabla (L0–L2)", colorVar: "var(--color-nabla)" },
  sf: { label: "Stockfish 19 anchor", colorVar: "var(--color-sf)" },
  maia: { label: "Maia (lc0 1-node)", colorVar: "var(--color-maia)" },
  pesto: { label: "AB-PeSTO", colorVar: "var(--color-pesto)" },
  floor: { label: "Floor baselines", colorVar: "var(--color-floor)" },
};

const chartConfig = {
  nabla: { label: "Nabla (L0–L2)", color: "var(--chart-1)" },
  sf: { label: "Stockfish 19 anchor", color: "var(--chart-4)" },
  maia: { label: "Maia (lc0 1-node)", color: "var(--chart-3)" },
  pesto: { label: "AB-PeSTO", color: "var(--chart-2)" },
  floor: { label: "Floor baselines", color: "var(--chart-muted)" },
} satisfies ChartConfig;

function renderPlayerTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const label = String(props.payload?.value ?? "");
  const isNabla = label.startsWith("Nabla");
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontFamily="var(--mono)"
      fontSize={11}
      fontWeight={isNabla ? 700 : 400}
      fill={isNabla ? "var(--ink)" : "var(--ink-3)"}
    >
      {label}
    </text>
  );
}

function EloTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EloLadderRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fam = FAMILY_META[row.family];

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{row.player}</div>
      <div className="shadcn-tooltip-sub">{fam.label}</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": fam.colorVar } as React.CSSProperties}
            />
            <span>Ordo Elo</span>
          </span>
          <span className="shadcn-tooltip-value">
            {row.isAnchor
              ? `${row.rating.toFixed(1)} (pinned)`
              : `${row.rating.toFixed(1)} ± ${row.error95.toFixed(1)}`}
          </span>
        </div>
        {!row.isAnchor && (
          <div className="shadcn-tooltip-item">
            <span className="shadcn-tooltip-key">95% CI</span>
            <span className="shadcn-tooltip-value">
              [{row.ci95Low.toFixed(1)}, {row.ci95High.toFixed(1)}]
            </span>
          </div>
        )}
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Pool record</span>
          <span className="shadcn-tooltip-value">
            {row.games.toLocaleString()} g · {row.scorePct.toFixed(1)}%
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Compute / move</span>
          <span className="shadcn-tooltip-value">
            {Math.round(row.meanNodes).toLocaleString()} n ·{" "}
            {row.meanMs === 0 ? "< 0.01 ms" : `${row.meanMs.toFixed(2)} ms`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function EloLadderChart({ data }: { data: EloLadderRow[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <div className="chart-head-copy">
          <h3 className="chart-title">Figure 1. Anchored Ordo Elo ladder</h3>
          <p className="chart-sub">
            4,780 pool games from an 8-move opening book at 10+0.1 s, pinned to Stockfish 19 (95% CIs)
          </p>
        </div>
        <div className="chart-seg" role="group" aria-label="View Elo ladder as chart or table">
          <button
            type="button"
            className="chart-seg-btn"
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className="chart-seg-btn"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            Data table
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <>
          <div className="chart-legend-row">
            {(Object.keys(FAMILY_META) as EngineFamily[]).map((fam) => (
              <span key={fam} className="chart-legend-item">
                <span
                  className="chart-swatch"
                  style={{
                    backgroundColor:
                      chartConfig[fam as keyof typeof chartConfig].color,
                  }}
                />
                {fam === "nabla" ? (
                  <strong style={{ color: "var(--ink)", fontWeight: 700 }}>
                    {FAMILY_META[fam].label}
                  </strong>
                ) : (
                  <span>{FAMILY_META[fam].label}</span>
                )}
              </span>
            ))}
          </div>

          <div className="chart-box" style={{ height: 430 }}>
            <ChartContainer config={chartConfig}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 6, right: 20, left: 6, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  domain={[-440, 2000]}
                  ticks={[-400, 0, 400, 800, 1200, 1600, 2000]}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="player"
                  width={98}
                  tickLine={false}
                  axisLine={false}
                  tick={renderPlayerTick}
                />
                <ReferenceLine x={0} stroke="var(--line-2)" />
                <ChartTooltip
                  cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
                  content={<EloTooltip />}
                />
                <Bar
                  dataKey="rating"
                  radius={[3, 3, 3, 3]}
                  barSize={16}
                  isAnimationActive={false}
                >
                  {data.map((row) => (
                    <Cell
                      key={row.player}
                      fill={FAMILY_META[row.family].colorVar}
                      fillOpacity={row.family === "sf" ? 0.72 : 0.92}
                    />
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
        </>
      ) : (
        <div className="table-wrap" style={{ maxWidth: "100%", margin: "6px 0" }}>
          <table className="results wide">
            <thead>
              <tr>
                <th>Engine</th>
                <th className="num">Ordo Elo (±95% CI)</th>
                <th className="num">Games</th>
                <th className="num">Score</th>
                <th className="num">Nodes/mv</th>
                <th className="num">Time/mv</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.player}
                  className={row.family === "nabla" ? "hl" : undefined}
                >
                  <td>{row.player}</td>
                  <td className="num">
                    {row.isAnchor
                      ? `${row.rating.toFixed(1)} (pinned)`
                      : `${row.rating.toFixed(1)} ± ${row.error95.toFixed(1)}`}
                  </td>
                  <td className="num">{row.games.toLocaleString()}</td>
                  <td className="num">{row.scorePct.toFixed(1)}%</td>
                  <td className="num">
                    {Math.round(row.meanNodes).toLocaleString()}
                  </td>
                  <td className="num">{row.meanMs.toFixed(2)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <figcaption className="chart-foot">
        Untuned <strong>Nabla-L2</strong> rates <strong>1607.0 ± 24.2 Elo</strong>{" "}
        (+59.4 Elo above depth-matched <code>AB-PeSTO-2</code> and +107 Elo above{" "}
        <code>SF-1500</code>); <strong>Nabla-L0</strong> reaches{" "}
        <strong>963.9 ± 43.4 Elo</strong> (+844 Elo over 1-ply <code>AB-PeSTO-0</code>).
      </figcaption>
    </figure>
  );
}
