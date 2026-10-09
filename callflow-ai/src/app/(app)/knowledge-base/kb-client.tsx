"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteKnowledgeAction, saveKnowledgeAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

type Doc = { id?: string; category: string; title: string; content: string; tags: string; isActive: boolean };
const CATS = ["COMPANY", "SERVICES", "HOURS", "SERVICE_AREA", "FAQ", "PRICING", "FINANCING", "EMERGENCY", "ESCALATION", "PROHIBITED"] as const;

export function DocDialog({ doc }: { doc?: Doc }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Doc>(doc ?? { category: "FAQ", title: "", content: "", tags: "", isActive: true });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      {doc ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Edit ${doc.title}`}>
          <Pencil />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add entry
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={doc ? "Edit entry" : "New knowledge entry"} description="Write it the way you'd want it said to a customer.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await saveKnowledgeAction({ id: d.id ?? null, category: d.category as (typeof CATS)[number], title: d.title, content: d.content, tags: d.tags, isActive: d.isActive });
                if (!r.ok) {
                  setErrors(r.fieldErrors ?? {});
                  return void toast.error(r.error);
                }
                toast.success("Saved");
                setOpen(false);
                if (!doc) setD({ category: "FAQ", title: "", content: "", tags: "", isActive: true });
                router.refresh();
              });
            }}
          >
            <Field label="Category" htmlFor="cat">
              <Select id="cat" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="title" error={errors.title?.[0]}>
              <Input id="title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
            </Field>
            <Field label="Content" htmlFor="content" error={errors.content?.[0]} hint={d.category === "PRICING" ? "Only prices written here can be quoted by the AI." : undefined}>
              <Textarea id="content" rows={6} value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} />
            </Field>
            <Field label="Tags (comma-separated)" htmlFor="tags" hint="Improves retrieval, e.g. “price, diagnostic, service call”.">
              <Input id="tags" value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.isActive} onCheckedChange={(v) => setD({ ...d, isActive: v })} aria-label="Active" /> Active
            </label>
            <div className="flex justify-end">
              <Button disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteDocButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Delete ${title}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete “${title}”?`)) return;
        start(async () => {
          const r = await deleteKnowledgeAction({ id });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Deleted");
          router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
