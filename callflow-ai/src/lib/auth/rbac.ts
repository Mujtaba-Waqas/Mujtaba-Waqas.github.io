import type { Role } from "@prisma/client";

export type Permission =
  | "dashboard:view"
  | "calls:view"
  | "calls:simulate"
  | "inbox:view"
  | "inbox:send"
  | "leads:write"
  | "customers:write"
  | "calendar:write"
  | "estimates:write"
  | "automations:manage"
  | "reviews:manage"
  | "knowledge:manage"
  | "receptionist:manage"
  | "analytics:view"
  | "integrations:manage"
  | "billing:manage"
  | "settings:manage"
  | "team:manage"
  | "audit:view";

const ALL: Permission[] = [
  "dashboard:view", "calls:view", "calls:simulate", "inbox:view", "inbox:send", "leads:write", "customers:write",
  "calendar:write", "estimates:write", "automations:manage", "reviews:manage", "knowledge:manage", "receptionist:manage",
  "analytics:view", "integrations:manage", "billing:manage", "settings:manage", "team:manage", "audit:view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== "billing:manage"),
  DISPATCHER: [
    "dashboard:view", "calls:view", "calls:simulate", "inbox:view", "inbox:send", "leads:write", "customers:write",
    "calendar:write", "estimates:write", "reviews:manage", "analytics:view",
  ],
  TECHNICIAN: ["calls:view", "inbox:view", "calendar:write"],
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`You don't have permission to do that (${permission}).`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}

/** Pages → permission, used by the sidebar and page guards. */
export const NAV_PERMISSIONS: Record<string, Permission> = {
  "/dashboard": "dashboard:view",
  "/inbox": "inbox:view",
  "/calls": "calls:view",
  "/leads": "leads:write",
  "/calendar": "calendar:write",
  "/estimates": "estimates:write",
  "/customers": "customers:write",
  "/reviews": "reviews:manage",
  "/automations": "automations:manage",
  "/analytics": "analytics:view",
  "/ai-receptionist": "receptionist:manage",
  "/knowledge-base": "knowledge:manage",
  "/integrations": "integrations:manage",
  "/billing": "billing:manage",
  "/settings": "settings:manage",
};
