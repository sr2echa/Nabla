import { useState } from "react";
import {
  CartesianGrid,
  LabelList,
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
import type { EloLadderRow } from "../../data/benchmarks";

const chartConfig = {
  nabla: { label: "Nabla (L0–L2)", color: "var(--chart-1)" },
  pesto: { label: "AB-PeSTO (0–2)", color: "var(--chart-2)" },
  maia: { label: "Maia (lc0 1n)", color: "var(--chart-3)" },
  sf: { label: "Stockfish 19", color: "var(--chart-4)" },
  floor: { label: "Material / Random", color: "var(--chart-muted)" },
} satisfies ChartConfig;

const LABELED_POINTS = new Set([
  "Nabla-L0",
  "Nabla-L1",
  "Nabla-L2",
  "AB-PeSTO-2",
  "Maia-1500",
  "Maia-1900",
  "SF-1500",
  "SF-1900",
]);

function renderPointLabel(metric: "nodes" | "time") {
  return (props: {
    x?: number | string;
    y?: number | string;
    value?: string | number;
  }) => {
    const x = Number(props.x);
    const y = Number(props.y);
    const name = String(props.value ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y) || !LABELED_POINTS.has(name)) {
      return null;
    }

    let dx = 8;
    let dy = -8;
    let anchor: "start" | "middle" | "end" = "start";

    if (name === "SF-1900" || name === "SF-1500") {
      dx = -8;
      dy = name === "SF-1900" ? 13 : -9;
      anchor = "end";
    } else if (name === "Nabla-L2") {
      dx = 0;
      dy = -11;
      anchor = "middle";
    } else if (name === "Nabla-L1") {
      dx = metric === "time" ? 6 : 8;
      dy = 14;
    } else if (name === "Maia-1500") {
      dx = metric === "time" ? -8 : 8;
      dy = -8;
      anchor = metric === "time" ? "end" : "start";
    } else if (name === "AB-PeSTO-2") {
      dx = -8;
      dy = 12;
      anchor = "end";
    }

    return (
      <text
        x={x + dx}
        y={y + dy}
        textAnchor={anchor}
        fontSize={10.5}
        fontFamily="var(--mono)"
        fill={name.startsWith("Nabla") ? "var(--chart-1)" : "var(--ink-2)"}
        fontWeight={name.startsWith("Nabla") ? 600 : 450}
      >
        {name}
      </text>
    );
  };
}

function ParetoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EloLadderRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const famLabel =
    chartConfig[row.family as keyof typeof chartConfig]?.label ?? row.family;
  const famColor =
    chartConfig[row.family as keyof typeof chartConfig]?.color ?? "var(--chart-1)";

  return (
    <div className="shadcn-tooltip">
      <div className="shadcn-tooltip-label">{row.player}</div>
      <div className="shadcn-tooltip-sub">{famLabel}</div>
      <div className="shadcn-tooltip-items">
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">
            <span
              className="shadcn-indicator dot"
              style={{ "--indicator-color": famColor } as React.CSSProperties}
            />
            <span>Ordo Elo</span>
          </span>
          <span className="shadcn-tooltip-value">
            {row.isAnchor
              ? `${row.rating.toFixed(1)} (anchor)`
              : `${row.rating.toFixed(1)} ± ${row.error95.toFixed(1)}`}
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Nodes / move</span>
          <span className="shadcn-tooltip-value">
            {row.meanNodes >= 10
              ? Math.round(row.meanNodes).toLocaleString()
              : row.meanNodes.toFixed(1)}
          </span>
        </div>
        <div className="shadcn-tooltip-item">
          <span className="shadcn-tooltip-key">Time / move</span>
          <span className="shadcn-tooltip-value">
            {row.meanMs.toFixed(2)} ms
          </span>
        </div>
      </div>
    </div>
  );
}

