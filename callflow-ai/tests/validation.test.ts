import { describe, expect, it } from "vitest";
import { classifySatisfaction, containsReviewIncentive, parseSmsKeyword } from "@/lib/domain/intents";
import { answerFromKnowledge, applyGuardrails } from "@/lib/domain/knowledge";
import { computeTwilioSignature, verifyTwilioSignature } from "@/lib/providers/twilio";
import { verifyStripeSignature } from "@/lib/providers/stripe";
import { createHmac } from "node:crypto";
import { createLeadSchema, estimateSchema, publicLeadSchema, simulatorTurnSchema } from "@/lib/validation/schemas";
import { orgSettingsSchema, DEFAULT_SETTINGS } from "@/lib/validation/settings";

describe("API input validation", () => {
  const lead = { firstName: "Ann", lastName: "Lee", phone: "(801) 555-0100", source: "WEB_FORM", urgency: "NORMAL", requestedService: "AC Repair" };
  it("accepts a valid lead and normalizes blanks to null", () => {
    const r = createLeadSchema.parse({ ...lead, email: "", zip: "" });
    expect(r.email).toBeNull();
    expect(r.zip).toBeNull();
  });
  it("rejects bad phone numbers, ZIPs, emails and enum values", () => {
    expect(createLeadSchema.safeParse({ ...lead, phone: "555-12" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...lead, zip: "8412" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...lead, email: "nope" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...lead, source: "HACKER" }).success).toBe(false);
  });
  it("requires SMS consent on the public lead form and rejects honeypot submissions", () => {
    const base = { organization: "summit-peak-hvac", name: "Ann Lee", phone: "8015550100", smsConsent: true };
    expect(publicLeadSchema.safeParse(base).success).toBe(true);
    expect(publicLeadSchema.safeParse({ ...base, smsConsent: false }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
  });
  it("requires at least one estimate line item and bounds prices", () => {
    const e = { customerId: "c1", title: "New AC", items: [] };
    expect(estimateSchema.safeParse(e).success).toBe(false);
    expect(estimateSchema.safeParse({ ...e, items: [{ description: "x", quantity: 1, unitPrice: -5 }] }).success).toBe(false);
    expect(estimateSchema.safeParse({ ...e, items: [{ description: "x", quantity: "2", unitPrice: "10.50" }] }).success).toBe(true);
  });
  it("caps simulator utterance length", () => {
    expect(simulatorTurnSchema.safeParse({ callId: "c", text: "x".repeat(501) }).success).toBe(false);
  });
  it("validates org settings", () => {
    expect(orgSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(orgSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, businessHours: [{ day: 1, open: "18:00", close: "08:00" }] }).success).toBe(false);
  });
});

describe("SMS compliance keywords", () => {
  it.each(["STOP", "stop", "Unsubscribe", "CANCEL", "end", "QUIT", "stop."])("treats %s as an opt-out", (w) => expect(parseSmsKeyword(w)).toBe("STOP"));
  it("only matches the whole message", () => {
    expect(parseSmsKeyword("please don't stop coming")).toBeNull();
    expect(parseSmsKeyword("START")).toBe("START");
    expect(parseSmsKeyword("help")).toBe("HELP");
  });
  it("classifies satisfaction replies", () => {
    expect(classifySatisfaction("5")).toEqual({ sentiment: "positive", rating: 5 });
    expect(classifySatisfaction("2 - still broken").sentiment).toBe("negative");
    expect(classifySatisfaction("Great job, thanks!").sentiment).toBe("positive");
  });
  it("rejects incentivized review requests", () => {
    expect(containsReviewIncentive("Leave a review and get $20 off your next visit")).toBe(true);
    expect(containsReviewIncentive("Would you share your experience on Google?")).toBe(false);
  });
});

describe("AI guardrails", () => {
  it("never invents a price that is not in the knowledge base", () => {
    const a = answerFromKnowledge("How much is a new furnace?", [{ id: "1", category: "FAQ", title: "Brands", content: "We service all brands.", tags: [] }]);
    expect(a.grounded).toBe(false);
    expect(a.answer).not.toMatch(/\$\d/);
  });
  it("strips sentences containing prohibited claims", () => {
    const r = applyGuardrails("We guarantee same-day service. A technician will call you.", ["guarantee"]);
    expect(r.text).toBe("A technician will call you.");
    expect(r.violations).toEqual(["guarantee"]);
  });
});

describe("webhook signature verification", () => {
  it("verifies Twilio signatures and rejects tampering", () => {
    const params = { From: "+18015550100", Body: "STOP" };
    const sig = computeTwilioSignature("secret", "https://example.com/api/webhooks/twilio/sms", params);
    expect(verifyTwilioSignature("secret", "https://example.com/api/webhooks/twilio/sms", params, sig)).toBe(true);
    expect(verifyTwilioSignature("secret", "https://example.com/api/webhooks/twilio/sms", { ...params, Body: "START" }, sig)).toBe(false);
    expect(verifyTwilioSignature("secret", "https://example.com/api/webhooks/twilio/sms", params, null)).toBe(false);
  });
  it("verifies Stripe signatures with timestamp tolerance", () => {
    const payload = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const v1 = createHmac("sha256", "whsec").update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, "whsec", 300, t + 10)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, "whsec", 300, t + 1000)).toBe(false);
    expect(verifyStripeSignature(payload + " ", `t=${t},v1=${v1}`, "whsec", 300, t)).toBe(false);
  });
});
