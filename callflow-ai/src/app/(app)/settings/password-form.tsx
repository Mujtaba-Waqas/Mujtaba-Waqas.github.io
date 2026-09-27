"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function PasswordForm() {
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePasswordAction(v);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Password changed. Other devices were signed out");
          setV({ current: "", next: "", confirm: "" });
        });
      }}
    >
      <Field label="Current password" htmlFor="pw-cur">
        <Input id="pw-cur" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />
      </Field>
      <Field label="New password (12+ characters)" htmlFor="pw-new">
        <Input id="pw-new" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-conf">
        <Input id="pw-conf" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
      </Field>
      <div className="sm:col-span-3">
        <Button size="sm" variant="outline" disabled={pending || !v.current || !v.next}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
        </Button>
      </div>
    </form>
  );
}
