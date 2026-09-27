"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { trackSentEstimateAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { quickEstimateSchema } from "@/lib/validation/schemas";

type FormIn = z.input<typeof quickEstimateSchema>;

/** For estimates written in other software (Jobber, paper, Excel…): log it in 20 seconds and start follow-ups. */
export function TrackEstimateDialog({ services, today }: { services: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useForm<FormIn, unknown, z.output<typeof quickEstimateSchema>>({
    resolver: zodResolver(quickEstimateSchema),
    defaultValues: { firstName: "", lastName: "", phone: "", title: "", serviceId: "", sentOn: today, smsConsent: undefined as unknown as true },
  });
  const { register, handleSubmit, formState, reset } = form;
  const err = (k: keyof FormIn) => formState.errors[k]?.message as string | undefined;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPlus /> Track a sent estimate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Track a sent estimate" description="Quoted in another tool or on paper? Add the basics and CallFlow follows up on day 1, 3 and 7.">
          <form
            noValidate
            className="grid grid-cols-2 gap-3"
            onSubmit={handleSubmit(() =>
              start(async () => {
                const v = form.getValues();
                // The server re-validates consent; a false value is rejected there too.
                const r = await trackSentEstimateAction({ ...v, smsConsent: (v.smsConsent === true) as true });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Estimate tracked. Follow-ups are scheduled");
                setOpen(false);
                reset();
                router.push(`/estimates/${r.data!.id}`);
              }),
            )}
          >
            <Field label="Customer first name" htmlFor="qe-first" error={err("firstName")}>
              <Input id="qe-first" {...register("firstName")} />
            </Field>
            <Field label="Last name" htmlFor="qe-last" error={err("lastName")}>
              <Input id="qe-last" {...register("lastName")} />
            </Field>
            <Field label="Mobile phone" htmlFor="qe-phone" error={err("phone")} className="col-span-2">
              <Input id="qe-phone" inputMode="tel" placeholder="(801) 555-0100" {...register("phone")} />
            </Field>
            <Field label="What was quoted" htmlFor="qe-title" error={err("title")} className="col-span-2">
              <Input id="qe-title" placeholder="e.g. 3-ton AC replacement" {...register("title")} />
            </Field>
            <Field label="Quote amount ($)" htmlFor="qe-amount" error={err("amount")}>
              <Input id="qe-amount" type="number" min={1} step="1" {...register("amount")} />
            </Field>
            <Field label="Date sent" htmlFor="qe-sent" error={err("sentOn")}>
              <Input id="qe-sent" type="date" max={today} {...register("sentOn")} />
            </Field>
            <Field label="Service (optional)" htmlFor="qe-svc" className="col-span-2">
              <Select id="qe-svc" {...register("serviceId")}>
                <option value="">—</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="col-span-2 flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-teal-600" {...register("smsConsent")} />
              <span>
                The customer gave this number and agreed to receive text messages about this estimate. They can reply STOP at any time.
                {err("smsConsent") ? <span role="alert" className="mt-1 block text-xs text-red-600">{err("smsConsent")}</span> : null}
              </span>
            </label>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Start follow-ups</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
