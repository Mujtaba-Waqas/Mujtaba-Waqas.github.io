import type { IntegrationProvider } from "@prisma/client";

/**
 * Integration catalog. Adding a provider = add an enum value, a catalog entry,
 * and (for technical integrations) an adapter implementing the matching
 * provider interface in src/lib/providers/types.ts.
 */
export const INTEGRATIONS: {
  provider: IntegrationProvider;
  name: string;
  category: string;
  description: string;
  env: string[];
  adapter: boolean;
}[] = [
  { provider: "TWILIO", name: "Twilio", category: "Voice & SMS", description: "Phone numbers, inbound voice (TwiML webhooks), outbound SMS and signed webhooks.", env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "SMS_LIVE_SENDING=true"], adapter: true },
  { provider: "OPENAI", name: "OpenAI", category: "AI", description: "Call summaries, suggested replies and knowledge-grounded answers. Falls back to the deterministic engine.", env: ["OPENAI_API_KEY", "OPENAI_MODEL (optional)"], adapter: true },
  { provider: "GOOGLE_CALENDAR", name: "Google Calendar", category: "Scheduling", description: "Two-way sync of technician calendars and busy times.", env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_ACCESS_TOKEN"], adapter: true },
  { provider: "STRIPE", name: "Stripe", category: "Billing", description: "Subscription checkout, customer portal and signed billing webhooks.", env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PRO"], adapter: true },
  { provider: "JOBBER", name: "Jobber", category: "Field service", description: "Sync clients, requests, quotes and jobs.", env: [], adapter: false },
  { provider: "HOUSECALL_PRO", name: "Housecall Pro", category: "Field service", description: "Sync customers, estimates and scheduled jobs.", env: [], adapter: false },
  { provider: "SERVICETITAN", name: "ServiceTitan", category: "Field service", description: "Bookings, estimates and technician dispatch for larger shops.", env: [], adapter: false },
  { provider: "QUICKBOOKS", name: "QuickBooks", category: "Accounting", description: "Push invoices and payments; reconcile won estimates.", env: [], adapter: false },
  { provider: "HUBSPOT", name: "HubSpot", category: "CRM", description: "Sync contacts, deals and marketing lists.", env: [], adapter: false },
];
