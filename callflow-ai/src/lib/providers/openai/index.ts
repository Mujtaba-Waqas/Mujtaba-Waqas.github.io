import { answerFromKnowledge, applyGuardrails, retrieve } from "../../domain/knowledge";
import { demoAI, rulesSummary } from "../demo";
import type { AIProvider, CallSummary } from "../types";

/**
 * OpenAI adapter. Used for call summaries, suggested SMS replies and KB Q&A
 * when OPENAI_API_KEY is set. The receptionist's routing decisions stay
 * rule-based; model output is grounded in retrieved KB docs and post-filtered
 * against prohibited claims. Any failure falls back to the deterministic provider.
 */
async function chat(system: string, user: string, json = false): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export function createOpenAIProvider(): AIProvider {
  return {
    name: "OpenAI",
    mode: "live",
    async summarizeCall(input) {
      const fallback = rulesSummary(input);
      const out = await chat(
        "Summarize an HVAC front-office phone call as JSON with keys headline, intent, keyDetails (string[]), nextSteps (string[]). Use only facts present in the transcript. Never invent prices, times or names.",
        JSON.stringify({ transcript: input.transcript, facts: input.facts }),
        true,
      );
      if (!out) return fallback;
      try {
        const parsed = JSON.parse(out) as Partial<CallSummary>;
        return {
          ...fallback,
          headline: typeof parsed.headline === "string" ? parsed.headline : fallback.headline,
          intent: typeof parsed.intent === "string" ? parsed.intent : fallback.intent,
          keyDetails: Array.isArray(parsed.keyDetails) ? parsed.keyDetails.map(String).slice(0, 6) : fallback.keyDetails,
          nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String).slice(0, 5) : fallback.nextSteps,
          generatedBy: "openai",
        };
      } catch {
        return fallback;
      }
    },
    async suggestSmsReply(input) {
      const last = [...input.messages].reverse().find((m) => m.direction === "INBOUND");
      const docs = last ? retrieve(last.body, input.knowledge, 3).map((h) => h.doc) : [];
      const out = await chat(
        `You draft SMS replies for ${input.businessName}, an HVAC company. Be warm, direct, under 320 characters. Only state facts from the provided knowledge. Never quote a price that is not in the knowledge. Never promise outcomes. If unsure, offer a callback.`,
        JSON.stringify({ customer: input.customerFirstName, conversation: input.messages.slice(-8), knowledge: docs.map((d) => `${d.title}: ${d.content}`), context: input.context }),
      );
      if (!out) return demoAI.suggestSmsReply(input);
      const guarded = applyGuardrails(out.trim(), input.prohibitedClaims);
      return guarded.violations.length ? demoAI.suggestSmsReply(input) : { reply: guarded.text, sources: docs.map((d) => d.title) };
    },
    async answerQuestion({ question, knowledge, prohibitedClaims }) {
      const hits = retrieve(question, knowledge, 3);
      if (!hits.length) return { ...answerFromKnowledge(question, knowledge, prohibitedClaims), violations: [] };
      const out = await chat(
        "Answer the caller's question in 1-2 sentences using ONLY the provided company knowledge. If the knowledge does not answer it, say a team member will follow up. Never invent prices.",
        JSON.stringify({ question, knowledge: hits.map((h) => `${h.doc.title}: ${h.doc.content}`) }),
      );
      if (!out) return { ...answerFromKnowledge(question, knowledge, prohibitedClaims), violations: [] };
      const guarded = applyGuardrails(out.trim(), prohibitedClaims);
      return { answer: guarded.text, sources: hits.map((h) => ({ id: h.doc.id, title: h.doc.title })), grounded: true, violations: guarded.violations };
    },
  };
}
