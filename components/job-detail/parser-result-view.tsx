"use client";

/**
 * Renders a parser result (lib/parsers/types.ts ParserResult): message banner,
 * output tiles and the convergence chart. Used on the job page and in the
 * admin parser test pane.
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Theme chart colours (app/globals.css); from the sixth series on, lines are dashed so they stay distinct.
const COLORS = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

type Series = { label?: string; data?: [number, number][] };

/** Graphs come as an array of series, a name → series map, or one series. */
function toSeries(graph: unknown): Series[] {
  if (!graph || typeof graph !== "object") return [];
  if (Array.isArray(graph)) return graph.filter((s) => Array.isArray(s?.data));
  if (Array.isArray((graph as Series).data)) return [graph as Series];
  return Object.values(graph as Record<string, Series>).filter((s) => Array.isArray(s?.data));
}

/** Merge series into rows keyed by x, so series with different x values line up. */
function toRows(series: Series[]) {
  const rows = new Map<number, Record<string, number>>();
  series.forEach((s, i) => {
    const name = s.label || `Series ${i + 1}`;
    for (const [x, y] of s.data ?? []) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const row = rows.get(x) ?? { x };
      row[name] = y;
      rows.set(x, row);
    }
  });
  return [...rows.values()].sort((a, b) => a.x - b.x);
}

const MESSAGE = {
  success: { icon: CheckCircle2, cls: "border-success/40 bg-success/10" },
  info: { icon: Info, cls: "border-info/40 bg-info/10" },
  warning: { icon: AlertTriangle, cls: "border-warning/60 bg-warning/15" },
  error: { icon: XCircle, cls: "border-destructive/50 bg-destructive/10" },
} as const;

export function hasChartData(result: any): boolean {
  return toSeries(result?.graph).some((s) => (s.data?.length ?? 0) > 1);
}

export function ParserResultView({ result, height = 300 }: { result: any; height?: number }) {
  const series = toSeries(result?.graph);
  const names = series.map((s, i) => s.label || `Series ${i + 1}`);
  const rows = toRows(series);
  const message = result?.custom?.message;
  const outputs = Object.values(result?.custom?.outputs ?? {}) as { label: string; value: string | number; type?: string }[];
  const markings = (result?.markings ?? []) as { label: string; data: [number, number, string][]; type?: string }[];

  return (
    <div className="space-y-4">
      {message?.text && (() => {
        const m = MESSAGE[message.type as keyof typeof MESSAGE] ?? MESSAGE.info;
        return (
          <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", m.cls)} role="status">
            <m.icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <span className="break-words">{message.text}</span>
          </div>
        );
      })()}

      {outputs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {outputs.map((o) => (
            <div key={o.label} className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">{o.label}</p>
              <p className="text-lg font-semibold tabular-nums">
                {typeof o.value === "number" ? o.value.toLocaleString(undefined, { maximumSignificantDigits: 6 }) : o.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={height} minWidth={320}>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 12 }} tickFormatter={(v: number) => String(+v.toPrecision(4))} />
              {/* Parsers already return log values for residuals, so the axis stays linear. */}
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} width={48} />
              <Tooltip />
              <Legend />
              {markings.flatMap((m) =>
                m.data.map(([from, , text], i) =>
                  m.type === "yaxis"
                    ? <ReferenceLine key={`${m.label}-${i}`} y={from} strokeDasharray="4 2" label={{ value: text, fontSize: 10 }} />
                    : <ReferenceLine key={`${m.label}-${i}`} x={from} strokeDasharray="4 2" label={{ value: text, fontSize: 10, position: "top" }} />,
                ),
              )}
              {names.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeDasharray={i >= COLORS.length ? "6 3" : undefined} dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !message?.text && outputs.length === 0 && (
          <p className="text-sm text-muted-foreground">No data matched yet.</p>
        )
      )}
    </div>
  );
}
