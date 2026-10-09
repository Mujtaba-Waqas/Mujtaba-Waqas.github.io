"use client";

import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resolveReviewAction, sendReviewLinkAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";

export function ResolveReview({ id, customer }: { id: string; customer: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CheckCircle2 /> Resolve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Resolve feedback from ${customer}`} description="Record how the issue was handled. This hands the conversation back to automation.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await resolveReviewAction({ id, notes });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Marked resolved");
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Textarea aria-label="Resolution notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Olivia called; Dev returned and re-seated the blower wheel at no charge." />
            <div className="flex justify-end">
              <Button disabled={pending || notes.trim().length < 3}>{pending ? <Loader2 className="animate-spin" /> : null} Save resolution</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SendReviewLink({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendReviewLinkAction({ id });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Review link sent");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Send review link
    </Button>
  );
}
