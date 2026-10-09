import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toTenantContext } from "@/lib/services/context";
import { getEstimateFormData } from "@/lib/services/estimate-form-data";
import { EstimateForm } from "../../estimate-form";

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("estimates:write");
  const { id } = await params;
  const est = await db.estimate.findFirst({ where: { id, organizationId: auth.orgId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!est) notFound();
  if (est.status === "ACCEPTED" || est.status === "DECLINED") redirect(`/estimates/${id}`);
  const data = await getEstimateFormData(toTenantContext(auth));
  return (
    <>
      <PageHeader eyebrow={est.number} title="Edit estimate" />
      <EstimateForm
        {...data}
        initial={{
          id: est.id,
          customerId: est.customerId,
          leadId: est.leadId ?? "",
          serviceId: est.serviceId ?? "",
          assignedEmployeeId: est.assignedEmployeeId ?? "",
          title: est.title,
          notes: est.notes ?? "",
          taxRatePercent: est.subtotalCents ? Math.round((est.taxCents / est.subtotalCents) * 1000) / 10 : 0,
          items: est.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPriceCents / 100 })),
        }}
      />
    </>
  );
}
