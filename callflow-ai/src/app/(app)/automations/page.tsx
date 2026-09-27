import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { splitTemplates } from "@/lib/services/automations";
import { AutomationCard } from "./automation-card";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const auth = await requireAuth("automations:manage");
  const automations = await db.automation.findMany({
    where: { organizationId: auth.orgId },
    orderBy: { createdAt: "asc" },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 8 } },
  });
  const org = await db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true } });
  return (
    <>
      <PageHeader
        title="Automations"
        description="Rules that follow up so your team doesn't have to. Every run is logged. In demo mode, “Run now” processes the next pending action immediately instead of waiting for its delay — messages are simulated, never sent."
      />
      <div className="space-y-4">
        {automations.map((a) => (
          <AutomationCard
            key={a.id}
            tz={org.timezone}
            automation={{
              key: a.key,
              name: a.name,
              description: a.description,
              enabled: a.enabled,
              triggerDescription: a.triggerDescription,
              templates: splitTemplates(a.template),
              delaysHours: a.delaysHours,
              stopConditions: a.stopConditions,
              lastRunAt: a.lastRunAt?.toISOString() ?? null,
            }}
            runs={a.runs.map((r) => ({ id: r.id, trigger: r.trigger, status: r.status, processed: r.processed, actionsTaken: r.actionsTaken, skipped: r.skipped, startedAt: r.startedAt.toISOString(), log: r.log as { level: string; message: string }[] }))}
          />
        ))}
      </div>
    </>
  );
}
