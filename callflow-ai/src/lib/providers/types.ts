/**
 * Provider interfaces. Every external dependency sits behind one of these so
 * the app runs fully in demo mode and real vendors can be swapped in per env.
 * Implementations are server-only; secrets are read from process.env.
 */
import type { KnowledgeDoc } from "../domain/knowledge";

export type ProviderMode = "demo" | "live";

export interface SendSmsInput {
  to: string; // E.164
  from: string; // E.164
  body: string;
}
export interface SendSmsResult {
  providerSid: string;
  status: "SENT" | "QUEUED" | "SIMULATED" | "FAILED";
  simulated: boolean;
  error?: string;
}
export interface SmsProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  send(input: SendSmsInput): Promise<SendSmsResult>;
}

export interface VoiceProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  /** Build the response document for an inbound call webhook (TwiML for Twilio). */
  answerInboundCall(input: { greeting: string; gatherActionUrl: string; recordingEnabled: boolean }): string;
  /** Respond to a speech turn: say `reply`, then gather again or hang up / transfer. */
  respondToTurn(input: { reply: string; gatherActionUrl: string; transferTo?: string | null; hangUp?: boolean }): string;
  verifyWebhookSignature(input: { url: string; params: Record<string, string>; signature: string | null }): boolean;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  startAt: Date;
  endAt: Date;
  description?: string;
  location?: string;
  calendarId?: string;
}
export interface CalendarProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  /** Busy windows from the external calendar, merged with internal bookings. */
  listBusy(input: { calendarIds: string[]; from: Date; to: Date }): Promise<{ calendarId: string; startAt: Date; endAt: Date }[]>;
  createEvent(event: CalendarEvent): Promise<{ externalId: string }>;
  cancelEvent(input: { externalId: string; calendarId?: string }): Promise<void>;
}

export interface CheckoutInput {
  organizationId: string;
  plan: "STARTER" | "GROWTH" | "PRO";
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}
export interface PaymentProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string; simulated: boolean }>;
  createPortalSession(input: { stripeCustomerId: string | null; returnUrl: string }): Promise<{ url: string; simulated: boolean }>;
  verifyWebhook(payload: string, signature: string | null): { ok: boolean; event?: { id: string; type: string; data: { object: Record<string, unknown> } } };
}

export interface CallSummary {
  headline: string;
  intent: string;
  serviceRequested: string | null;
  urgency: string;
  outcome: string;
  customer: { name: string | null; phone: string | null; address: string | null };
  keyDetails: string[];
  nextSteps: string[];
  generatedBy: "rules" | "openai";
}

export interface SummarizeCallInput {
  transcript: { speaker: string; text: string }[];
  facts: {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    service?: string | null;
    urgency: string;
    urgencyReasons: string[];
    outcome?: string | null;
    appointmentLabel?: string | null;
    transferredTo?: string | null;
    inServiceArea?: boolean | null;
  };
}

export interface SuggestReplyInput {
  businessName: string;
  customerFirstName: string;
  messages: { direction: "INBOUND" | "OUTBOUND"; body: string }[];
  knowledge: KnowledgeDoc[];
  prohibitedClaims: string[];
  context: { openEstimate?: { number: string; service: string; amount: string } | null; nextAppointment?: string | null };
}

export interface AIProvider {
  readonly name: string;
  readonly mode: ProviderMode;
  summarizeCall(input: SummarizeCallInput): Promise<CallSummary>;
  suggestSmsReply(input: SuggestReplyInput): Promise<{ reply: string; sources: string[] }>;
  answerQuestion(input: { question: string; knowledge: KnowledgeDoc[]; prohibitedClaims: string[] }): Promise<{ answer: string; sources: { id: string; title: string }[]; grounded: boolean; violations: string[] }>;
}
