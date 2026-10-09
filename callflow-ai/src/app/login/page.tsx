import Link from "next/link";
import { redirect } from "next/navigation";
import { Headphones, PhoneCall, ShieldCheck, TrendingUp } from "lucide-react";
import { getAuth } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getAuth()) redirect("/dashboard");
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
            <PhoneCall className="size-4" />
          </span>
          CallFlow AI
        </Link>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Answer every lead. Book more jobs. Recover the revenue you&apos;re losing.</h1>
          <p className="mt-4 text-slate-300">The AI front office built for HVAC companies with 1–30 technicians.</p>
          <ul className="mt-8 space-y-4 text-sm text-slate-200">
            <li className="flex gap-3"><Headphones className="mt-0.5 size-4 text-teal-300" /> 24/7 AI receptionist that triages emergencies and books real calendar slots</li>
            <li className="flex gap-3"><TrendingUp className="mt-0.5 size-4 text-teal-300" /> Automatic estimate follow-ups that stop the moment a customer decides</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 text-teal-300" /> SMS consent, opt-out, and audit logging built in</li>
          </ul>
        </div>
        <p className="text-xs text-slate-400">Demo environment · calls and SMS are simulated unless providers are configured.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2 text-lg font-semibold text-ink">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
                <PhoneCall className="size-4" />
              </span>
              CallFlow AI
            </div>
          </div>
          <h2 className="text-xl font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Welcome back. Use the demo account to explore Summit Peak HVAC.</p>
          <LoginForm />
          <p className="mt-8 text-center text-xs text-muted">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
