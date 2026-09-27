import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { systemContext } from "@/lib/services/context";
import { createLead } from "@/lib/services/leads";
import { publicLeadSchema } from "@/lib/validation/schemas";
import { limitOr429 } from "@/lib/webhooks";

/**
 * Public website lead form. Unauthenticated by design: the tenant is resolved
 * from its public slug, input is strictly validated, and requests are rate-limited.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "public-lead", 10, 60_000);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = publicLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const input = parsed.data;
  const org = await db.organization.findUnique({ where: { slug: input.organization } });
  if (!org) return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  const [firstName, ...rest] = input.name.split(/\s+/);
  const ctx = systemContext(org.id);
  const lead = await createLead(
    ctx,
    {
      firstName,
      lastName: rest.join(" ") || "—",
      phone: input.phone,
      email: input.email ?? null,
      zip: input.zip ?? null,
      source: "WEB_FORM",
      urgency: "NORMAL",
      requestedService: input.service ?? "Website inquiry",
      description: input.message ?? null,
    },
    "SYSTEM",
  );
  await db.customer.update({ where: { id: lead.customerId }, data: { smsConsentAt: new Date() } });
  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
}
