import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import type { TenantContext } from "./context";

export async function audit(
  ctx: TenantContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Prisma.InputJsonValue,
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({
    data: { organizationId: ctx.orgId, userId: ctx.userId, action, entityType, entityId, metadata },
  });
}
