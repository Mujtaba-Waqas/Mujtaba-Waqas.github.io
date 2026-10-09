"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { saveEstimateAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatCents } from "@/lib/format";
import { estimateSchema, type EstimateForm as EstimateFormValues } from "@/lib/validation/schemas";

export function EstimateForm({
  initial,
  customers,
  services,
  employees,
  leads,
}: {
  initial: EstimateFormValues;
  customers: { id: string; label: string }[];
  services: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  leads: { id: string; label: string; customerId: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useForm<EstimateFormValues, unknown, z.output<typeof estimateSchema>>({ resolver: zodResolver(estimateSchema), defaultValues: initial });
  const { register, control, handleSubmit, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const customerId = useWatch({ control, name: "customerId" });
  const tax = Number(useWatch({ control, name: "taxRatePercent" }) ?? 0) || 0;
  const subtotal = (items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const total = subtotal * (1 + tax / 100);
  const e = formState.errors;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(() =>
        start(async () => {
          const r = await saveEstimateAction(form.getValues());
          if (!r.ok) return void toast.error(r.error);
          toast.success(initial.id ? "Estimate saved" : "Estimate created");
          router.push(`/estimates/${r.data!.id}`);
          router.refresh();
        }),
      )}
      className="grid gap-4 lg:grid-cols-3"
    >
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Title" htmlFor="title" error={e.title?.message}>
            <Input id="title" placeholder="e.g. 3-ton AC replacement" {...register("title")} />
          </Field>
          <div className="hidden grid-cols-[1fr_80px_120px_100px_36px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price ($)</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_120px_100px_36px]">
              <Input aria-label={`Item ${i + 1} description`} className="col-span-2 sm:col-span-1" {...register(`items.${i}.description`)} />
              <Input aria-label={`Item ${i + 1} quantity`} type="number" min={1} {...register(`items.${i}.quantity`)} />
              <Input aria-label={`Item ${i + 1} unit price`} type="number" min={0} step="0.01" {...register(`items.${i}.unitPrice`)} />
              <span className="self-center text-right text-sm tabular">{formatCents(Math.round((Number(items?.[i]?.quantity) || 0) * (Number(items?.[i]?.unitPrice) || 0) * 100))}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove item ${i + 1}`} disabled={fields.length === 1}>
                <Trash2 />
              </Button>
              {e.items?.[i] ? <p className="col-span-full text-xs text-red-600">{e.items[i]?.description?.message ?? e.items[i]?.unitPrice?.message ?? e.items[i]?.quantity?.message}</p> : null}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}>
            <Plus /> Add line item
          </Button>
          <div className="ml-auto max-w-xs space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="tabular">{formatCents(Math.round(subtotal * 100))}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Tax %</span>
              <Input aria-label="Tax rate percent" type="number" step="0.1" min={0} max={20} className="h-7 w-20 text-right" {...register("taxRatePercent")} />
            </div>
            <div className="flex justify-between text-base font-semibold text-ink">
              <span>Total</span>
              <span className="tabular">{formatCents(Math.round(total * 100))}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Customer" htmlFor="customerId" error={e.customerId ? "Choose a customer" : undefined}>
            <Select id="customerId" {...register("customerId")}>
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead (optional)" htmlFor="leadId">
            <Select id="leadId" {...register("leadId")}>
              <option value="">None</option>
              {leads
                .filter((l) => !customerId || l.customerId === customerId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Service" htmlFor="serviceId">
            <Select id="serviceId" {...register("serviceId")}>
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned to" htmlFor="assignedEmployeeId">
            <Select id="assignedEmployeeId" {...register("assignedEmployeeId")}>
              <option value="">Unassigned</option>
              {employees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={3} {...register("notes")} />
          </Field>
          {e.items?.root?.message || e.items?.message ? <p className="text-xs text-red-600">{e.items?.root?.message ?? e.items?.message}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} {initial.id ? "Save changes" : "Create draft estimate"}
          </Button>
          <p className="text-xs text-muted">Follow-ups start when you mark the estimate as sent.</p>
        </CardContent>
      </Card>
    </form>
  );
}
