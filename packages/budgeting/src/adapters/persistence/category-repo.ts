/**
 * category-repo.ts — Drizzle adapter for CategoryRepo port
 * MUST NOT be imported by domain/application layers.
 * Each write: withTenantTx → SQL → writeAudit → writeOutbox.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { Category } from "../../domain/category";
import type { CategoryRepo } from "../../ports/category-repo";

function rowToCategory(row: {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  scope: string;
  archived_at: Date | null;
  created_at: Date;
  actor_user_id: string;
}): Category {
  const { Category: CategoryClass } = require("../../domain/category");
  return new CategoryClass(
    row.id,
    row.tenant_id,
    row.name,
    row.parent_id ?? null,
    row.scope as any,
    row.archived_at ? new Date(row.archived_at) : null,
    new Date(row.created_at),
    row.actor_user_id,
  );
}

export class DrizzleCategoryRepo implements CategoryRepo {
  async create(category: Category): Promise<void> {
    const tid = TenantId(category.tenantId);
    const uid = UserId(category.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`INSERT INTO budgeting.categories
              (id, tenant_id, name, parent_id, scope, archived_at, created_at, actor_user_id)
            VALUES
              (${category.id}::uuid, ${category.tenantId}::uuid, ${category.name},
               ${category.parentId ? sql`${category.parentId}::uuid` : sql`NULL`},
               ${category.scope}, ${category.archivedAt?.toISOString() ?? null},
               ${category.createdAt.toISOString()}, ${category.actorUserId}::uuid)`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: category.id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: {
          name: category.name,
          parentId: category.parentId,
          scope: category.scope,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: category.id,
        eventType: "budgeting.category.created",
        payload: {
          name: category.name,
          scope: category.scope,
          actorUserId: category.actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async findById(tenantId: string, id: string): Promise<Category | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        name: string;
        parent_id: string | null;
        scope: string;
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
      }>(
        sql`SELECT id, tenant_id, name, parent_id::text, scope, archived_at, created_at, actor_user_id
            FROM budgeting.categories
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToCategory(r.value);
  }

  async list(tenantId: string, includeArchived: boolean): Promise<Category[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        name: string;
        parent_id: string | null;
        scope: string;
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
      }>(
        includeArchived
          ? sql`SELECT id, tenant_id, name, parent_id::text, scope, archived_at, created_at, actor_user_id
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid
                ORDER BY created_at ASC`
          : sql`SELECT id, tenant_id, name, parent_id::text, scope, archived_at, created_at, actor_user_id
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL
                ORDER BY created_at ASC`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map(rowToCategory);
  }

  async archive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`UPDATE budgeting.categories
            SET archived_at = now()
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: categoryId,
        action: "update",
        actorUserId: uid,
        before: { archivedAt: null },
        after: { archivedAt: new Date().toISOString() },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: categoryId,
        eventType: "budgeting.category.archived",
        payload: { actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async rename(
    tenantId: string,
    categoryId: string,
    newName: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`UPDATE budgeting.categories
            SET name = ${newName}
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: categoryId,
        action: "update",
        actorUserId: uid,
        before: null,
        after: { name: newName },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: categoryId,
        eventType: "budgeting.category.renamed",
        payload: { name: newName, actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }
}
