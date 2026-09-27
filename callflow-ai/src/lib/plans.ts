import type { Plan } from "@prisma/client";

export const PLANS: Record<Plan, { name: string; priceMonthly: number; voiceMinutes: number; smsSegments: number; numbers: number; features: string[]; highlight?: boolean }> = {
  STARTER: {
    name: "Starter",
    priceMonthly: 199,
    voiceMinutes: 500,
    smsSegments: 1000,
    numbers: 1,
    features: ["One phone number", "AI receptionist", "500 voice minutes", "SMS", "Lead capture", "Basic scheduling"],
  },
  GROWTH: {
    name: "Growth",
    priceMonthly: 399,
    voiceMinutes: 1500,
    smsSegments: 3000,
    numbers: 1,
    highlight: true,
    features: ["Everything in Starter", "Estimate recovery", "Review automation", "CRM/calendar integrations", "Advanced analytics", "1,500 voice minutes"],
  },
  PRO: {
    name: "Pro",
    priceMonthly: 699,
    voiceMinutes: 4000,
    smsSegments: 8000,
    numbers: 5,
    features: ["Everything in Growth", "Multiple locations/numbers", "Custom knowledge base", "Advanced workflows", "Priority support", "Higher usage limits (4,000 min)"],
  },
};
