import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";
import type { ModelLatencyRow } from "../../data/benchmarks";

const chartConfig = {
  nativeMs: {
    label: "Native median (ms)",
    color: "var(--chart-1)",
  },
  wasmMs: {
    label: "WebAssembly mean (ms)",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function ModelLatencyChart({ data }: { data: ModelLatencyRow[] }) {
  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <div className="chart-head-copy">
          <h3 className="chart-title">Benchmark decision latency across levels</h3>
          <p className="chart-sub">
            16-position suite, single-thread Intel i7-7700HQ (native 5-run medians vs browser WebAssembly means)
          </p>
        </div>
      </div>

      <div className="chart-stats">
        {data.map((row) => (
          <div key={row.level} className="chart-stat">
            <span>{row.level}</span>
            <strong>
              {row.nodes.toLocaleString()} n · {row.usPerNode.toFixed(1)} µs/n ·{" "}
              {row.slowdownX.toFixed(2)}× WASM
            </strong>
          </div>
        ))}
      </div>

      <div className="chart-box" style={{ height: 240 }}>
        <ChartContainer config={chartConfig}>
          <BarChart
            data={data}
            margin={{ top: 18, right: 14, left: -6, bottom: 2 }}
            barGap={6}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="level" tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v} ms`}
            />
            <ChartTooltip
              cursor={{ fill: "rgb(36 34 32 / 0.04)" }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={(value, name, item) => {
                    const row = (item as unknown as { payload?: ModelLatencyRow })
                      .payload;
                    const label =
                      chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                    return (
                      <>
                        <span className="shadcn-tooltip-key">
                          <span
                            className="shadcn-indicator dot"
                            style={
                              {
                                "--indicator-color": `var(--color-${name})`,
                              } as React.CSSProperties
                            }
                          />
                          <span>{label}</span>
                        </span>
                        <span className="shadcn-tooltip-value">
                          {Number(value).toFixed(2)} ms
                          {name === "nativeMs" && row
                            ? ` (IQR ${row.iqrMs})`
                            : ""}
                        </span>
                      </>
                    );
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="nativeMs"
              fill="var(--color-nativeMs)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="nativeMs"
                position="top"
                formatter={(v: number) => `${v.toFixed(2)}`}
              />
            </Bar>
            <Bar
              dataKey="wasmMs"
              fill="var(--color-wasmMs)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="wasmMs"
                position="top"
                formatter={(v: number) => `${v.toFixed(2)}`}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <figcaption className="chart-foot">
        All 48 native-vs-WebAssembly benchmark decisions are bit-identical. At Level 0 (&lt;0.4 ms), JavaScript-to-WebAssembly call overhead dominates the 4.89× ratio; at Levels 1–2, WebAssembly runs within 1.24×–1.42× of native.
      </figcaption>
    </figure>
  );
}
