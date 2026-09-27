"use client";

import { ArrowLeft, ArrowRight, Calendar, Check, Loader2, PhoneCall, Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ReceptionistForm } from "@/app/(app)/ai-receptionist/receptionist-client";
import { CompanyForm, HoursForm, ServiceAreaManager, TeamManager } from "@/app/(app)/settings/settings-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import type { ReceptionistSettings } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";
import { activateAction, addCountyPresetAction, createOrganizationAction, setIntegrationChoiceAction, setOnboardingStepAction, setServicesAction } from "./actions";

const STEPS = [
  "Company information",
  "Services",
  "Service territory",
  "Hours & emergency policy",
  "Team members",
  "Calendar",
  "AI receptionist",
  "Phone number",
  "Test call",
  "Activate",
];

type Props = {
  step: number;
  orgName: string;
  completed: boolean;
  company: Parameters<typeof CompanyForm>[0]["initial"];
  services: { id: string; name: string; description: string | null; active: boolean }[];
  areas: { id: string; zip: string; city: string; county: string }[];
  hours: Parameters<typeof HoursForm>[0]["initial"];
  employees: Parameters<typeof TeamManager>[0]["employees"];
  receptionist: ReceptionistSettings;
  kbCounts: Record<string, number>;
  providers: { twilio: boolean; google: boolean };
};

export function Wizard(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (n: number) =>
    start(async () => {
      await setOnboardingStepAction({ step: n });
      router.push(`/onboarding?step=${n}`);
    });

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
              <PhoneCall className="size-3.5" />
            </span>
            CallFlow AI setup · <span className="font-normal text-muted">{p.orgName}</span>
          </div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            {p.completed ? "Back to dashboard" : "Finish later"}
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr]">
        <nav aria-label="Setup steps">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const done = p.completed || n < p.step;
              return (
                <li key={s}>
                  <Link href={`/onboarding?step=${n}`} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm", n === p.step ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface/70")} aria-current={n === p.step ? "step" : undefined}>
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-accent text-white" : n === p.step ? "bg-ink text-white" : "bg-slate-200 text-ink-2")}>{done ? <Check className="size-3" /> : n}</span>
                    {s}
                  </Link>
                </li>
              );
            })}
          </ol>
          {p.completed ? <p className="mt-4 rounded-lg bg-accent-50 p-3 text-xs text-ink-2">This workspace is already active. Changes you make here apply immediately.</p> : null}
        </nav>
        <main>
          <p className="text-xs font-medium text-muted">
            Step {p.step} of {STEPS.length}
          </p>
          <h1 className="mb-4 text-2xl font-semibold text-ink">{STEPS[p.step - 1]}</h1>
          <StepBody {...p} />
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" disabled={p.step === 1 || pending} onClick={() => go(p.step - 1)}>
              <ArrowLeft /> Back
            </Button>
            {p.step < STEPS.length ? (
              <Button disabled={pending} onClick={() => go(p.step + 1)}>
                {pending ? <Loader2 className="animate-spin" /> : null} Continue <ArrowRight />
              </Button>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function StepBody(p: Props) {
  switch (p.step) {
    case 1:
      return (
        <Card>
          <CardContent className="py-5">
            <p className="mb-4 text-sm text-muted">This is what the AI receptionist says your company is, and where customers are sent for reviews.</p>
            <CompanyForm initial={p.company} />
          </CardContent>
        </Card>
      );
    case 2:
      return <ServicesStep services={p.services} />;
    case 3:
      return <TerritoryStep areas={p.areas} />;
    case 4:
      return (
        <Card>
          <CardContent className="py-5">
            <HoursForm initial={p.hours} technicians={p.employees.filter((e) => e.kind === "TECHNICIAN" && e.active).map((e) => ({ id: e.id, name: e.name }))} />
          </CardContent>
        </Card>
      );
    case 5:
      return (
        <Card>
          <CardContent className="py-5">
            <p className="mb-3 text-sm text-muted">Add your dispatcher and technicians. Technicians get calendar columns and are used for availability.</p>
            <TeamManager employees={p.employees} />
          </CardContent>
        </Card>
      );
    case 6:
      return <ChoiceStep provider="GOOGLE_CALENDAR" icon={<Calendar className="size-5" />} demoTitle="Use the CallFlow demo calendar" demoText="Fully functional internal calendar with technician columns, buffers and availability. Recommended for this demo." liveTitle="Connect Google Calendar" liveText="Sync technician calendars. Requires GOOGLE_* environment variables." liveAvailable={p.providers.google} />;
    case 7:
      return <ReceptionistForm initial={p.receptionist} businessName={p.orgName} kbCounts={p.kbCounts} />;
    case 8:
      return <ChoiceStep provider="TWILIO" icon={<PhoneCall className="size-5" />} demoTitle="Use demo number (801) 555-0198" demoText="Calls and texts are simulated inside CallFlow. Nothing is sent to real phones." liveTitle="Connect a Twilio number" liveText="Point your Twilio number's voice & messaging webhooks at CallFlow. Requires TWILIO_* environment variables." liveAvailable={p.providers.twilio} />;
    case 9:
      return (
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto size-8 text-accent" />
            <p className="text-sm text-ink-2">Place a simulated call to hear your greeting, see emergency triage, and watch a booking land on the calendar.</p>
            <Button asChild variant="accent">
              <Link href="/calls/simulator" target="_blank">
                <PhoneCall /> Open the call simulator
              </Link>
            </Button>
            <p className="text-xs text-muted">Opens in a new tab — come back here to activate.</p>
          </CardContent>
        </Card>
      );
    default:
      return <ActivateStep completed={p.completed} />;
  }
}

function ServicesStep({ services }: { services: Props["services"] }) {
  const [active, setActive] = useState(new Set(services.filter((s) => s.active).map((s) => s.id)));
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <p className="text-sm text-muted">The AI only books services you offer.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", active.has(s.id) ? "border-accent bg-accent-50" : "border-line")}>
              <input type="checkbox" className="mt-1 accent-teal-600" checked={active.has(s.id)} onChange={(e) => setActive((a) => { const n = new Set(a); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
              <span>
                <span className="block text-sm font-medium text-ink">{s.name}</span>
                {s.description ? <span className="block text-xs text-muted">{s.description}</span> : null}
              </span>
            </label>
          ))}
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setServicesAction({ activeIds: [...active] });
              if (r.ok) toast.success("Services saved");
              else toast.error(r.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Save services
        </Button>
      </CardContent>
    </Card>
  );
}

function TerritoryStep({ areas }: { areas: Props["areas"] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <p className="mb-2 text-sm text-muted">Add whole counties, then fine-tune by ZIP.</p>
          <div className="flex flex-wrap gap-2">
            {(["Salt Lake", "Davis", "Utah", "Weber"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await addCountyPresetAction({ county: c });
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`${c} County added`);
                    router.refresh();
                  })
                }
              >
                + {c} County
              </Button>
            ))}
          </div>
        </div>
        <ServiceAreaManager areas={areas} />
      </CardContent>
    </Card>
  );
}

