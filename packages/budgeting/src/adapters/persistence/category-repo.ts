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
  archived_from?: Date | string | null;
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
  // Attach sort_index + archived_from as plain properties (domain class doesn't
  // track them — adapter concern). archivedFrom drives the grid's greyed,
  // read-only "archived (keep history)" column for the months it's still shown.
  (cat as any).sortIndex = row.sort_index ?? 0;
  (cat as any).archivedFrom = row.archived_from ?? null;
  return cat;
}

export class DrizzleCategoryRepo implements CategoryRepo {
  async create(category: Category): Promise<void> {
    const tid = TenantId(category.tenantId);
    const uid = UserId(category.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // sort_index = max existing + 1 so a freshly created category lands
      // last (rightmost) in the grid instead of defaulting to 0.
      await tx.execute(
        sql`INSERT INTO budgeting.categories
              (id, tenant_id, name, parent_id, archived_at, created_at, actor_user_id, sort_index)
            VALUES
              (${category.id}::uuid, ${category.tenantId}::uuid, ${category.name},
               ${category.parentId ? sql`${category.parentId}::uuid` : sql`NULL`},
               ${category.archivedAt?.toISOString() ?? null},
               ${category.createdAt.toISOString()}, ${category.actorUserId}::uuid,
               (SELECT COALESCE(MAX(sort_index), -1) + 1
                  FROM budgeting.categories
                 WHERE tenant_id = ${category.tenantId}::uuid))`,
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
        archived_from: Date | string | null;
        created_at: Date;
        actor_user_id: string;
        sort_index: number;
      }>(
        sql`SELECT id, tenant_id, name, parent_id::text, archived_at, archived_from::text, created_at, actor_user_id, sort_index
            FROM budgeting.categories
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToCategory(r.value);
  }

  async list(
    tenantId: string,
    includeArchived: boolean,
    asOfMonth?: string,
  ): Promise<Category[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);
    const r = await withTenantTx(tid, uid, async (tx) => {
      // Issue 1b: a category is visible for month M when it isn't fully removed
      // (archived_at IS NULL) AND it hasn't been month-scoped-removed as of M
      // (archived_from IS NULL OR archived_from > M). asOfMonth defaults to the
      // current month for current-state reads (reserves, default grid).
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        name: string;
        parent_id: string | null;
        archived_at: Date | null;
        archived_from: Date | null;
        created_at: Date;
        actor_user_id: string;
        sort_index: number;
      }>(
        includeArchived
          ? sql`SELECT id, tenant_id, name, parent_id::text, archived_at, archived_from, created_at, actor_user_id, sort_index
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid
                ORDER BY sort_index ASC, created_at ASC`
          : // A "keep history" archive (archived_from set, archived_at NULL) stays
            // visible THROUGH its archived_from month (>= M) so the current month
            // still shows it (greyed, read-only); only FUTURE months (M after
            // archived_from) drop it. Fully-removed (archived_at) is always hidden.
            sql`SELECT id, tenant_id, name, parent_id::text, archived_at, archived_from, created_at, actor_user_id, sort_index
                FROM budgeting.categories
                WHERE tenant_id = ${tenantId}::uuid
                  AND archived_at IS NULL
                  AND (archived_from IS NULL
                       OR archived_from >= COALESCE(${asOfMonth ?? null}::date,
                                                   date_trunc('month', CURRENT_DATE)::date))
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
    asOfMonth?: string,
  ): Promise<Category[]> {
    // v1.1 invariant: budget_id === tenant_id; categories are tenant-scoped
    return this.list(tenantId, includeArchived, asOfMonth);
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
      const rows = orderedIds.map(
        (id, idx) => sql`(${id}::uuid, ${idx + 1}::integer)`,
      );
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
    opts?: { archivedFrom?: string | null; hideAll?: boolean },
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);
    // Default (and the "remove past too" mode) hides the category in EVERY
    // month: archived_at set + archived_from epoch. "Keep history" sets only
    // archived_from to the given month (archived_at stays NULL), so the category
    // remains visible in months before it.
    const hideAll = opts?.hideAll ?? !opts?.archivedFrom;

    const r = await withTenantTx(tid, uid, async (tx) => {
      if (hideAll) {
        await tx.execute(
          sql`UPDATE budgeting.categories
              SET archived_at = now(), archived_from = DATE '0001-01-01'
              WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
        );
      } else {
        await tx.execute(
          sql`UPDATE budgeting.categories
              SET archived_from = ${opts!.archivedFrom}::date, archived_at = NULL
              WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
        );
      }

      // Removing a category (EITHER mode) drops its future recurring rules and
      // any still-unconfirmed drafts, so nothing new lands in it going forward.
      await tx.execute(
        sql`DELETE FROM budgeting.recurring_rules
            WHERE category_id = ${categoryId}::uuid
              AND tenant_id = ${tenantId}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM budgeting.expense_ledger
            WHERE category_id = ${categoryId}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND confirmed_at IS NULL`,
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

  async unarchive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`UPDATE budgeting.categories
            SET archived_from = NULL, archived_at = NULL
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: categoryId,
        action: "update",
        actorUserId: uid,
        before: { archivedAt: new Date().toISOString() },
        after: { archivedAt: null },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: categoryId,
        eventType: "budgeting.category.unarchived",
        payload: { actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async hardDelete(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void> {
    const tid = TenantId(tenantId);
    const uid = UserId(actorUserId);
    // No DB-level FK constraints reference category_id, so deleting the category
    // alone would orphan its child rows. Purge every child table by category_id
    // (tenant-scoped), then the category, in one transaction.
    const r = await withTenantTx(tid, uid, async (tx) => {
      for (const table of [
        "budgeting.expense_ledger", // transactions + drafts
        "budgeting.category_limits",
        "budgeting.category_reserve_adjustments",
        "budgeting.category_share_overrides",
        "budgeting.recurring_rules",
        "budgeting.spending_by_category_month",
      ]) {
        await tx.execute(
          sql`DELETE FROM ${sql.raw(table)}
              WHERE category_id = ${categoryId}::uuid
                AND tenant_id = ${tenantId}::uuid`,
        );
      }
      await tx.execute(
        sql`DELETE FROM budgeting.categories
            WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category",
        entityId: categoryId,
        action: "delete",
        actorUserId: uid,
        before: { id: categoryId },
        after: null,
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category",
        aggregateId: categoryId,
        eventType: "budgeting.category.deleted",
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
