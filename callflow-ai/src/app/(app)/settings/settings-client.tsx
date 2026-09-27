"use client";

import { Loader2, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addEmployeeAction, addServiceAreaAction, removeServiceAreaAction, saveCompanyAction, saveHoursAction, saveReviewPolicyAction, setEmployeeActiveAction } from "@/app/(app)/settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string[] | undefined> };
function useSave() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const router = useRouter();
  const save = (fn: () => Promise<Result>, msg = "Saved", after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error);
      }
      setErrors({});
      toast.success(msg);
      after?.();
      router.refresh();
    });
  return { pending, errors, save };
}

type Company = { name: string; phone: string; email: string; website: string; address: string; city: string; state: string; timezone: "America/Denver"; googleReviewUrl: string };
export function CompanyForm({ initial }: { initial: Company }) {
  const [c, setC] = useState(initial);
  const { pending, errors, save } = useSave();
  const f = (k: keyof Company) => ({ id: k, value: c[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value }) });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveCompanyAction(c));
      }}
    >
      <Field label="Company name" htmlFor="name" error={errors.name?.[0]}>
        <Input {...f("name")} />
      </Field>
      <Field label="Main phone" htmlFor="phone" error={errors.phone?.[0]}>
        <Input {...f("phone")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.[0]}>
        <Input type="email" {...f("email")} />
      </Field>
      <Field label="Website" htmlFor="website" error={errors.website?.[0]}>
        <Input {...f("website")} />
      </Field>
      <Field label="Address" htmlFor="address" className="sm:col-span-2">
        <Input {...f("address")} />
      </Field>
      <Field label="City" htmlFor="city">
        <Input {...f("city")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" htmlFor="state" error={errors.state?.[0]}>
          <Input maxLength={2} {...f("state")} />
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Select id="timezone" value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value as Company["timezone"] })}>
            {["America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Chicago", "America/New_York"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Google review link" htmlFor="googleReviewUrl" className="sm:col-span-2" error={errors.googleReviewUrl?.[0]} hint="Sent to customers who give positive feedback.">
        <Input {...f("googleReviewUrl")} />
      </Field>
      <div className="sm:col-span-2">
        <Button size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save profile
        </Button>
      </div>
    </form>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Hours = { day: number; open: string; close: string }[];
type Emergency = { available24x7: boolean; responseTargetHours: number; onCallEmployeeId: string | null; policy: string };

export function HoursForm({ initial, technicians }: { initial: { businessHours: Hours; emergency: Emergency; bufferMinutes: number }; technicians: { id: string; name: string }[] }) {
  const [hours, setHours] = useState<Hours>(initial.businessHours);
  const [em, setEm] = useState(initial.emergency);
  const [buffer, setBuffer] = useState(String(initial.bufferMinutes));
  const { pending, save } = useSave();
  const row = (d: number) => hours.find((h) => h.day === d);
  const setRow = (d: number, patch: Partial<Hours[number]> | null) =>
    setHours((hs) => (patch === null ? hs.filter((h) => h.day !== d) : hs.some((h) => h.day === d) ? hs.map((h) => (h.day === d ? { ...h, ...patch } : h)) : [...hs, { day: d, open: "08:00", close: "18:00", ...patch }].sort((a, b) => a.day - b.day)));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveHoursAction({ businessHours: hours, emergency: em, bufferMinutes: Number(buffer) }));
      }}
    >
      <ul className="space-y-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const r = row(d);
          return (
            <li key={d} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-ink-2">{DAYS[d]}</span>
              <Switch checked={Boolean(r)} onCheckedChange={(v) => setRow(d, v ? {} : null)} aria-label={`Open on ${DAYS[d]}`} />
              {r ? (
                <>
                  <Input aria-label={`${DAYS[d]} open`} type="time" className="h-8 w-28" value={r.open} onChange={(e) => setRow(d, { open: e.target.value })} />
                  <span className="text-muted">to</span>
                  <Input aria-label={`${DAYS[d]} close`} type="time" className="h-8 w-28" value={r.close} onChange={(e) => setRow(d, { close: e.target.value })} />
                </>
              ) : (
                <span className="text-xs text-muted">Closed — emergencies only</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="On-call technician" htmlFor="oncall">
          <Select id="oncall" value={em.onCallEmployeeId ?? ""} onChange={(e) => setEm({ ...em, onCallEmployeeId: e.target.value || null })}>
            <option value="">None</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Response target (hrs)" htmlFor="target">
          <Input id="target" type="number" min={0.5} step={0.5} value={em.responseTargetHours} onChange={(e) => setEm({ ...em, responseTargetHours: Number(e.target.value) })} />
        </Field>
        <Field label="Travel buffer (min)" htmlFor="buffer">
          <Input id="buffer" type="number" min={0} max={120} value={buffer} onChange={(e) => setBuffer(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={em.available24x7} onCheckedChange={(v) => setEm({ ...em, available24x7: v })} aria-label="24/7 emergency service" /> 24/7 emergency service
      </label>
      <Field label="Emergency policy" htmlFor="policy">
        <Textarea id="policy" rows={3} value={em.policy} onChange={(e) => setEm({ ...em, policy: e.target.value })} />
      </Field>
      <Button size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save hours & policy
      </Button>
    </form>
  );
}

export function ServiceAreaManager({ areas }: { areas: { id: string; zip: string; city: string; county: string }[] }) {
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("Salt Lake");
  const { pending, errors, save } = useSave();
  const counties = [...new Set(areas.map((a) => a.county))];
  return (
    <div className="space-y-3">
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {counties.map((c) => (
          <div key={c}>
            <p className="text-xs font-semibold text-ink-2">{c} County</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {areas
                .filter((a) => a.county === c)
                .map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] text-ink-2">
                    {a.zip} {a.city}
                    <button type="button" disabled={pending} onClick={() => save(() => removeServiceAreaAction({ id: a.id }), `Removed ${a.zip}`)} className="rounded-full p-0.5 hover:bg-slate-300" aria-label={`Remove ${a.zip}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(() => addServiceAreaAction({ zip, city, county }), `Added ${zip}`, () => {
            setZip("");
            setCity("");
          });
        }}
      >
        <Field label="ZIP" htmlFor="zip" error={errors.zip?.[0]}>
          <Input id="zip" className="w-24" value={zip} onChange={(e) => setZip(e.target.value)} />
        </Field>
        <Field label="City" htmlFor="acity">
          <Input id="acity" className="w-40" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="County" htmlFor="county">
          <Input id="county" className="w-32" value={county} onChange={(e) => setCounty(e.target.value)} />
        </Field>
        <Button size="sm" variant="outline" disabled={pending}>
          <Plus /> Add ZIP
        </Button>
      </form>
    </div>
  );
}

export function TeamManager({ employees }: { employees: { id: string; name: string; title: string; kind: string; active: boolean; isOnCall: boolean; color: string; phone: string }[] }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("HVAC Technician");
  const [kind, setKind] = useState<"TECHNICIAN" | "DISPATCHER" | "OFFICE">("TECHNICIAN");
  const { pending, save } = useSave();
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {employees.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <Avatar name={e.name} color={e.color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${e.active ? "text-ink" : "text-muted line-through"}`}>{e.name}</p>
              <p className="text-xs text-muted">
                {e.title} · {e.phone}
              </p>
            </div>
            {e.isOnCall ? <Badge tone="violet">On call</Badge> : null}
            {e.kind !== "OWNER" ? (
              <Switch checked={e.active} disabled={pending} onCheckedChange={(v) => save(() => setEmployeeActiveAction({ id: e.id, active: v }), v ? "Activated" : "Deactivated")} aria-label={`${e.name} active`} />
            ) : (
              <Badge tone="navy">Owner</Badge>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(() => addEmployeeAction({ name, title, kind }), "Team member added", () => setName(""));
        }}
      >
        <Field label="Name" htmlFor="ename">
          <Input id="ename" className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Title" htmlFor="etitle">
          <Input id="etitle" className="w-40" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="ekind">
          <Select id="ekind" className="w-36" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="TECHNICIAN">Technician</option>
            <option value="DISPATCHER">Dispatcher</option>
            <option value="OFFICE">Office staff</option>
          </Select>
        </Field>
        <Button size="sm" variant="outline" disabled={pending || name.trim().length < 2}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  );
}

export function ReviewPolicyForm({ initial }: { initial: { policy: "positive_only" | "all_customers"; delayHours: number } }) {
  const [policy, setPolicy] = useState(initial.policy);
  const [delay, setDelay] = useState(String(initial.delayHours));
  const { pending, save } = useSave();
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save(() => saveReviewPolicyAction({ policy, delayHours: Number(delay) }));
      }}
    >
      <label className="flex gap-2">
        <input type="radio" name="policy" checked={policy === "positive_only"} onChange={() => setPolicy("positive_only")} className="mt-1 accent-teal-600" />
        <span>
          <strong className="text-ink">Satisfaction check first</strong> — send the Google link after a positive reply; route unhappy customers to the owner.
        </span>
      </label>
      <label className="flex gap-2">
        <input type="radio" name="policy" checked={policy === "all_customers"} onChange={() => setPolicy("all_customers")} className="mt-1 accent-teal-600" />
        <span>
          <strong className="text-ink">Offer the link to every customer</strong> — still routes negative feedback to the owner, but never withholds the public link (most conservative with Google&apos;s review-gating policy).
        </span>
      </label>
      <Field label="Send satisfaction check after (hours)" htmlFor="rdelay">
        <Input id="rdelay" type="number" min={0} max={168} className="w-28" value={delay} onChange={(e) => setDelay(e.target.value)} />
      </Field>
      <Button size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save policy
      </Button>
    </form>
  );
}
