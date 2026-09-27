import type { AppointmentStatus, CallOutcome, CallStatus, EstimateStatus, LeadSource, LeadStatus, MessageStatus, ReviewStatus, Urgency } from "@prisma/client";
import type { BadgeTone } from "@/components/ui/badge";

type Meta = { label: string; tone: BadgeTone };

export const LEAD_STATUS: Record<LeadStatus, Meta> = {
  NEW: { label: "New", tone: "blue" },
  CONTACTED: { label: "Contacted", tone: "violet" },
  QUALIFIED: { label: "Qualified", tone: "teal" },
  BOOKED: { label: "Booked", tone: "green" },
  ESTIMATE_SENT: { label: "Estimate Sent", tone: "amber" },
  WON: { label: "Won", tone: "navy" },
  LOST: { label: "Lost", tone: "neutral" },
};

export const LEAD_SOURCE: Record<LeadSource, string> = {
  PHONE: "Phone (AI)",
  AFTER_HOURS_CALL: "After-hours call",
  MISSED_CALL: "Missed call",
  WEB_FORM: "Web form",
  SMS: "SMS",
  REFERRAL: "Referral",
  GOOGLE_LSA: "Google LSA",
  REPEAT_CUSTOMER: "Repeat customer",
};

export const URGENCY: Record<Urgency, Meta> = {
  EMERGENCY: { label: "Emergency", tone: "red" },
  HIGH: { label: "High", tone: "amber" },
  NORMAL: { label: "Normal", tone: "neutral" },
  LOW: { label: "Low", tone: "neutral" },
};

export const CALL_STATUS: Record<CallStatus, Meta> = {
  IN_PROGRESS: { label: "In progress", tone: "blue" },
  COMPLETED: { label: "Completed", tone: "green" },
  TRANSFERRED: { label: "Transferred", tone: "violet" },
  MISSED: { label: "Missed", tone: "red" },
  VOICEMAIL: { label: "Voicemail", tone: "amber" },
  ABANDONED: { label: "Abandoned", tone: "neutral" },
};

export const CALL_OUTCOME: Record<CallOutcome, Meta> = {
  BOOKED: { label: "Booked", tone: "green" },
  LEAD_CAPTURED: { label: "Lead captured", tone: "blue" },
  TRANSFERRED: { label: "Transferred", tone: "violet" },
  OUT_OF_AREA: { label: "Out of area", tone: "neutral" },
  INFO_PROVIDED: { label: "Info provided", tone: "teal" },
  MISSED_RECOVERED: { label: "Recovered by text", tone: "teal" },
  NO_ACTION: { label: "No action", tone: "neutral" },
};

export const APPT_STATUS: Record<AppointmentStatus, Meta> = {
  SCHEDULED: { label: "Scheduled", tone: "blue" },
  CONFIRMED: { label: "Confirmed", tone: "teal" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "red" },
};

export const ESTIMATE_STATUS: Record<EstimateStatus, Meta> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "blue" },
  VIEWED: { label: "Viewed", tone: "violet" },
  ACCEPTED: { label: "Accepted", tone: "green" },
  DECLINED: { label: "Declined", tone: "red" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const REVIEW_STATUS: Record<ReviewStatus, Meta> = {
  SATISFACTION_SENT: { label: "Awaiting reply", tone: "blue" },
  POSITIVE: { label: "Positive", tone: "green" },
  REVIEW_REQUESTED: { label: "Review link sent", tone: "teal" },
  NEGATIVE_FLAGGED: { label: "Needs owner follow-up", tone: "red" },
  RESOLVED: { label: "Resolved", tone: "green" },
  NO_RESPONSE: { label: "No response", tone: "neutral" },
};

export const MESSAGE_STATUS: Record<MessageStatus, Meta> = {
  QUEUED: { label: "Queued", tone: "neutral" },
  SENT: { label: "Sent", tone: "blue" },
  DELIVERED: { label: "Delivered", tone: "green" },
  FAILED: { label: "Failed", tone: "red" },
  RECEIVED: { label: "Received", tone: "neutral" },
  SIMULATED: { label: "Simulated", tone: "amber" },
  BLOCKED: { label: "Blocked — opted out", tone: "red" },
};
