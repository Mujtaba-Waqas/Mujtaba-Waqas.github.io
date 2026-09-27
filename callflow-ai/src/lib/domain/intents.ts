export type ServiceKey = "ac_repair" | "ac_install" | "furnace_repair" | "furnace_install" | "maintenance" | "iaq" | "general";

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  ac_repair: "AC Repair",
  ac_install: "AC Installation",
  furnace_repair: "Furnace Repair",
  furnace_install: "Furnace Installation",
  maintenance: "Maintenance Plan Tune-Up",
  iaq: "Indoor Air Quality",
  general: "HVAC Diagnostic",
};

export function classifyService(text: string): ServiceKey | null {
  const t = text.toLowerCase();
  const install = /\b(install|installation|replace|replacement|new (?:system|unit|furnace|ac|air conditioner)|upgrade)\b/.test(t);
  const ac = /\b(ac|a\/c|air ?condition\w*|cooling|central air|heat pump|swamp cooler)\b/.test(t);
  const furnace = /\b(furnace|heat(?:er|ing)?|boiler|no heat|thermostat)\b/.test(t);
  if (/\b(tune[- ]?up|maintenance|annual service|check[- ]?up|inspection)\b/.test(t)) return "maintenance";
  if (/\b(air quality|air purifier|humidifier|dehumidifier|filter|allerg\w*|duct cleaning|uv light)\b/.test(t)) return "iaq";
  if (install && ac) return "ac_install";
  if (install && furnace) return "furnace_install";
  if (ac) return "ac_repair";
  if (furnace) return "furnace_repair";
  if (/\b(noise|leak|smell|broken|not working|stopped|repair|fix)\b/.test(t)) return "general";
  return null;
}

export function detectHumanRequest(text: string) {
  return /\b(speak|talk|connect me)\b.*\b(someone|somebody|person|human|representative|agent|manager|owner|dispatcher|staff|real)\b|\b(real person|live person|human being|operator|transfer me|representative)\b|\bcall me\b/i.test(
    text,
  );
}

export function detectPriceQuestion(text: string) {
  return /\b(how much|cost|price|pricing|charge|fee|rates?|expensive|quote)\b/i.test(text);
}

export function detectAffirmative(text: string) {
  return /^\s*(yes|yeah|yep|yup|sure|correct|right|ok(?:ay)?|sounds good|that works|perfect|please do|absolutely|definitely|y)\b/i.test(text) ||
    /\b(let'?s do it|go ahead|that'?s (?:fine|right|correct)|works for me|approve|accept)\b/i.test(text);
}

export function detectNegative(text: string) {
  return /^\s*(no|nope|nah|not really|n)\b/i.test(text) || /\b(not interested|no thanks|no thank you|decline|went with (?:someone|another)|pass on)\b/i.test(text);
}

export function detectFarewell(text: string) {
  return /\b(that'?s (?:all|it)|nothing else|no,? (?:that'?s|thank)|goodbye|bye|thanks?(?: you)?[.!]*$)\b/i.test(text);
}

export type SmsKeyword = "STOP" | "START" | "HELP";

/** Carrier-standard keywords. Must match the entire trimmed message (CTIA guidance). */
export function parseSmsKeyword(body: string): SmsKeyword | null {
  const t = body.trim().toUpperCase().replace(/[.!]+$/, "");
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE"].includes(t)) return "STOP";
  if (["START", "UNSTOP", "YES START", "SUBSCRIBE"].includes(t)) return "START";
  if (["HELP", "INFO"].includes(t)) return "HELP";
  return null;
}

export type Satisfaction = { sentiment: "positive" | "negative" | "unknown"; rating: number | null };

