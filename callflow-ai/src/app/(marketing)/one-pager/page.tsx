import { Check, PhoneCall } from "lucide-react";
import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { marketingConfig } from "@/lib/marketing";
import { PLANS } from "@/lib/plans";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "CallFlow AI — One-page overview" };

/** Letter-size printable flyer. Open it and use "Save as PDF" to attach it to emails. */
export default function OnePager() {
  const cfg = marketingConfig();
  const demo = appUrl().replace(/^https?:\/\//, "");
  return (
    <div className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 0.5in; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-2 text-sm text-ink-2">
        <span>Tip: click “Save as PDF”, then attach the PDF to your emails.</span>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[8.5in] bg-white p-10 text-ink shadow-xl print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <div className="flex items-center gap-2 text-xl font-semibold">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
              <PhoneCall className="size-5" />
            </span>
            CallFlow AI
          </div>
          <p className="text-sm text-muted">AI front office for HVAC companies</p>
        </header>

        <h1 className="mt-6 text-3xl font-semibold leading-tight">Answer every call. Book more jobs. Win back the estimates that went quiet.</h1>
        <p className="mt-3 text-ink-2">CallFlow AI works nights, weekends and busy afternoons, so no homeowner hears voicemail and no estimate is forgotten.</p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            ["Missed-call text-back", "Every missed call gets a text within seconds, and the conversation becomes a lead in your inbox."],
            ["After-hours AI answering", "Collects details, flags emergencies, checks your service area and books real calendar slots."],
            ["Estimate recovery", "Friendly follow-ups on day 1, 3 and 7. Stops the moment the customer replies yes, no, or STOP."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-line p-4">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-ink-2">{b}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Also included</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {["Appointment reminders", "Review requests after every job", "Shared SMS inbox with human takeover", "Dashboard of recovered revenue", "Only quotes prices you approve", "Customers can opt out anytime (STOP)"].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-accent-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Pilot offer</p>
            <p className="mt-1 font-semibold">{cfg.pilotOffer}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Plans after the pilot</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {Object.values(PLANS).map((p) => (
                <li key={p.name}>
                  <strong>{p.name}</strong> ${p.priceMonthly}/mo
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-xl border-2 border-dashed border-line-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Try it yourself (2 minutes)</p>
          <p className="mt-1 text-lg font-semibold text-brand">{demo}</p>
          <p className="text-sm text-ink-2">Click “Sign in with demo account”, then Calls → Call simulator → After-hours AC emergency.</p>
        </div>

        <footer className="mt-6 flex items-end justify-between border-t border-line pt-4 text-sm">
          <div>
            {cfg.founderName ? <p className="font-semibold">{cfg.founderName}</p> : null}
            {cfg.contactPhone ? <p>{cfg.contactPhone}</p> : null}
            {cfg.contactEmail ? <p>{cfg.contactEmail}</p> : null}
            {!cfg.founderName && !cfg.contactEmail && !cfg.contactPhone ? <p className="text-muted">Add FOUNDER_NAME, CONTACT_EMAIL and CONTACT_PHONE in your environment settings to show your contact details here.</p> : null}
          </div>
          <p className="text-xs text-muted">Serving HVAC companies in {cfg.region}</p>
        </footer>
      </article>
    </div>
  );
}
