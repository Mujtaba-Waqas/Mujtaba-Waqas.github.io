import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { providerStatus } from "@/lib/providers";
import { loadOrg, toTenantContext } from "@/lib/services/context";
import { NewCompanyForm, Wizard } from "./wizard";

export const metadata = { title: "Setup" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const sp = await searchParams;
  if (sp.new === "1") return <NewCompanyForm />;
  const ctx = toTenantContext(auth);
  const { org, settings } = await loadOrg(ctx);
  const [services, areas, employees, kb] = await Promise.all([
    db.service.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    db.serviceArea.findMany({ where: { organizationId: org.id }, orderBy: [{ county: "asc" }, { city: "asc" }] }),
    db.employee.findMany({ where: { organizationId: org.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.knowledgeDocument.groupBy({ by: ["category"], where: { organizationId: org.id }, _count: true }),
  ]);
  const step = Math.min(10, Math.max(1, Number(sp.step ?? (org.onboardingCompletedAt ? 1 : org.onboardingStep)) || 1));
  const ps = providerStatus();
  return (
    <Wizard
      step={step}
      orgName={org.name}
      completed={Boolean(org.onboardingCompletedAt)}
      company={{ name: org.name, phone: formatPhone(org.phone) === "—" ? "" : formatPhone(org.phone), email: org.email ?? "", website: org.website ?? "", address: org.address ?? "", city: org.city ?? "", state: org.state ?? "UT", timezone: org.timezone as "America/Denver", googleReviewUrl: org.googleReviewUrl ?? "" }}
      services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, active: s.active }))}
      areas={areas.map((a) => ({ id: a.id, zip: a.zip, city: a.city, county: a.county }))}
      hours={{ businessHours: settings.businessHours, emergency: settings.emergency, bufferMinutes: settings.scheduling.bufferMinutes }}
      employees={employees.map((e) => ({ id: e.id, name: e.name, title: e.title, kind: e.kind, active: e.active, isOnCall: e.isOnCall, color: e.color, phone: formatPhone(e.phone) }))}
      receptionist={settings.receptionist}
      kbCounts={Object.fromEntries(kb.map((k) => [k.category, k._count]))}
      providers={{ twilio: ps.twilio.configured, google: ps.google.configured }}
    />
  );
}
