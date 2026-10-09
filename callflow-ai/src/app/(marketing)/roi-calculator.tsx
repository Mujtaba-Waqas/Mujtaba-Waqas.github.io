"use client";

import { useState } from "react";

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Uses only the visitor's own numbers — no invented industry statistics. */
export function RoiCalculator() {
  const [missed, setMissed] = useState(8);
  const [bookRate, setBookRate] = useState(30);
  const [ticket, setTicket] = useState(450);
  const [estimates, setEstimates] = useState(6);
  const [estValue, setEstValue] = useState(7000);
  const monthlyMissed = missed * 4.3 * (bookRate / 100) * ticket;
  const oneEstimate = estValue;
  const field = "mt-1 w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-sm tabular";
  return (
    <div className="grid gap-6 rounded-2xl border border-line bg-surface p-6 shadow-sm md:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2">
          Missed or after-hours calls per week
          <input type="number" min={0} className={field} value={missed} onChange={(e) => setMissed(Number(e.target.value) || 0)} />
        </label>
        <label>
          % that would have booked
          <input type="number" min={0} max={100} className={field} value={bookRate} onChange={(e) => setBookRate(Number(e.target.value) || 0)} />
        </label>
        <label>
          Average repair ticket ($)
          <input type="number" min={0} className={field} value={ticket} onChange={(e) => setTicket(Number(e.target.value) || 0)} />
        </label>
        <label>
          Open estimates per month
          <input type="number" min={0} className={field} value={estimates} onChange={(e) => setEstimates(Number(e.target.value) || 0)} />
        </label>
        <label>
          Average install estimate ($)
          <input type="number" min={0} className={field} value={estValue} onChange={(e) => setEstValue(Number(e.target.value) || 0)} />
        </label>
      </div>
      <div className="flex flex-col justify-center rounded-xl bg-ink p-6 text-white">
        <p className="text-sm text-slate-300">Revenue at risk from missed calls</p>
        <p className="mt-1 text-4xl font-semibold tabular">
          {money(monthlyMissed)}
          <span className="text-base font-normal text-slate-300"> / month</span>
        </p>
        <p className="mt-4 text-sm text-slate-300">
          Winning back just <strong className="text-white">one</strong> of your {estimates} open estimates is worth <strong className="text-white">{money(oneEstimate)}</strong>.
        </p>
        <p className="mt-4 text-xs text-slate-400">Your numbers, your math. Estimates only — results vary by company.</p>
      </div>
    </div>
  );
}
