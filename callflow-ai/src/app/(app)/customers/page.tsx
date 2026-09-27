import type { Prisma } from "@prisma/client";
import { Users } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatDate, formatPhone } from "@/lib/format";

export const metadata = { title: "Customers" };
const PAGE = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("customers:write");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const where: Prisma.CustomerWhereInput = { organizationId: auth.orgId };
  if (sp.q) {
    const digits = sp.q.replace(/\D/g, "");
    where.OR = [
      { firstName: { contains: sp.q, mode: "insensitive" } },
      { lastName: { contains: sp.q, mode: "insensitive" } },
      { email: { contains: sp.q, mode: "insensitive" } },
      { address: { contains: sp.q, mode: "insensitive" } },
      { city: { contains: sp.q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  if (sp.segment === "plan") where.hasMaintenancePlan = true;
  if (sp.segment === "optout") where.smsOptedOut = true;
  if (sp.segment === "open_estimate") where.estimates = { some: { status: { in: ["SENT", "VIEWED"] } } };
  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { _count: { select: { appointments: true, calls: true, estimates: true } }, reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, rating: true } } },
    }),
  ]);
  const pages = Math.ceil(total / PAGE);
  const link = (p: number) => `/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.segment ? { segment: sp.segment } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Customers" description={`${total} homeowners in your book of business.`} />
      <FilterBar
        q={sp.q}
        placeholder="Search name, phone, email, address…"
        selects={[{ name: "segment", label: "Segment", value: sp.segment, options: [{ value: "plan", label: "Comfort Club members" }, { value: "open_estimate", label: "Open estimate" }, { value: "optout", label: "SMS opted out" }] }]}
      />
      <Card>
        {customers.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Phone</TH>
                <TH className="hidden md:table-cell">Address</TH>
                <TH className="text-right">Jobs</TH>
                <TH className="text-right">Calls</TH>
                <TH className="hidden lg:table-cell">Review</TH>
                <TH className="hidden lg:table-cell">Since</TH>
              </tr>
            </THead>
            <tbody>
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                      <Avatar name={customerName(c)} size="sm" color="#334155" />
                      <span>
                        <span className="font-medium text-ink hover:underline">{customerName(c)}</span>
                        <span className="mt-0.5 flex gap-1">
                          {c.hasMaintenancePlan ? <Badge tone="teal">Comfort Club</Badge> : null}
                          {c.smsOptedOut ? <Badge tone="red">SMS opted out</Badge> : null}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap tabular">{formatPhone(c.phone)}</TD>
                  <TD className="hidden md:table-cell">{c.address ? `${c.address}, ${c.city ?? ""}` : "—"}</TD>
                  <TD className="text-right tabular">{c._count.appointments}</TD>
                  <TD className="text-right tabular">{c._count.calls}</TD>
                  <TD className="hidden lg:table-cell">{c.reviews[0] ? `${c.reviews[0].status.toLowerCase().replace(/_/g, " ")}${c.reviews[0].rating ? ` · ${c.reviews[0].rating}/5` : ""}` : "—"}</TD>
                  <TD className="hidden lg:table-cell">{formatDate(c.createdAt)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={Users} title="No customers found" description="Customers are created automatically from calls, texts and web leads." />
        )}
      </Card>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={link(page - 1)}>Previous</Link>
              </Button>
            ) : null}
            {page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={link(page + 1)}>Next</Link>
              </Button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
