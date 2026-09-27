"use client";

import type { AutomationKey } from "@prisma/client";
import { Loader2, Play } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { runAutomationAction } from "@/app/(app)/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

export function RunAutomationButton({ automationKey, label = "Run now (demo)", variant = "outline", size = "sm", onDone }: { automationKey: AutomationKey; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; onDone?: (log: { level: string; message: string }[]) => void }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runAutomationAction({ key: automationKey });
          if (!r.ok) return void toast.error(r.error);
          const d = r.data!;
          const first = d.log.find((l) => l.level === "action" || l.level === "stop")?.message ?? d.log[0]?.message;
          toast.success(`${d.actions} action${d.actions === 1 ? "" : "s"} taken${d.skipped ? `, ${d.skipped} stopped/skipped` : ""}`, { description: first });
          onDone?.(d.log);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />}
      {label}
    </Button>
  );
}
