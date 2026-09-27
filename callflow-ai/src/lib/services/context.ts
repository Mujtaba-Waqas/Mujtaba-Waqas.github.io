import type { Role } from "@prisma/client";
import { db } from "../db";
import { parseSettings } from "../validation/settings";

/** Everything a service needs to scope work to one tenant. Built from the session (or a verified system trigger). */
export interface TenantContext {
  orgId: string;
  userId: string | null;
  role: Role;
  /** Override "now" (tests); defaults to the real clock. */
  now?: Date;
}

export function nowOf(ctx: TenantContext) {
  return ctx.now ?? new Date();
}

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function systemContext(orgId: string, now?: Date): TenantContext {
  return { orgId, userId: null, role: "OWNER", now };
}

export async function loadOrg(ctx: TenantContext) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  return { org, settings: parseSettings(org.settings) };
}

export function toTenantContext(auth: { orgId: string; userId: string; role: Role }): TenantContext {
  return { orgId: auth.orgId, userId: auth.userId, role: auth.role };
}