function ChoiceStep({ provider, icon, demoTitle, demoText, liveTitle, liveText, liveAvailable }: { provider: "TWILIO" | "GOOGLE_CALENDAR"; icon: React.ReactNode; demoTitle: string; demoText: string; liveTitle: string; liveText: string; liveAvailable: boolean }) {
  const [pending, start] = useTransition();
  const choose = (mode: "DEMO" | "CONNECTED") =>
    start(async () => {
      const r = await setIntegrationChoiceAction({ provider, mode });
      if (!r.ok) return void toast.error(r.error);
      toast.success(mode === "DEMO" ? "Demo mode selected" : "Connected");
    });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="border-accent ring-1 ring-accent">
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center gap-2 text-accent">
            {icon} <Badge tone="teal">Recommended for demo</Badge>
          </div>
          <p className="font-medium text-ink">{demoTitle}</p>
          <p className="text-sm text-muted">{demoText}</p>
          <Button size="sm" variant="accent" disabled={pending} onClick={() => choose("DEMO")}>
            Use demo mode
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center gap-2 text-muted">
            {icon} {liveAvailable ? <Badge tone="green">Credentials detected</Badge> : <Badge>Not configured</Badge>}
          </div>
          <p className="font-medium text-ink">{liveTitle}</p>
          <p className="text-sm text-muted">{liveText}</p>
          <Button size="sm" variant="outline" disabled={pending || !liveAvailable} onClick={() => choose("CONNECTED")}>
            Connect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivateStep({ completed }: { completed: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-3 py-8 text-center">
        <Rocket className="mx-auto size-9 text-accent" />
        <p className="text-lg font-semibold text-ink">{completed ? "Your AI front office is live" : "Ready to answer every call"}</p>
        <p className="mx-auto max-w-md text-sm text-muted">Activation turns on the receptionist and automations for this workspace. In demo mode all calls and texts stay simulated.</p>
        <Button
          variant="accent"
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await activateAction({});
              if (!r.ok) return void toast.error(r.error);
              toast.success("Workspace activated");
              router.push("/dashboard");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Rocket />} {completed ? "Save & go to dashboard" : "Activate CallFlow"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function NewCompanyForm() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-6">
          <h1 className="text-xl font-semibold text-ink">Add a company</h1>
          <p className="text-sm text-muted">Creates a new, empty workspace you own. You can switch between companies from the top bar.</p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createOrganizationAction({ name });
                if (!r.ok) return void toast.error(r.error);
                router.push("/onboarding?step=1");
                router.refresh();
              });
            }}
          >
            <Field label="Company name" htmlFor="cname">
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wasatch Comfort Co." />
            </Field>
            <div className="flex justify-between">
              <Button asChild variant="ghost">
                <Link href="/dashboard">Cancel</Link>
              </Button>
              <Button disabled={pending || name.trim().length < 2}>{pending ? <Loader2 className="animate-spin" /> : null} Create & start setup</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
