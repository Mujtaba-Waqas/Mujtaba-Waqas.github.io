import type { KnowledgeCategory } from "@prisma/client";

export interface KnowledgeDoc {
  id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
}

const STOP = new Set("a an and are as at be but by can do does for from how i if in is it me my of on or our so that the this to we what when where which who will with you your much".split(" "));

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ing|es|s)$/, ""));
}

const CATEGORY_HINTS: Partial<Record<KnowledgeCategory, RegExp>> = {
  PRICING: /\b(how much|cost|price|pricing|charge|fee|rate|quote|expensive)\b/i,
  FINANCING: /\b(financ|payment plan|monthly|credit|loan|afford)\w*/i,
  HOURS: /\b(hours|open|close|weekend|saturday|sunday)\b/i,
  SERVICE_AREA: /\b(area|serve|come to|cover|county|city|zip)\b/i,
  EMERGENCY: /\b(emergency|after hours|tonight|24\/7|urgent|gas|carbon monoxide)\b/i,
};

export interface RetrievalHit {
  doc: KnowledgeDoc;
  score: number;
}

/** Lightweight lexical retrieval (term overlap + tag/title/category boosts). Deterministic. */
export function retrieve(query: string, docs: KnowledgeDoc[], k = 3): RetrievalHit[] {
  const q = tokenize(query);
  if (!q.length) return [];
  return docs
    .map((doc) => {
      const title = new Set(tokenize(doc.title));
      const tags = new Set(doc.tags.flatMap((t) => tokenize(t)));
      const body = tokenize(doc.content);
      const bodySet = new Set(body);
      let score = 0;
      for (const term of q) {
        if (title.has(term)) score += 3;
        if (tags.has(term)) score += 3;
        if (bodySet.has(term)) score += 1;
      }
      const hint = CATEGORY_HINTS[doc.category];
      if (hint?.test(query)) score += 4;
      return { doc, score };
    })
    .filter((h) => h.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Pick the sentences of a doc most related to the query (keeps answers short and grounded). */
export function bestSentences(query: string, content: string, max = 2) {
  const q = new Set(tokenize(query));
  const sentences = content.split(/(?<=[.!?])\s+/).filter(Boolean);
  const scored = sentences.map((s, i) => ({ s, i, score: tokenize(s).filter((t) => q.has(t)).length }));
  const top = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  return (top.length ? top : sentences.slice(0, max)).join(" ");
}

export const PRICE_FALLBACK =
  "I don't want to give you an inaccurate number — pricing depends on what the technician finds. They'll review the diagnosis and pricing with you before any work begins.";

export interface GroundedAnswer {
  answer: string;
  sources: { id: string; title: string }[];
  grounded: boolean;
}

/**
 * Answer a question strictly from the knowledge base. Price questions never
 * fall through to a guess: without a PRICING/FINANCING document we defer.
 */
export function answerFromKnowledge(question: string, docs: KnowledgeDoc[], prohibited: string[] = []): GroundedAnswer {
  const isPrice = CATEGORY_HINTS.PRICING!.test(question);
  const pool = docs.filter((d) => d.category !== "PROHIBITED");
  let hits = retrieve(question, pool, 2);
  if (isPrice) hits = hits.filter((h) => h.doc.category === "PRICING" || h.doc.category === "FINANCING");
  if (!hits.length) {
    return {
      answer: isPrice
        ? PRICE_FALLBACK
        : "That's a great question — I don't have that information on hand, so I'll have a team member follow up with you.",
      sources: [],
      grounded: false,
    };
  }
  const answer = bestSentences(question, hits[0].doc.content, 2);
  return { answer: applyGuardrails(answer, prohibited).text, sources: hits.map((h) => ({ id: h.doc.id, title: h.doc.title })), grounded: true };
}

/** Remove sentences containing prohibited claims. Returns which rules fired. */
export function applyGuardrails(text: string, prohibited: string[]) {
  const violations: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const hit = prohibited.find((p) => s.toLowerCase().includes(p.toLowerCase()));
    if (hit) violations.push(hit);
    return !hit;
  });
  return { text: kept.join(" ").trim() || "Let me have a team member follow up with the details.", violations };
}
