import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { DeleteDocButton, DocDialog } from "./kb-client";

export const metadata = { title: "Knowledge Base" };

const CATEGORY_LABELS: Record<string, string> = {
  COMPANY: "Company information",
  SERVICES: "Services",
  HOURS: "Business hours",
  SERVICE_AREA: "Service area",
  FAQ: "FAQs",
  PRICING: "Pricing guidelines",
  FINANCING: "Financing",
  EMERGENCY: "Emergency policies",
  ESCALATION: "Escalation & transfer rules",
  PROHIBITED: "Prohibited statements",
};

export default async function KnowledgeBasePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("knowledge:manage");
  const sp = await searchParams;
  const docs = await db.knowledgeDocument.findMany({
    where: { organizationId: auth.orgId, ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { content: { contains: sp.q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const groups = Object.keys(CATEGORY_LABELS).map((c) => ({ category: c, docs: docs.filter((d) => d.category === c) }));

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="The only source of facts your AI receptionist may use. If it isn't written here — especially prices — the AI won't say it."
        actions={<DocDialog />}
      />
      <form className="mb-4">
        <input name="q" defaultValue={sp.q} placeholder="Search knowledge…" aria-label="Search knowledge base" className="h-9 w-full max-w-md rounded-lg border border-line-strong bg-surface px-3 text-sm" />
      </form>
      {docs.length ? (
        <div className="space-y-6">
          {groups
            .filter((g) => g.docs.length)
            .map((g) => (
              <section key={g.category}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  {CATEGORY_LABELS[g.category]} <span className="text-xs font-normal text-muted">{g.docs.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.docs.map((d) => (
                    <Card key={d.id} className={`p-4 ${d.category === "PROHIBITED" ? "border-red-200" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink">{d.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted">Updated {formatDate(d.updatedAt)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!d.isActive ? <Badge>Inactive</Badge> : null}
                          <DocDialog doc={{ id: d.id, category: d.category, title: d.title, content: d.content, tags: d.tags.join(", "), isActive: d.isActive }} />
                          <DeleteDocButton id={d.id} title={d.title} />
                        </div>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{d.content}</p>
                      {d.tags.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.tags.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={BookOpen} title="No entries found" description="Add your company info, services, pricing guidelines and policies." />
        </Card>
      )}
    </>
  );
}
