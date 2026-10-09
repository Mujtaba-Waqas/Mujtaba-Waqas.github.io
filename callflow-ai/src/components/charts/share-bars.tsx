/** Server-renderable: plain HTML bars (hover title shows exact values). */
/** Horizontal share bars — preferred over pies for part-to-whole with many categories. */
export function ShareBars({ data, format = (v: number) => String(v) }: { data: { label: string; value: number; sub?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="group" title={`${d.label}: ${format(d.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-ink-2">{d.label}</span>
            <span className="tabular text-ink">
              {format(d.value)} {d.sub ? <span className="text-muted">· {d.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-[var(--color-series-1)] transition-all group-hover:opacity-80" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

