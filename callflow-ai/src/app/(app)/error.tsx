"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.name === "ForbiddenError" || /permission/i.test(error.message);
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <AlertTriangle className="mx-auto mb-3 size-8 text-amber-500" />
      <h1 className="text-lg font-semibold text-ink">{forbidden ? "You don't have access to this page" : "Something went wrong"}</h1>
      <p className="mt-1 text-sm text-muted">{forbidden ? "Ask an owner or admin to update your role." : "The error has been logged. Try again, and contact support if it keeps happening."}</p>
      {error.digest ? <p className="mt-2 font-mono text-[11px] text-slate-400">Ref: {error.digest}</p> : null}
      {!forbidden ? (
        <Button className="mt-4" onClick={reset}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