/** Interpret a reply to "How did we do? Reply 1–5". */
export function classifySatisfaction(text: string): Satisfaction {
  const num = text.match(/\b([1-5])\s*(?:\/\s*5|stars?|out of 5)?\b/);
  if (num) {
    const rating = Number(num[1]);
    return { sentiment: rating >= 4 ? "positive" : "negative", rating };
  }
  if (/\b(not|never|terrible|awful|bad|poor|unhappy|disappointed|rude|late|still broken|didn'?t fix|worst|upset|frustrated)\b/i.test(text))
    return { sentiment: "negative", rating: null };
  if (/\b(great|excellent|amazing|awesome|good|happy|satisfied|love|fantastic|perfect|wonderful|thanks|thank you)\b/i.test(text))
    return { sentiment: "positive", rating: null };
  return { sentiment: "unknown", rating: null };
}

/** Review requests must never offer an incentive (FTC 16 CFR Part 465, Google policy). */
export function containsReviewIncentive(template: string) {
  return /\b(discount|gift ?card|coupon|free (?:service|tune[- ]?up|filter)|reward|in exchange|raffle|entry to win|prize)\b|\$\d+\s*off\b|\d+%\s*off\b/i.test(template);
}

export function extractPhone(text: string) {
  const m = text.match(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
}

export function extractEmail(text: string) {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
}

const NAME_STOP = new Set(
  "calling having not sure looking wondering interested the a an urgent at home so really very just trying here out in still getting worried hot cold fine good ok okay yes no an emergency sorry glad happy hoping".split(" "),
);

export function extractName(text: string, expectingName: boolean): { first: string; last: string } | null {
  const explicit = text.match(/\b(?:[Mm]y name is|[Mm]y name's|[Nn]ame is|[Tt]his is|[Ii]t'?s|I'm|I am)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/);
  let full = explicit?.[1] ?? null;
  if (full && NAME_STOP.has(full.split(" ")[0].toLowerCase())) full = null;
  if (!full && expectingName) {
    const bare = text.trim().replace(/[.!,]+$/, "").replace(/^(?:it'?s|i'?m|this is|my name is)\s+/i, "");
    if (/^[a-zA-Z'-]+(?:\s+[a-zA-Z'-]+){0,2}$/.test(bare) && !NAME_STOP.has(bare.split(" ")[0].toLowerCase())) full = bare;
  }
  if (!full) return null;
  const parts = full.split(/\s+/).map((p) => p[0].toUpperCase() + p.slice(1));
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const STREET_SUFFIX = "Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Boulevard|Blvd|Court|Ct|Circle|Cir|Place|Pl|Parkway|Pkwy|Terrace|Ter|Trail|Trl|Loop|Highway|Hwy";

export function extractStreetAddress(text: string) {
  const grid = text.match(/\b(\d{1,6}\s+[NSEW]\.?\s+\d{1,5}\s+[NSEW]\.?)(?=\W|$)/i);
  if (grid) return grid[1].replace(/\s+/g, " ").trim();
  const named = text.match(new RegExp(`\\b(\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9.']+\\s+){0,4}?(?:${STREET_SUFFIX})\\b\\.?)`, "i"));
  return named ? named[1].replace(/\s+/g, " ").trim() : null;
}

export type TimePreference = { dayOffset?: number; weekday?: number; part?: "morning" | "afternoon" | "evening"; asap?: boolean; label: string };

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function extractTimePreference(text: string): TimePreference | null {
  const t = text.toLowerCase();
  const pref: TimePreference = { label: "" };
  const labels: string[] = [];
  if (/\b(asap|as soon as possible|soonest|earliest|first available|right away)\b/.test(t)) {
    pref.asap = true;
    labels.push("as soon as possible");
  }
  if (/\btomorrow\b/.test(t)) {
    pref.dayOffset = 1;
    labels.push("tomorrow");
  } else if (/\b(today|tonight|this afternoon|this morning)\b/.test(t)) {
    pref.dayOffset = 0;
    labels.push("today");
  }
  const wd = WEEKDAY_NAMES.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (wd >= 0) {
    pref.weekday = wd;
    labels.push(WEEKDAY_NAMES[wd][0].toUpperCase() + WEEKDAY_NAMES[wd].slice(1));
  }
  if (/\bmorning\b/.test(t)) pref.part = "morning";
  else if (/\bafternoon\b/.test(t)) pref.part = "afternoon";
  else if (/\b(evening|tonight|after work)\b/.test(t)) pref.part = "evening";
  if (pref.part) labels.push(pref.part);
  if (!labels.length) return null;
  pref.label = labels.join(" ");
  return pref;
}

/** Interpret "the first one", "2", "the 10 am" against offered slot options. */
export function parseSlotChoice(text: string, optionCount: number, optionHours: number[]): number | null {
  const t = text.toLowerCase();
  const ordinals: [RegExp, number][] = [
    [/\b(second|2nd|option 2|number 2|middle)\b|^\s*(2|two)\s*$/, 1],
    [/\b(third|3rd|option 3|number 3)\b|^\s*(3|three)\s*$/, 2],
    [/\b(first|1st|option 1|number 1|earliest|soonest)\b|^\s*(1|one)\s*$/, 0],
    [/\b(last|latest)\b/, optionCount - 1],
  ];
  for (const [re, idx] of ordinals) if (re.test(t) && idx < optionCount) return idx;
  const hm = t.match(/\b(\d{1,2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (hm) {
    let h = Number(hm[1]);
    const ampm = hm[2]?.[0];
    if (ampm === "p" && h < 12) h += 12;
    if (!ampm && h < 7) h += 12;
    const idx = optionHours.findIndex((oh) => oh === h);
    if (idx >= 0) return idx;
  }
  if (detectAffirmative(text)) return 0;
  return null;
}
