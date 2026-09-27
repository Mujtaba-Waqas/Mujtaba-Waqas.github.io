"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { demoLoginAction, loginAction } from "./actions";

export function LoginForm() {
  const [error, formAction, pending] = useActionState(loginAction, null);
  const [demoPending, startDemo] = useTransition();
  const [demoError, setDemoError] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-teal-200 bg-accent-50 p-4">
        <p className="text-sm font-medium text-ink">Demo account — Summit Peak HVAC</p>
        <p className="mt-1 text-xs text-ink-2">
          <span className="font-mono">olivia@summitpeakhvac.demo</span> · <span className="font-mono">CallFlowDemo!2026</span>
        </p>
        <Button
          type="button"
          variant="accent"
          className="mt-3 w-full"
          disabled={demoPending}
          onClick={() =>
            startDemo(async () => {
              const err = await demoLoginAction();
              if (err) setDemoError(err);
            })
          }
        >
          {demoPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Sign in with demo account
        </Button>
        {demoError ? <p role="alert" className="mt-2 text-xs text-red-600">{demoError}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or sign in with email <span className="h-px flex-1 bg-line" />
      </div>
      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  );
}

