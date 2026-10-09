import "server-only";
import { demoAI, demoCalendar, demoPayments, demoSms, demoVoice } from "./demo";
import { createGoogleCalendar, googleCalendarConfigured } from "./google";
import { createOpenAIProvider } from "./openai";
import { createStripePayments, stripeConfigured } from "./stripe";
import { createTwilioSms, createTwilioVoice, twilioConfigured } from "./twilio";
import type { AIProvider, CalendarProvider, PaymentProvider, SmsProvider, VoiceProvider } from "./types";

/**
 * Provider registry. Real vendors are selected only when their credentials are
 * present; outbound SMS additionally requires SMS_LIVE_SENDING=true.
 */
export function getSmsProvider(): SmsProvider {
  return twilioConfigured() && process.env.SMS_LIVE_SENDING === "true" ? createTwilioSms() : demoSms;
}
export function getVoiceProvider(): VoiceProvider {
  return twilioConfigured() ? createTwilioVoice() : demoVoice;
}
export function getAIProvider(): AIProvider {
  return process.env.OPENAI_API_KEY ? createOpenAIProvider() : demoAI;
}
export function getCalendarProvider(): CalendarProvider {
  return googleCalendarConfigured() ? createGoogleCalendar() : demoCalendar;
}
export function getPaymentProvider(): PaymentProvider {
  return stripeConfigured() ? createStripePayments() : demoPayments;
}

export function providerStatus() {
  return {
    twilio: { configured: twilioConfigured(), liveSms: twilioConfigured() && process.env.SMS_LIVE_SENDING === "true" },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
    google: { configured: googleCalendarConfigured() },
    stripe: { configured: stripeConfigured(), webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET) },
  };
}
