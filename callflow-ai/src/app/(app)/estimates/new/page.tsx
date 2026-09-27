import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toTenantContext } from "@/lib/services/context";
import { getEstimateFormData } from "@/lib/services/estimate-form-data";
import { EstimateForm } from "../estimate-form";

export const metadata = { title: "New estimate" };

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("estimates:write");
  const sp = await searchParams;
  const data = await getEstimateFormData(toTenantContext(auth));
  const lead = sp.lead ? await db.lead.findFirst({ where: { id: sp.lead, organizationId: auth.orgId } }) : null;
  return (
    <>
      <PageHeader eyebrow="Estimates" title="New estimate" description="Build a quote. Only prices you enter here are ever sent to the customer." />
      <EstimateForm
        {...data}
        initial={{
          customerId: sp.customer ?? lead?.customerId ?? "",
          leadId: lead?.id ?? "",
          serviceId: lead?.serviceId ?? "",
          assignedEmployeeId: auth.userId ? ((await db.employee.findFirst({ where: { organizationId: auth.orgId, userId: auth.userId } }))?.id ?? "") : "",
          title: lead ? lead.requestedService : "",
          notes: "",
          taxRatePercent: 0,
          items: [{ description: "", quantity: 1, unitPrice: 0 }],
        }}
      />
    </>
  );
}
