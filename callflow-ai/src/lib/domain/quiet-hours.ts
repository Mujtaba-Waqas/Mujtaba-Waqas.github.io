import { DEFAULT_TZ, minutesOfDay } from "../time";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * True when `date` falls inside the quiet window (which may wrap midnight,
 * e.g. 20:00–08:00). Scheduled marketing-style texts are held until it ends.
 */
export function isQuietHours(date: Date, start: string, end: string, tz = DEFAULT_TZ) {
  const now = minutesOfDay(date, tz);
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}
