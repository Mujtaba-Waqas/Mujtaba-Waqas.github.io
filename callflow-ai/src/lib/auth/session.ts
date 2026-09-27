import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { assertCan, type Permission } from "./rbac";

export const SESSION_COOKIE = "cf_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, organizationId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, activeOrganizationId: organizationId, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent: ua },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export interface AuthContext {
  sessionId: string;
  userId: string;
  user: { id: string; name: string; email: string };
  orgId: string;
  org: { id: string; name: string; slug: string };
  role: Role;
  memberships: { organizationId: string; name: string; role: Role }[];
}

/** Resolve the current session (memoized per request). Organization comes from the session, never from client input. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { include: { organization: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const memberships = session.user.memberships;
  if (!memberships.length) return null;
  const active = memberships.find((m) => m.organizationId === session.activeOrganizationId) ?? memberships[0];
  return {
    sessionId: session.id,
    userId: session.userId,
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    orgId: active.organizationId,
    org: { id: active.organization.id, name: active.organization.name, slug: active.organization.slug },
    role: active.role,
    memberships: memberships.map((m) => ({ organizationId: m.organizationId, name: m.organization.name, role: m.role })),
  };
});

export async function requireAuth(permission?: Permission): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (permission) assertCan(auth.role, permission);
  return auth;
}

/** For route handlers: returns null instead of redirecting. */
export async function getApiAuth(permission?: Permission) {
  const auth = await getAuth();
  if (!auth) return null;
  if (permission) assertCan(auth.role, permission);
  return auth;
}
