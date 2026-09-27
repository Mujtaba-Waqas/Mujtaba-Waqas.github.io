import { ArrowRight, BellRing, CalendarCheck, Check, ClipboardList, Clock, FileText, Moon, PhoneCall, PhoneMissed, ShieldCheck, Star, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getAuth } from "@/lib/auth/session";
import { bookingHref, marketingConfig } from "@/lib/marketing";
import { PLANS } from "@/lib/plans";
import { RoiCalculator } from "./roi-calculator";

export const metadata: Metadata = {
  title: "CallFlow AI — Answer every call. Book more HVAC jobs.",
  description: "AI front office for HVAC companies: after-hours call answering, missed-call text-back, estimate follow-up and review requests.",
  robots: { index: true, follow: true },
};

const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors";

export default async function MarketingPage() {
  const cfg = marketingConfig();
  const signedIn = Boolean(await getAuth());
  const book = bookingHref(cfg);
  const external = book.startsWith("http");

  return (
    <div className="bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
              <PhoneCall className="size-4" />
            </span>
            CallFlow AI
          </Link>
          <nav className="hidden gap-5 text-sm text-ink-2 md:flex" aria-label="Sections">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#roi" className="hover:text-ink">ROI</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href={signedIn ? "/dashboard" : "/login"} className={`${btn} hidden border border-line-strong py-2 hover:bg-slate-50 sm:inline-flex`}>
              {signedIn ? "Open dashboard" : "Try the live demo"}
            </Link>
            <a href={book} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={`${btn} bg-accent py-2 text-white hover:bg-teal-700`}>
              Book a demo
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-gradient-to-b from-accent-50 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <p className="inline-flex rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-semibold text-accent">{cfg.pilotOffer}</p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Every missed call is a job for your competitor.</h1>
              <p className="mt-5 max-w-xl text-lg text-ink-2">
                CallFlow AI answers after-hours calls, texts back every missed call in seconds, and follows up on open estimates, so your HVAC company books more jobs without hiring another dispatcher.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={book} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={`${btn} bg-accent text-white hover:bg-teal-700`}>
                  Book a 20-minute demo <ArrowRight className="size-4" />
                </a>
                <Link href="/login" className={`${btn} border border-line-strong bg-white hover:bg-slate-50`}>
                  Explore the live demo
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">No long contracts. Your team stays in control of every conversation.</p>
            </div>
            <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-ink bg-white p-4 shadow-2xl" aria-label="Example text conversation">
              <p className="mb-3 text-center text-xs font-medium text-muted">Tuesday · 9:41 PM</p>
              <div className="space-y-2 text-sm">
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">Our AC stopped working and it&apos;s 92 degrees inside. We have a newborn.</p>
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-white">I&apos;m sorry. I&apos;m treating this as an emergency. Our on-call tech Jake can be there tonight between 10:30 PM and 12:30 AM. Does that work?</p>
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">Yes please!!</p>
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-white">You&apos;re booked. Jake will call 30 minutes before he arrives.</p>
              </div>
              <p className="mt-4 rounded-lg bg-accent-50 px-3 py-2 text-center text-xs font-medium text-accent">+ Job booked while the office was closed</p>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Where HVAC revenue quietly leaks out</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { icon: Moon, title: "Calls after 6 PM go to voicemail", body: "When the AC dies at night, homeowners don't leave messages. They call the next company on Google." },
              { icon: FileText, title: "Estimates go quiet", body: "You drove out, measured, and quoted $8,000. Nobody had time to follow up, and the customer went with someone else." },
              { icon: Star, title: "Happy customers never leave reviews", body: "Great work doesn't turn into Google reviews unless someone asks at the right moment." },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-line p-6">
                <c.icon className="size-6 text-accent" />
                <h3 className="mt-4 font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="bg-canvas py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">How CallFlow works</h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-4">
              {[
                { icon: PhoneMissed, title: "1. Catch every lead", body: "Missed calls get an instant text back. After-hours calls are answered by an AI receptionist trained on your business." },
                { icon: ClipboardList, title: "2. Qualify & triage", body: "It collects name, address and the problem, flags emergencies, and checks that the address is in your service area." },
                { icon: CalendarCheck, title: "3. Book the job", body: "It offers real open slots from your calendar, books the appointment, and texts a confirmation." },
                { icon: BellRing, title: "4. Follow up automatically", body: "Estimate follow-ups on day 1, 3 and 7, appointment reminders, and review requests. It stops the moment the customer replies." },
              ].map((s) => (
                <li key={s.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-line">
                  <s.icon className="size-6 text-brand" />
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Built for HVAC, not a generic chatbot</h2>
              <p className="mt-4 text-ink-2">It knows the difference between &ldquo;my furnace is noisy&rdquo; and &ldquo;no heat, 50 degrees, elderly mother at home.&rdquo; It only quotes prices you&apos;ve approved, and it hands the conversation to a person whenever the customer asks.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                "Emergency detection & on-call routing",
                "Service-area check by ZIP code",
                "Books into real calendar availability",
                "Estimate recovery on day 1, 3, 7",
                "Missed-call text-back in seconds",
                "Reviews requested after every job",
                "Shared inbox with human takeover",
                "Dashboard of recovered revenue",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ROI */}
        <section id="roi" className="bg-canvas py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">What are missed calls costing you?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-2">Plug in your own numbers.</p>
            <div className="mt-8">
              <RoiCalculator />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Simple monthly pricing</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-2">{cfg.pilotOffer}</p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {Object.entries(PLANS).map(([key, p]) => (
              <div key={key} className={`flex flex-col rounded-2xl border p-6 ${p.highlight ? "border-accent ring-1 ring-accent" : "border-line"}`}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2 text-4xl font-semibold">
                  ${p.priceMonthly}
                  <span className="text-base font-normal text-muted">/mo</span>
                </p>
                <ul className="my-6 flex-1 space-y-2 text-sm text-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
                <a href={book} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={`${btn} ${p.highlight ? "bg-accent text-white hover:bg-teal-700" : "border border-line-strong hover:bg-slate-50"}`}>
                  Start with a pilot
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="bg-ink py-14 text-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Compliant texting", body: "Customers can reply STOP at any time, and every automated message stops immediately." },
              { icon: Clock, title: "You stay in control", body: "See every call and text. Take over any conversation with one click." },
              { icon: TrendingUp, title: "Results you can see", body: "A dashboard shows calls answered, jobs booked and estimates recovered." },
            ].map((t) => (
              <div key={t.title}>
                <t.icon className="size-6 text-teal-300" />
                <h3 className="mt-3 font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-slate-300">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Questions contractors ask</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line">
            {[
              ["Do I have to change my phone number or software?", "No. You keep your number. We forward missed and after-hours calls to CallFlow, and it works alongside the tools you already use."],
              ["Will it answer my phones right away?", "You choose. Most companies start with missed-call text-back and estimate follow-up, then turn on AI answering for after-hours calls once they're comfortable."],
              ["What happens with a real emergency?", "Emergencies are flagged instantly and routed to your on-call technician. For gas smells or CO alarms, callers get safety instructions first."],
              ["Will it quote prices?", "Only the prices you approve, like your diagnostic fee. Everything else is confirmed by your technician on site."],
              ["What if a customer wants a real person?", "They get one. The conversation is handed to your team immediately, and automation stops for that customer."],
              ["How long does setup take?", "Usually under a week. We set it up with you and test it before anything goes live."],
            ].map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {q}
                    <span className="text-muted transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-accent-50 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">See it answer an emergency call in 2 minutes</h2>
            <p className="mt-3 text-ink-2">Open the live demo and place a simulated after-hours call, or book a quick walkthrough.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href={book} {...(external ? { target: "_blank", rel: "noopener" } : {})} className={`${btn} bg-accent text-white hover:bg-teal-700`}>
                Book a demo
              </a>
              <Link href="/login" className={`${btn} border border-line-strong bg-white hover:bg-slate-50`}>
                Try the live demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} CallFlow AI{cfg.region ? ` · Serving HVAC companies in ${cfg.region}` : ""}</p>
          <p className="flex flex-wrap gap-4">
            {cfg.contactEmail ? <a href={`mailto:${cfg.contactEmail}`} className="hover:text-ink">{cfg.contactEmail}</a> : null}
            {cfg.contactPhone ? <a href={`tel:${cfg.contactPhone}`} className="hover:text-ink">{cfg.contactPhone}</a> : null}
            <Link href="/one-pager" className="hover:text-ink">One-page overview (PDF)</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
