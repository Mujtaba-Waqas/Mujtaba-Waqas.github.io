import type { EstimateStatus } from "@prisma/client";
import { HOUR } from "../time";

/** Day 1, Day 3, Day 7 after the estimate is sent. */
export const ESTIMATE_FOLLOWUP_DELAYS_HOURS = [24, 72, 168];

export function buildFollowupSchedule(sentAt: Date, delaysHours: number[] = ESTIMATE_FOLLOWUP_DELAYS_HOURS) {
  return delaysHours.map((h, i) => ({ stage: i + 1, scheduledFor: new Date(sentAt.getTime() + h * HOUR) }));
}

export type StopReason =
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "OPTED_OUT"
  | "HUMAN_REQUESTED"
  | "PAUSED"
  | "AUTOMATION_DISABLED"
  | "NOT_SENT";

export interface StopRuleInput {
  estimateStatus: EstimateStatus;
  automationPaused: boolean;
  customerOptedOut: boolean;
  humanTakeover: boolean;
  automationEnabled: boolean;
  expiresAt?: Date | null;
  now: Date;
}

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  ACCEPTED: "Estimate accepted",
  DECLINED: "Estimate declined",
  EXPIRED: "Estimate expired",
  OPTED_OUT: "Customer opted out of SMS (STOP)",
  HUMAN_REQUESTED: "Customer asked for a person — handed to staff",
  PAUSED: "Automation paused manually",
  AUTOMATION_DISABLED: "Estimate Recovery automation is disabled",
  NOT_SENT: "Estimate has not been sent",
};

/**
 * Returns why follow-ups must stop, or null when it is safe to continue.
 * Order matters: compliance (opt-out) is checked before business state.
 */
export function getFollowupStopReason(input: StopRuleInput): StopReason | null {
  if (input.customerOptedOut) return "OPTED_OUT";
  if (input.estimateStatus === "ACCEPTED") return "ACCEPTED";
  if (input.estimateStatus === "DECLINED") return "DECLINED";
  if (input.estimateStatus === "EXPIRED" || (input.expiresAt && input.expiresAt.getTime() < input.now.getTime())) return "EXPIRED";
  if (input.estimateStatus === "DRAFT") return "NOT_SENT";
  if (input.humanTakeover) return "HUMAN_REQUESTED";
  if (input.automationPaused) return "PAUSED";
  if (!input.automationEnabled) return "AUTOMATION_DISABLED";
  return null;
}

/** `{{firstName}}`-style templates. Unknown variables render as empty strings. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(vars[key] ?? "")).replace(/\s{2,}/g, " ").trim();
}

export const DEFAULT_ESTIMATE_TEMPLATES = [
  "Hi {{firstName}}, this is {{business}}. Just checking in on estimate {{estimateNumber}} for {{service}} ({{amount}}). Happy to answer any questions — reply here or call {{phone}}.",
  "Hi {{firstName}}, following up on your {{service}} estimate from {{business}}. Financing is available if that helps. Reply YES to move forward or let us know if you'd like to talk it through.",
  "Hi {{firstName}}, last check-in from {{business}} on estimate {{estimateNumber}}. If the timing isn't right, no problem — just reply and we'll close it out. Reply STOP to opt out.",
];
