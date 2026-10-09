import "server-only";
import { z } from "zod";
import { can, ForbiddenError, type Permission } from "./auth/rbac";
import { getAuth, type AuthContext } from "./auth/session";
import { ConflictError, NotFoundError, ValidationError, toTenantContext, type TenantContext } from "./services/context";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Wraps a server action: authenticates from the session cookie, checks the
 * permission, validates input with Zod, and maps domain errors to safe messages.
 * The tenant is always derived from the session — never from the payload.
 * (Next.js server actions also enforce an Origin/Host check against CSRF.)
 */
export function secureAction<S extends z.ZodTypeAny, T>(
  permission: Permission,
  schema: S,
  handler: (input: z.infer<S>, ctx: TenantContext, auth: AuthContext) => Promise<T | ActionResult<T>>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    let auth: AuthContext | null;
    try {
      auth = await getAuth();
    } catch (err) {
      console.error("[action] session lookup failed", err);
      return { ok: false, error: "We couldn't reach the database. Please try again in a moment." };
    }
    if (!auth) return { ok: false, error: "Your session has expired. Please sign in again." };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return { ok: false, error: flat.formErrors[0] ?? "Please fix the highlighted fields.", fieldErrors: flat.fieldErrors as Record<string, string[]> };
    }
    try {
      if (!can(auth.role, permission)) throw new ForbiddenError(permission);
      const out = await handler(parsed.data, toTenantContext(auth), auth);
      if (out && typeof out === "object" && "ok" in (out as object)) return out as ActionResult<T>;
      return { ok: true, data: out as T };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError || err instanceof ForbiddenError) return { ok: false, error: err.message };
      console.error("[action] unexpected error", err);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  };
}
