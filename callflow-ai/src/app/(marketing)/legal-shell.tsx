import { PhoneCall } from "lucide-react";
import Link from "next/link";
import { legalConfig } from "@/lib/legal";

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  const cfg = legalConfig();
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
              <PhoneCall className="size-3.5" />
            </span>
            CallFlow AI
          </Link>
          <nav className="flex gap-4 text-sm text-ink-2">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {!cfg.detailsComplete ? (
          <p role="note" className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Template.</strong> The operator&apos;s contact details haven&apos;t been filled in yet. Set CONTACT_EMAIL (or LEGAL_CONTACT_EMAIL) to complete this page.
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Effective date: {cfg.effectiveDate}</p>
        <article className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-ink [&_ul]:space-y-1">
          {children}
        </article>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Questions? Contact {cfg.legalName} at {cfg.contactEmail} or {cfg.mailingAddress}.
        </p>
      </main>
    </div>
  );
}
