"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getAuth } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

const DEMO_EMAIL = "olivia@summitpeakhvac.demo";

async function doLogin(email: string, password: string) {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 10, 60_000).ok) return "Too many sign-in attempts. Please wait a minute.";
  const user = await db.user.findUnique({ where: { email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  // Constant-ish time: always run a bcrypt comparison.
  const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok) return "Invalid email or password.";
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, user.memberships[0]?.organizationId ?? null);
  return null;
}

export async function loginAction(_: string | null, formData: FormData): Promise<string | null> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return "Enter a valid email and password.";
  const err = await doLogin(parsed.data.email, parsed.data.password);
  if (err) return err;
  redirect("/dashboard");
}

/** One-click demo login. Disabled when DEMO_LOGIN_ENABLED=false (set that in production). */
export async function demoLoginAction(): Promise<string | null> {
  if (process.env.DEMO_LOGIN_ENABLED === "false") return "Demo login is disabled on this deployment.";
  const password = process.env.DEMO_PASSWORD ?? "CallFlowDemo!2026";
  const err = await doLogin(DEMO_EMAIL, password);
  if (err) return "Demo account not found — run `npm run db:seed` first.";
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchOrganizationAction(organizationId: string) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  // Only switch to organizations the user actually belongs to.
  const membership = auth.memberships.find((m) => m.organizationId === organizationId);
  if (!membership) return;
  await db.session.update({ where: { id: auth.sessionId }, data: { activeOrganizationId: organizationId } });
  redirect("/dashboard");
}

const passwordSchema = z
  .object({ current: z.string().min(1).max(200), next: z.string().min(12, "Use at least 12 characters").max(200), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

/** Change your own password; signs out every other session. */
export async function changePasswordAction(input: { current: string; next: string; confirm: string }): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Please sign in again." };
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (auth.user.email.endsWith("@summitpeakhvac.demo")) return { ok: false, error: "The shared demo account's password can't be changed." };
  const ip = clientIp(await headers());
  if (!rateLimit(`pwchange:${ip}`, 5, 60_000).ok) return { ok: false, error: "Too many attempts. Wait a minute." };
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { ok: false, error: "Current password is incorrect." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  await db.session.deleteMany({ where: { userId: user.id, id: { not: auth.sessionId } } });
  await db.auditLog.create({ data: { organizationId: auth.orgId, userId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id } });
  return { ok: true };
}
