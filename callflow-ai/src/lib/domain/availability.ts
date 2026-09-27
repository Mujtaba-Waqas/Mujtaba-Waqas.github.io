import { formatWindow } from "../format";
import { DEFAULT_TZ, MINUTE, atZonedTime, zonedDayOffset, zonedParts } from "../time";
import type { BusinessHours } from "../validation/settings";
import type { TimePreference } from "./intents";

export interface BusyBlock {
  id?: string;
  technicianId: string | null;
  startAt: Date;
  endAt: Date;
  /** Travel/cleanup buffer that must stay free after the appointment */
  bufferMinutes: number;
}

export interface TechnicianRef {
  id: string;
  name: string;
  isOnCall: boolean;
}

export interface SlotOption {
  startAt: string; // ISO — slots travel through JSON engine state
  endAt: string;
  technicianId: string;
  technicianName: string;
  label: string;
  isEmergency: boolean;
}

/**
 * Two appointments conflict when their [start, end + buffer) windows overlap.
 * The buffer of *both* appointments is honored so a tech always has travel time.
 */
export function blocksOverlap(a: BusyBlock, b: BusyBlock) {
  const aEnd = a.endAt.getTime() + a.bufferMinutes * MINUTE;
  const bEnd = b.endAt.getTime() + b.bufferMinutes * MINUTE;
  return a.startAt.getTime() < bEnd && b.startAt.getTime() < aEnd;
}

export function findConflict(candidate: BusyBlock, busy: BusyBlock[]) {
  if (!candidate.technicianId) return null;
  return busy.find((b) => !(candidate.id && b.id === candidate.id) && b.technicianId === candidate.technicianId && blocksOverlap(candidate, b)) ?? null;
}

export function isWithinBusinessHours(date: Date, hours: BusinessHours, tz = DEFAULT_TZ) {
  const p = zonedParts(date, tz);
  const row = hours.find((h) => h.day === p.weekday);
  if (!row) return false;
  const mins = p.hour * 60 + p.minute;
  const [oh, om] = row.open.split(":").map(Number);
  const [ch, cm] = row.close.split(":").map(Number);
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}

export interface SlotRequest {
  now: Date;
  tz?: string;
  businessHours: BusinessHours;
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minLeadTimeMinutes: number;
  horizonDays: number;
  technicians: TechnicianRef[];
  busy: BusyBlock[];
  preference?: TimePreference | null;
  count?: number;
  /** skip this many matching start times (used for "none of those work") */
  offset?: number;
}

function matchesPreference(start: Date, now: Date, pref: TimePreference | null | undefined, tz: string) {
  if (!pref || pref.asap) return true;
  const p = zonedParts(start, tz);
  if (pref.dayOffset !== undefined) {
    const target = zonedParts(zonedDayOffset(now, pref.dayOffset, tz), tz);
    if (p.year !== target.year || p.month !== target.month || p.day !== target.day) return false;
  }
  if (pref.weekday !== undefined && p.weekday !== pref.weekday) return false;
  if (pref.part === "morning" && p.hour >= 12) return false;
  if (pref.part === "afternoon" && (p.hour < 12 || p.hour >= 17)) return false;
  if (pref.part === "evening" && p.hour < 15) return false;
  return true;
}

/** Standard (business-hours) availability: first free technician per start time. */
export function generateSlots(req: SlotRequest): SlotOption[] {
  const tz = req.tz ?? DEFAULT_TZ;
  const count = req.count ?? 3;
  const earliest = req.now.getTime() + req.minLeadTimeMinutes * MINUTE;
  const results: SlotOption[] = [];
  let skipped = 0;
  const run = (pref: TimePreference | null | undefined) => {
    for (let d = 0; d <= req.horizonDays && results.length < count; d++) {
      const day = zonedDayOffset(req.now, d, tz);
      const weekday = zonedParts(day, tz).weekday;
      const hours = req.businessHours.find((h) => h.day === weekday);
      if (!hours) continue;
      const open = atZonedTime(day, hours.open, tz);
      const close = atZonedTime(day, hours.close, tz);
      for (let t = open.getTime(); t + req.durationMinutes * MINUTE <= close.getTime(); t += req.slotIntervalMinutes * MINUTE) {
        if (t < earliest) continue;
        const start = new Date(t);
        if (!matchesPreference(start, req.now, pref, tz)) continue;
        const end = new Date(t + req.durationMinutes * MINUTE);
        const tech = req.technicians.find(
          (tc) => !findConflict({ technicianId: tc.id, startAt: start, endAt: end, bufferMinutes: req.bufferMinutes }, req.busy),
        );
        if (!tech) continue;
        if (skipped < (req.offset ?? 0)) {
          skipped++;
          continue;
        }
        results.push({
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          technicianId: tech.id,
          technicianName: tech.name,
          label: formatWindow(start, end, req.now, tz),
          isEmergency: false,
        });
        if (results.length >= count) break;
      }
    }
  };
  run(req.preference);
  // Preference could not be satisfied (e.g. "Saturday"): fall back to the soonest openings.
  if (!results.length && req.preference) run(null);
  return results;
}

/**
 * Emergency dispatch windows: any hour of the day, starting ~45 minutes out,
 * on-call technician first. Honors existing bookings and buffers.
 */
export function generateEmergencySlots(req: Omit<SlotRequest, "businessHours" | "preference" | "slotIntervalMinutes" | "minLeadTimeMinutes" | "horizonDays"> & { travelMinutes?: number }): SlotOption[] {
  const tz = req.tz ?? DEFAULT_TZ;
  const count = req.count ?? 2;
  const step = 30 * MINUTE;
  const first = Math.ceil((req.now.getTime() + (req.travelMinutes ?? 45) * MINUTE) / step) * step;
  const techs = [...req.technicians].sort((a, b) => Number(b.isOnCall) - Number(a.isOnCall));
  const results: SlotOption[] = [];
  for (let t = first; t < first + 12 * 60 * MINUTE && results.length < count; t += step) {
    const start = new Date(t);
    const end = new Date(t + req.durationMinutes * MINUTE);
    const tech = techs.find((tc) => !findConflict({ technicianId: tc.id, startAt: start, endAt: end, bufferMinutes: req.bufferMinutes }, req.busy));
    if (!tech) continue;
    if (results.some((r) => Math.abs(new Date(r.startAt).getTime() - t) < 60 * MINUTE)) continue;
    results.push({
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      technicianId: tech.id,
      technicianName: tech.name,
      label: formatWindow(start, end, req.now, tz),
      isEmergency: true,
    });
  }
  return results;
}
