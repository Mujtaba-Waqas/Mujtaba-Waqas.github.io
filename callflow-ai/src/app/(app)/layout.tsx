import { FlaskConical } from "lucide-react";
import { Brand, SidebarNav } from "@/components/app/sidebar";
import { MobileNav, OrgSwitcher, UserMenu } from "@/components/app/topbar";
import { can, NAV_PERMISSIONS } from "@/lib/auth/rbac";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { providerStatus } from "@/lib/providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth();
  const allowed = Object.entries(NAV_PERMISSIONS)
    .filter(([, perm]) => can(auth.role, perm))
    .map(([href]) => href);
  const [unread, urgentLeads, sub] = await Promise.all([
    db.conversation.count({ where: { organizationId: auth.orgId, unreadCount: { gt: 0 } } }),
    db.lead.count({ where: { organizationId: auth.orgId, status: { in: ["NEW"] } } }),
    db.subscription.findUnique({ where: { organizationId: auth.orgId }, select: { plan: true, isDemo: true } }),
  ]);
  const badges = { "/inbox": unread, "/leads": urgentLeads };
  const ps = providerStatus();
  const demo = !ps.twilio.liveSms;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink lg:flex">
        <Brand />
        <SidebarNav allowed={allowed} badges={badges} />
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-400">
          <p className="font-medium text-slate-200">{auth.org.name}</p>
          <p>{sub ? `${PLANS[sub.plan].name} plan${sub.isDemo ? " · Demo billing" : ""}` : "No plan"}</p>
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <MobileNav allowed={allowed} badges={badges} />
          <OrgSwitcher current={auth.org} memberships={auth.memberships} />
          <div className="flex-1" />
          {demo ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-flex" title="No real calls or texts are placed. Configure Twilio + SMS_LIVE_SENDING=true to go live.">
              <FlaskConical className="size-3.5" /> Demo mode · calls &amp; SMS simulated
            </span>
          ) : null}
          <UserMenu name={auth.user.name} email={auth.user.email} role={auth.role} />
        </div>
      </header>
      {process.env.PUBLIC_DEMO === "true" ? (
        <div className="border-b border-teal-200 bg-accent-50 px-4 py-2 text-center text-xs text-ink-2 sm:px-6">
          <strong className="text-ink">Public demo</strong> — Summit Peak HVAC is a fictional company. No real calls or texts are sent, and all data resets every night.
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
