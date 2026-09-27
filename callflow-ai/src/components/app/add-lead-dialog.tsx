"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { createLeadAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LEAD_SOURCE, URGENCY } from "@/lib/labels";
import { createLeadSchema, LEAD_SOURCES, URGENCIES } from "@/lib/validation/schemas";

type FormIn = z.input<typeof createLeadSchema>;

export function AddLeadDialog({ services, employees, trigger }: { services: { id: string; name: string }[]; employees: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useForm<FormIn, unknown, z.output<typeof createLeadSchema>>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { firstName: "", lastName: "", phone: "", email: "", address: "", city: "", zip: "", source: "WEB_FORM", urgency: "NORMAL", serviceId: "", requestedService: "", description: "", assignedEmployeeId: "" },
  });
  const { register, handleSubmit, formState, setValue, reset } = form;
  const err = (k: keyof FormIn) => formState.errors[k]?.message as string | undefined;

  // Client-side validation via the shared Zod schema; the raw input is re-validated on the server.
  const onSubmit = handleSubmit(() =>
    start(async () => {
      const r = await createLeadAction(form.getValues());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Lead created");
      setOpen(false);
      reset();
      router.push(`/leads/${r.data!.id}`);
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> Add lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="Add lead" description="Capture a lead from a phone call, walk-in, or referral.">
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3" noValidate>
          <Field label="First name" htmlFor="firstName" error={err("firstName")}>
            <Input id="firstName" {...register("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={err("lastName")}>
            <Input id="lastName" {...register("lastName")} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={err("phone")}>
            <Input id="phone" inputMode="tel" placeholder="(801) 555-0100" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" error={err("email")}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="Street address" htmlFor="address" className="col-span-2" error={err("address")}>
            <Input id="address" {...register("address")} />
          </Field>
          <Field label="City" htmlFor="city" error={err("city")}>
            <Input id="city" {...register("city")} />
          </Field>
          <Field label="ZIP" htmlFor="zip" error={err("zip")}>
            <Input id="zip" inputMode="numeric" {...register("zip")} />
          </Field>
          <Field label="Service" htmlFor="serviceId" error={err("serviceId")}>
            <Select
              id="serviceId"
              {...register("serviceId", {
                onChange: (e) => {
                  const s = services.find((x) => x.id === e.target.value);
                  if (s) setValue("requestedService", s.name, { shouldValidate: true });
                },
              })}
            >
              <option value="">Select…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Requested service" htmlFor="requestedService" error={err("requestedService")}>
            <Input id="requestedService" {...register("requestedService")} />
          </Field>
          <Field label="Source" htmlFor="source">
            <Select id="source" {...register("source")}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urgency" htmlFor="urgency">
            <Select id="urgency" {...register("urgency")}>
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {URGENCY[u].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated value ($)" htmlFor="estimatedValue" error={err("estimatedValue")}>
            <Input id="estimatedValue" type="number" min={0} step="1" {...register("estimatedValue")} />
          </Field>
          <Field label="Assign to" htmlFor="assignedEmployeeId">
            <Select id="assignedEmployeeId" {...register("assignedEmployeeId")}>
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="description" className="col-span-2">
            <Textarea id="description" rows={3} {...register("description")} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Create lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
