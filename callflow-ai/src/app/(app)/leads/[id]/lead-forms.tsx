"use client";

import type { Urgency } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addLeadNoteAction, updateLeadAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { URGENCY } from "@/lib/labels";

export function LeadEditForm({ lead, employees }: { lead: { id: string; assignedEmployeeId: string | null; urgency: Urgency; estimatedValueCents: number | null; notes: string | null }; employees: { id: string; name: string }[] }) {
  const [assigned, setAssigned] = useState(lead.assignedEmployeeId ?? "");
  const [urgency, setUrgency] = useState<Urgency>(lead.urgency);
  const [value, setValue] = useState(lead.estimatedValueCents ? String(lead.estimatedValueCents / 100) : "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateLeadAction({ id: lead.id, assignedEmployeeId: assigned || null, urgency, estimatedValue: value === "" ? null : Number(value), notes });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Lead updated");
          router.refresh();
        });
      }}
    >
      <Field label="Assigned to" htmlFor="assigned">
        <Select id="assigned" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
          <option value="">Unassigned</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Urgency" htmlFor="urgency">
          <Select id="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
            {Object.entries(URGENCY).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Est. value ($)" htmlFor="value">
          <Input id="value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save changes
      </Button>
    </form>
  );
}

export function NoteForm({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addLeadNoteAction({ id, note });
          if (!r.ok) return void toast.error(r.error);
          setNote("");
          router.refresh();
        });
      }}
    >
      <Input aria-label="Add a note" placeholder="Add a note to the timeline…" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" variant="secondary" disabled={pending || !note.trim()}>
        Add
      </Button>
    </form>
  );
}
