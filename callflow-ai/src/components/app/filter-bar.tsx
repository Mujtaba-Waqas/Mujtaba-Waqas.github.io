import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

/** GET-form filter bar: works without JavaScript and keeps filters in the URL. */
export function FilterBar({ q, placeholder, selects, extra }: { q?: string; placeholder: string; selects: { name: string; label: string; value?: string; options: { value: string; label: string }[] }[]; extra?: React.ReactNode }) {
  return (
    <form className="mb-4 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <Select key={s.name} name={s.name} defaultValue={s.value ?? ""} aria-label={s.label} className="sm:w-44">
          <option value="">{s.label}: All</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {extra}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
