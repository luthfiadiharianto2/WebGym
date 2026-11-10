"use client";
// Grafik Recharts (di-lazy-load dari Dashboard agar bundle halaman awal tetap kecil).
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  name: string;
  color: string;
  yAxisId?: "left" | "right";
}

export default function TrendChart({
  data,
  series,
  height = 240,
  label,
  rightDomain,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
  height?: number;
  label: string;
  rightDomain?: [number, number];
}) {
  const hasRight = series.some((s) => s.yAxisId === "right");
  return (
    <figure aria-label={label} className="w-full">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickMargin={6} />
            <YAxis yAxisId="left" stroke="#71717a" fontSize={11} domain={[0, 100]} />
            {hasRight && <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={11} domain={rightDomain ?? ["auto", "auto"]} />}
            <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #3f3f46", borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Line key={s.key} yAxisId={s.yAxisId ?? "left"} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Alternatif teks untuk pembaca layar */}
      <figcaption className="sr-only">
        {label}:{" "}
        {data.map((d) => `${d.date}: ${series.map((s) => `${s.name} ${d[s.key] ?? "-"}`).join(", ")}`).join("; ")}
      </figcaption>
    </figure>
  );
}
