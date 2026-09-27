import type { Actor, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import { nowOf, type TenantContext } from "./context";

export interface EventInput {
  leadId?: string | null;
  customerId?: string | null;
  type: string;
  title: string;
  detail?: string | null;
  actor?: Actor;
  metadata?: Prisma.InputJsonValue;
}

export async function logEvent(ctx: TenantContext, e: EventInput, tx: Tx | typeof db = db) {
  return tx.leadEvent.create({
    data: {
      organizationId: ctx.orgId,
      leadId: e.leadId ?? null,
      customerId: e.customerId ?? null,
      type: e.type,
      title: e.title,
      detail: e.detail ?? null,
      actor: e.actor ?? "SYSTEM",
      metadata: e.metadata,
      createdAt: nowOf(ctx),
    },
  });
}
