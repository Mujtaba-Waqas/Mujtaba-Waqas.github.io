export interface ServiceAreaEntry {
  zip: string;
  city: string;
  county: string;
}

export interface ServiceAreaResult {
  inArea: boolean;
  /** true when we could not determine a location yet */
  unknown: boolean;
  county?: string;
  city?: string;
  matchedBy?: "zip" | "city";
  reason: string;
}

export function normalizeZip(value: string | null | undefined) {
  const m = value?.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

/** Extract a 5-digit ZIP from free text, ignoring Utah grid-style street numbers ("4185 S ..."). */
export function extractZip(text: string) {
  const matches = [...text.matchAll(/\b(\d{5})(?:-\d{4})?\b(?!\s*[NSEW]\b\.?)/gi)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

function normCity(city: string) {
  return city.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

export function findCityInText(text: string, areas: ServiceAreaEntry[], extraCities: string[] = []) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, " ")} `;
  const candidates = [...new Set([...areas.map((a) => a.city), ...extraCities])].sort((a, b) => b.length - a.length);
  return candidates.find((c) => lower.includes(` ${normCity(c)} `)) ?? null;
}

/**
 * Service-area check. ZIP is authoritative when present (cities can span counties);
 * otherwise we fall back to an exact city match.
 */
export function checkServiceArea(
  input: { zip?: string | null; city?: string | null },
  areas: ServiceAreaEntry[],
): ServiceAreaResult {
  const zip = normalizeZip(input.zip ?? null);
  if (zip) {
    const hit = areas.find((a) => a.zip === zip);
    if (hit) return { inArea: true, unknown: false, county: hit.county, city: hit.city, matchedBy: "zip", reason: `ZIP ${zip} is in ${hit.county} County` };
    return { inArea: false, unknown: false, reason: `ZIP ${zip} is outside the configured service territory` };
  }
  if (input.city) {
    const hit = areas.find((a) => normCity(a.city) === normCity(input.city!));
    if (hit) return { inArea: true, unknown: false, county: hit.county, city: hit.city, matchedBy: "city", reason: `${hit.city} is in ${hit.county} County` };
    return { inArea: false, unknown: false, reason: `${input.city} is outside the configured service territory` };
  }
  return { inArea: false, unknown: true, reason: "No ZIP or city provided yet" };
}

/** Cities we recognize so we can say "outside the area" instead of asking again. */
export const KNOWN_OUT_OF_AREA_CITIES = ["Ogden", "Park City", "Logan", "Tooele", "Heber City", "Roy", "Brigham City", "St. George", "Evanston"];
