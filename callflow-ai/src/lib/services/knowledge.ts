import type { KnowledgeCategory } from "@prisma/client";
import { db } from "../db";
import type { KnowledgeDoc } from "../domain/knowledge";
import { audit } from "./audit";
import { NotFoundError, type TenantContext } from "./context";

export async function getKnowledgeDocs(ctx: TenantContext): Promise<KnowledgeDoc[]> {
  const docs = await db.knowledgeDocument.findMany({ where: { organizationId: ctx.orgId, isActive: true } });
  return docs.map((d) => ({ id: d.id, category: d.category, title: d.title, content: d.content, tags: d.tags }));
}

export async function upsertKnowledgeDoc(ctx: TenantContext, input: { id?: string | null; category: KnowledgeCategory; title: string; content: string; tags: string[]; isActive: boolean }) {
  if (input.id) {
    const existing = await db.knowledgeDocument.findFirst({ where: { id: input.id, organizationId: ctx.orgId } });
    if (!existing) throw new NotFoundError("Knowledge document");
    await db.knowledgeDocument.update({ where: { id: input.id }, data: { category: input.category, title: input.title, content: input.content, tags: input.tags, isActive: input.isActive } });
    await audit(ctx, "knowledge.updated", "KnowledgeDocument", input.id);
    return input.id;
  }
  const doc = await db.knowledgeDocument.create({ data: { organizationId: ctx.orgId, category: input.category, title: input.title, content: input.content, tags: input.tags, isActive: input.isActive } });
  await audit(ctx, "knowledge.created", "KnowledgeDocument", doc.id);
  return doc.id;
}

export async function deleteKnowledgeDoc(ctx: TenantContext, id: string) {
  const { count } = await db.knowledgeDocument.deleteMany({ where: { id, organizationId: ctx.orgId } });
  if (!count) throw new NotFoundError("Knowledge document");
  await audit(ctx, "knowledge.deleted", "KnowledgeDocument", id);
}
