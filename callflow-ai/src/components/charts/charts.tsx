"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SERIES = ["var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)", "var(--color-series-4)"];
const AXIS = { fontSize: 11, fill: "#64748b" };
const money = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);
const fullMoney = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const shortDate = (d: string) => {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
};

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label && /^\d{4}-/.test(label) ? shortDate(label) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium tabular text-ink">{format(Number(p.value))}</span>
        </p>
      ))}
      {payload.length > 1 ? <p className="mt-1 border-t border-line pt-1 text-right font-semibold tabular text-ink">{format(total)}</p> : null}
    </div>
  );
}

export function StackedBars({ data, series, height = 260, currency = true }: { data: Record<string, number | string>[]; series: { key: string; label: string }[]; height?: number; currency?: boolean }) {
  const fmt = currency ? fullMoney : (v: number) => String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="#eef2f6" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#e3e8ef" }} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tickFormatter={currency ? money : undefined} tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(15,23,42,0.04)" }} content={<TooltipBox format={fmt} />} />
        {series.length > 1 ? <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#3d4f68" }} /> : null}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={SERIES[i]} stroke="#fff" strokeWidth={1} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBars({ data, series, xKey, height = 240 }: { data: Record<string, number | string>[]; series: { key: string; label: string }[]; xKey: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="#eef2f6" />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: "#e3e8ef" }} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(15,23,42,0.04)" }} content={<TooltipBox format={(v) => String(v)} />} />
        {series.length > 1 ? <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#3d4f68" }} /> : null}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={26} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLines({ data, series, height = 240, currency = false }: { data: Record<string, number | string>[]; series: { key: string; label: string }[]; height?: number; currency?: boolean }) {
  const fmt = currency ? fullMoney : (v: number) => String(Math.round(v * 10) / 10);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f6" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#e3e8ef" }} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={currency ? money : undefined} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} content={<TooltipBox format={fmt} />} />
        {series.length > 1 ? <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#3d4f68" }} /> : null}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SingleArea({ data, dataKey, label, height = 200, currency = false }: { data: Record<string, number | string>[]; dataKey: string; label: string; height?: number; currency?: boolean }) {
  const fmt = currency ? fullMoney : (v: number) => String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eef2f6" />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={{ stroke: "#e3e8ef" }} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={currency ? money : undefined} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} content={<TooltipBox format={fmt} />} />
        <Area type="monotone" dataKey={dataKey} name={label} stroke="var(--color-series-1)" strokeWidth={2} fill={`url(#fill-${dataKey})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 180 }: { data: { name: string; value: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipBox format={(v) => String(v)} />} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
