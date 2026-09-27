import { ScrollText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE_PERMISSIONS } from "@/lib/auth/rbac";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime, formatPhone } from "@/lib/format";
import { loadOrg, toTenantContext } from "@/lib/services/context";
import { appUrl } from "@/lib/app-url";
import { providerStatus } from "@/lib/providers";
import { PasswordForm } from "./password-form";
import { PhoneSettingsForm } from "./phone-settings";
import { CompanyForm, HoursForm, ReviewPolicyForm, ServiceAreaManager, TeamManager } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const auth = await requireAuth("settings:manage");
  const { org, settings } = await loadOrg(toTenantContext(auth));
  const [areas, employees, logs, memberships] = await Promise.all([
    db.serviceArea.findMany({ where: { organizationId: auth.orgId }, orderBy: [{ county: "asc" }, { city: "asc" }] }),
    db.employee.findMany({ where: { organizationId: auth.orgId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.auditLog.findMany({ where: { organizationId: auth.orgId }, orderBy: { createdAt: "desc" }, take: 25, include: { user: { select: { name: true } } } }),
    db.membership.findMany({ where: { organizationId: auth.orgId }, include: { user: { select: { name: true, email: true, lastLoginAt: true } } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Company profile, hours, territory, team, and compliance."
        actions={
          <Button asChild variant="outline">
            <Link href="/onboarding">Re-run setup wizard</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyForm
              initial={{ name: org.name, phone: formatPhone(org.phone), email: org.email ?? "", website: org.website ?? "", address: org.address ?? "", city: org.city ?? "", state: org.state ?? "UT", timezone: org.timezone as "America/Denver", googleReviewUrl: org.googleReviewUrl ?? "" }}
            />
          </CardContent>
        </Card>
        <Card id="hours">
          <CardHeader>
            <div>
              <CardTitle>Business hours & emergency policy</CardTitle>
              <CardDescription>Drives the AI greeting, availability, and after-hours routing.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <HoursForm initial={{ businessHours: settings.businessHours, emergency: settings.emergency, bufferMinutes: settings.scheduling.bufferMinutes }} technicians={employees.filter((e) => e.kind === "TECHNICIAN" && e.active).map((e) => ({ id: e.id, name: e.name }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Service territory</CardTitle>
              <CardDescription>{areas.length} ZIP codes across {new Set(areas.map((a) => a.county)).size} counties. Callers outside these ZIPs are politely declined.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ServiceAreaManager areas={areas.map((a) => ({ id: a.id, zip: a.zip, city: a.city, county: a.county }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Team</CardTitle>
              <CardDescription>Technicians appear on the calendar and in availability.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TeamManager employees={employees.map((e) => ({ id: e.id, name: e.name, title: e.title, kind: e.kind, active: e.active, isOnCall: e.isOnCall, color: e.color, phone: formatPhone(e.phone) }))} />
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">User accounts & roles</p>
              <ul className="divide-y divide-line text-sm">
                {memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2">
                    <span>
                      {m.user.name} <span className="text-xs text-muted">{m.user.email}</span>
                    </span>
                    <Badge tone={m.role === "OWNER" ? "navy" : "neutral"} title={`${ROLE_PERMISSIONS[m.role].length} permissions`}>
                      {m.role.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
        <Card id="phone" className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Phone & alerts</CardTitle>
              <CardDescription>How live calls to your CallFlow number are handled, and who gets alerted.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PhoneSettingsForm
              webhookBase={appUrl()}
              liveSms={providerStatus().twilio.liveSms}
              initial={{
                mode: settings.phone.mode,
                callflowNumber: settings.phone.callflowNumber ? formatPhone(settings.phone.callflowNumber) : "",
                officeNumber: settings.phone.officeNumber ? formatPhone(settings.phone.officeNumber) : "",
                ringSeconds: settings.phone.ringSeconds,
                alertPhone: settings.phone.alertPhone ? formatPhone(settings.phone.alertPhone) : "",
                voicemail: settings.phone.voicemail,
                missedCallMessage: settings.phone.missedCallMessage,
                quietHoursStart: settings.sms.quietHoursStart,
                quietHoursEnd: settings.sms.quietHoursEnd,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Review requests</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewPolicyForm initial={settings.reviews} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" /> Security & compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ink-2">
            <p>
              <strong className="text-ink">SMS consent:</strong> STOP, UNSUBSCRIBE, CANCEL, END and QUIT opt a customer out instantly. All automated and staff texts are blocked until they reply START. Consent timestamps are stored per customer.
            </p>
            <p>
              <strong className="text-ink">Call recording:</strong> recording is {settings.receptionist.recordingEnabled ? "enabled with a spoken disclosure at the start of every call" : "disabled"}. Some states (e.g. California, Washington, Florida) require all-party consent — keep the disclosure on and confirm requirements with counsel.
            </p>
            <p>
              <strong className="text-ink">Access:</strong> role-based permissions (Owner, Admin, Dispatcher, Technician), server-side tenant isolation, httpOnly session cookies, and an audit log of sensitive actions.
            </p>
            <p>
              <strong className="text-ink">A2P 10DLC:</strong> production SMS in the US requires brand & campaign registration through Twilio before go-live.
            </p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Your password</CardTitle>
              <CardDescription>Signed in as {auth.user.email}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4" /> Audit log
            </CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
              </tr>
            </THead>
            <tbody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{formatDateTime(l.createdAt, org.timezone)}</TD>
                  <TD>{l.user?.name ?? <span className="text-muted">System / automation</span>}</TD>
                  <TD className="font-mono text-xs">{l.action}</TD>
                  <TD className="text-xs">
                    {l.entityType}
                    {l.entityId ? <span className="text-muted"> · {l.entityId.slice(-8)}</span> : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
