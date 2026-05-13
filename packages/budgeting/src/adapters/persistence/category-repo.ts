/**
 * category-repo.ts — Drizzle adapter for CategoryRepo port
 * MUST NOT be imported by domain/application layers.
 * Each write: withTenantTx → SQL → writeAudit → writeOutbox.
 * Note: scope column dropped in v1.1 (D-13).
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
  archived_at: Date | null;
  created_at: Date;
  actor_user_id: string;
  sort_index?: number;
}): Category {
  const { Category: CategoryClass } = require("../../domain/category");
  const cat = new CategoryClass(
    row.id,
    row.tenant_id,
    row.name,
    row.parent_id ?? null,
    row.archived_at ? new Date(row.archived_at) : null,
    new Date(row.created_at),
    row.actor_user_id,
  );
  // Attach sort_index as a plain property (domain class does not track it — adapter concern)
  (cat as any).sortIndex = row.sort_index ?? 0;
  return cat;
}

export class DrizzleCategoryRepo implements CategoryRepo {
  async create(category: Category): Promise<void> {
    const tid = TenantId(category.tenantId);
    const uid = UserId(category.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`INSERT INTO budgeting.categories
              (id, tenant_id, name, parent_id, archived_at, created_at, actor_user_id)
            VALUES
              (${category.id}::uuid, ${category.tenantId}::uuid, ${category.name},
               ${category.parentId ? sql`${category.parentId}::uuid` : sql`NULL`},
               ${category.archivedAt?.toISOString() ?? null},
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
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: category.id,
        eventType: "budgeting.category.created",
        payload: {
          name: category.name,
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
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
        sort_index: number;
      }>(
        sql`SELECT id, tenant_id, name, parent_id::text, archived_at, created_at, actor_user_id, sort_index
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
        archived_at: Date | null;
        created_at: Date;
        actor_user_id: string;
        sort_index: number;
      }>(
        includeArchived
          ? sql`SELECT id, tenant_id, name, parent_id::text, archived_at, created_at, actor_user_id, sort_index
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid
                ORDER BY sort_index ASC, created_at ASC`
          : sql`SELECT id, tenant_id, name, parent_id::text, archived_at, created_at, actor_user_id, sort_index
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL
                ORDER BY sort_index ASC, created_at ASC`,
      );
      return result.rows;
    });
    if (r.isErr()) throw r.error;
    return r.value.map(rowToCategory);
  }

  async listForBudget(
    tenantId: string,
    budgetId: string,
    includeArchived: boolean,
  ): Promise<Category[]> {
    // v1.1 invariant: budget_id === tenant_id; categories are tenant-scoped
    return this.list(tenantId, includeArchived);
  }

  async reorder(
    tenantId: string,
    _budgetId: string,
    orderedIds: string[],
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // Build VALUES (id::uuid, sort_index) pairs — cast idx to INTEGER explicitly
      // to avoid "column sort_index is of type integer but expression is of type text"
      const rows = orderedIds.map((id, idx) => sql`(${id}::uuid, ${idx + 1}::integer)`);
      const result = await tx.execute(
        sql`UPDATE budgeting.categories
               SET sort_index = data.idx
             FROM (VALUES ${sql.join(rows, sql`, `)}) AS data(id, idx)
             WHERE budgeting.categories.id = data.id
               AND budgeting.categories.tenant_id = ${tenantId}::uuid`,
      );

      const rowCount =
        (result as any).rowCount ?? (result as any).rows?.length ?? 0;
      if (rowCount !== orderedIds.length) {
        throw new Error("orderedIds_mismatch");
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: tenantId, // budget/tenant id as aggregate anchor
        action: "update",
        actorUserId: uid,
        before: null,
        after: { orderedIds },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: tenantId,
        eventType: "budgeting.category.reordered",
        payload: { orderedIds, actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
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
