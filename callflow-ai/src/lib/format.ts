import { DEFAULT_TZ, sameZonedDay, zonedDayOffset } from "./time";

export function formatCents(cents: number | null | undefined, opts: { compact?: boolean } = {}) {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.compact || Number.isInteger(value) || Math.abs(value) >= 1000 ? 0 : 2,
    notation: opts.compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(ratio: number, digits = 0) {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatPhone(raw: string | null | undefined) {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Normalize to E.164 (US only for the demo). Returns null when invalid. */
export function toE164(raw: string | null | undefined) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `+1${d}` : null;
}

export function formatDateTime(date: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDate(date: Date | string | null | undefined, tz = DEFAULT_TZ) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(
    new Date(date),
  );
}

export function formatTime(date: Date | string, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

export function formatWeekdayDate(date: Date | string, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(date),
  );
}

/** Human label for a time window relative to `now`: "Tonight 9:30 PM – 11:30 PM", "Tomorrow 10:00 AM – 11:30 AM". */
export function formatWindow(start: Date, end: Date, now: Date, tz = DEFAULT_TZ) {
  const range = `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
  if (sameZonedDay(start, now, tz)) {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(start));
    return `${hour >= 17 ? "Tonight" : "Today"}, ${range}`;
  }
  if (sameZonedDay(start, zonedDayOffset(now, 1, tz), tz)) return `Tomorrow, ${range}`;
  return `${formatWeekdayDate(start, tz)}, ${range}`;
}

export function formatDuration(seconds: number) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRelative(date: Date | string, now = new Date()) {
  const diff = (new Date(date).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function customerName(c: { firstName: string; lastName: string } | null | undefined) {
  if (!c) return "Unknown caller";
  return `${c.firstName} ${c.lastName}`.trim();
}
