"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-slate-800">
      <Printer className="size-4" /> Save as PDF / Print
    </button>
  );
}
