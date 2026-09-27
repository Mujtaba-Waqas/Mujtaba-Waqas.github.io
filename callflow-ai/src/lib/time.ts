/**
 * Minimal timezone helpers built on Intl so scheduling logic works in the
 * organization's timezone (America/Denver for the demo) regardless of the
 * server's local timezone.
 */
export const DEFAULT_TZ = "America/Denver";
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz = DEFAULT_TZ): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

function tzOffsetMs(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / MINUTE) * MINUTE;
  return asUtc - truncated;
}

/** Convert a wall-clock time in `tz` to a UTC Date. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = DEFAULT_TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - tzOffsetMs(new Date(guess), tz);
  const second = guess - tzOffsetMs(new Date(result), tz);
  if (second !== result) result = second;
  return new Date(result);
}

export function startOfZonedDay(date: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
}

/** Add calendar days in the zone (DST-safe) and return midnight of that day. */
export function zonedDayOffset(date: Date, days: number, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 0, 0, tz);
}

export function atZonedTime(day: Date, hhmm: string, tz = DEFAULT_TZ) {
  const p = zonedParts(day, tz);
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(p.year, p.month, p.day, h, m, tz);
}

export function minutesOfDay(date: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

export function sameZonedDay(a: Date, b: Date, tz = DEFAULT_TZ) {
  const pa = zonedParts(a, tz);
  const pb = zonedParts(b, tz);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function zonedDateKey(date: Date, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Instant `days` days before now (used for query windows). */
export function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * DAY);
}