export function ComputeParetoChart({ data }: { data: EloLadderRow[] }) {
  const [metric, setMetric] = useState<"nodes" | "time">("nodes");

  const nabla = data
    .filter((d) => d.family === "nabla")
    .sort((a, b) => a.meanNodes - b.meanNodes);
  const pesto = data
    .filter((d) => d.family === "pesto")
    .sort((a, b) => a.meanNodes - b.meanNodes);
  const maia = data
    .filter((d) => d.family === "maia")
    .sort((a, b) => a.rating - b.rating);
  const sf = data
    .filter((d) => d.family === "sf")
    .sort((a, b) => a.rating - b.rating);
  const floor = data.filter((d) => d.family === "floor");

  const labelRenderer = renderPointLabel(metric);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-copy">
          <h3 className="chart-title">
            Figure 2. Strength vs compute &amp; wall-clock time
          </h3>
          <p className="chart-sub">
            Ordo Elo against log-scale mean nodes or latency per move (pooled benchmark games)
          </p>
        </div>
        <div className="chart-tabs" role="group" aria-label="Pareto x-axis metric">
          <button
            type="button"
            className="chart-tab"
            aria-pressed={metric === "nodes"}
            onClick={() => setMetric("nodes")}
          >
            Nodes / move
          </button>
          <button
            type="button"
            className="chart-tab"
            aria-pressed={metric === "time"}
            onClick={() => setMetric("time")}
          >
            Time / move (ms)
          </button>
        </div>
      </div>

      <div className="chart-legend-row">
        {(Object.keys(chartConfig) as Array<keyof typeof chartConfig>).map(
          (fam) => (
            <span key={fam} className="chart-legend-item">
              <span
                className="chart-swatch dot"
                style={{ backgroundColor: chartConfig[fam].color }}
              />
              <span>{chartConfig[fam].label}</span>
            </span>
          ),
        )}
      </div>

      <div className="chart-box" style={{ height: 330 }}>
        <ChartContainer config={chartConfig}>
          <ScatterChart margin={{ top: 18, right: 20, left: -2, bottom: 8 }}>
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey={metric === "nodes" ? "meanNodes" : "plotMs"}
              scale="log"
              domain={metric === "nodes" ? [0.8, 220000] : [0.004, 600]}
              ticks={
                metric === "nodes"
                  ? [1, 10, 100, 1000, 10000, 100000]
                  : [0.01, 0.1, 1, 10, 100, 500]
              }
              tickFormatter={(v: number) => {
                if (metric === "nodes") {
                  if (v >= 1000) return `${Math.round(v / 1000)}k`;
                  return String(v);
                }
                return `${v}`;
              }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="number"
              dataKey="rating"
              domain={[-300, 2000]}
              ticks={[-200, 200, 600, 1000, 1400, 1800]}
              tickLine={false}
              axisLine={false}
            />
            <ZAxis range={[64, 64]} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--line-2)" }}
              content={<ParetoTooltip />}
            />
            <Scatter
              name="Floor"
              data={floor}
              fill="var(--color-floor)"
              isAnimationActive={false}
            />
            <Scatter
              name="AB-PeSTO"
              data={pesto}
              fill="var(--color-pesto)"
              line={{ strokeDasharray: "4 4", strokeWidth: 1.5 }}
              isAnimationActive={false}
            >
              <LabelList dataKey="player" content={labelRenderer} />
            </Scatter>
            <Scatter
              name="Maia"
              data={maia}
              fill="var(--color-maia)"
              isAnimationActive={false}
            >
              <LabelList dataKey="player" content={labelRenderer} />
            </Scatter>
            <Scatter
              name="Stockfish 19"
              data={sf}
              fill="var(--color-sf)"
              isAnimationActive={false}
            >
              <LabelList dataKey="player" content={labelRenderer} />
            </Scatter>
            <Scatter
              name="Nabla"
              data={nabla}
              fill="var(--color-nabla)"
              line={{ strokeWidth: 2 }}
              isAnimationActive={false}
            >
              <LabelList dataKey="player" content={labelRenderer} />
            </Scatter>
          </ScatterChart>
        </ChartContainer>
      </div>

      <p className="chart-foot">
        <strong>Nabla-L2</strong> scores 58–40–2 against <code>SF-1500</code>{" "}
        using <strong>53× fewer nodes</strong> (1,702 vs 89,570) and{" "}
        <strong>20× less time</strong> (16.1 ms vs 325.0 ms). Conversely,{" "}
        <code>AB-PeSTO-2</code> computes incremental PSTs in{" "}
        <code>0.44 ms/mv</code> (36× lower latency than Nabla-L2 at 1-ply–2-ply depths;{" "}
        <code>AB-PeSTO-0</code>’s <code>0.00 ms</code> is plotted at <code>0.005 ms</code> on log scale).
      </p>
    </div>
  );
}
