/**
 * category-limit-repo.ts — Drizzle adapter for CategoryLimitRepo (SCD-2)
 * PATTERNS.md lines 409-473: SCD-2 close-prev + insert-new pattern.
 * Partial unique index enforced in post-migration.sql prevents duplicate open rows.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  CategoryLimitRepo,
  CategoryLimitRow,
  SetLimitInput,
} from "../../ports/category-limit-repo";

function rowToDto(row: {
  id: string;
  tenant_id: string;
  category_id: string;
  normal_amount: string | bigint;
  normal_currency: string;
  cushion_amount: string | bigint;
  cushion_currency: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  actor_user_id: string;
  created_at: Date;
}): CategoryLimitRow {
  // effective_from/to returned as Date objects from Postgres — convert to ISO date string
  const toDateStr = (v: string | Date | null) => {
    if (!v) return null;
    if (typeof v === "string") return v.substring(0, 10);
    return v.toISOString().substring(0, 10);
  };
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    normalAmount: String(row.normal_amount),
    normalCurrency: row.normal_currency,
    cushionAmount: String(row.cushion_amount),
    cushionCurrency: row.cushion_currency,
    effectiveFrom: toDateStr(row.effective_from)!,
    effectiveTo: toDateStr(row.effective_to),
    actorUserId: row.actor_user_id,
    createdAt: new Date(row.created_at),
  };
}

export class DrizzleCategoryLimitRepo implements CategoryLimitRepo {
  async setLimit(input: SetLimitInput): Promise<void> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // Pitfall 3: SCD-2 race guard — advisory lock prevents concurrent PATCHes
      // on the same (tenant, category) from producing two overlapping 'open' rows.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId} || '::' || ${input.categoryId} || '::category_limits'))`,
      );

      // 1. Snapshot the previous open row
      const before = await tx.execute<{
        id: string;
        normal_amount: string;
        cushion_amount: string;
        effective_from: string;
      }>(sql`
        SELECT id, normal_amount::text, cushion_amount::text, effective_from::text
        FROM budgeting.category_limits
        WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
      `);

      if (before.rows.length > 0) {
        const prevFrom = before.rows[0].effective_from.substring(0, 10);
        if (prevFrom === input.effectiveFrom) {
          // Same-day edit (Pitfall 5): UPDATE the existing row in place
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET normal_amount = ${input.normalAmount}::bigint,
                normal_currency = ${input.normalCurrency},
                cushion_amount = ${input.cushionAmount}::bigint,
                cushion_currency = ${input.cushionCurrency},
                actor_user_id = ${input.actorUserId}::uuid
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);
        } else {
          // 2. Close the previous open row
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET effective_to = ${input.effectiveFrom}::date - INTERVAL '1 day'
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);

          // 3. Insert new open-ended row
          await tx.execute(sql`
            INSERT INTO budgeting.category_limits
              (tenant_id, category_id, normal_amount, normal_currency,
               cushion_amount, cushion_currency, effective_from, actor_user_id)
            VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                    ${input.normalAmount}::bigint, ${input.normalCurrency},
                    ${input.cushionAmount}::bigint, ${input.cushionCurrency},
                    ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
          `);
        }
      } else {
        // No previous row — simple insert
        await tx.execute(sql`
          INSERT INTO budgeting.category_limits
            (tenant_id, category_id, normal_amount, normal_currency,
             cushion_amount, cushion_currency, effective_from, actor_user_id)
          VALUES (${input.tenantId}::uuid, ${input.categoryId}::uuid,
                  ${input.normalAmount}::bigint, ${input.normalCurrency},
                  ${input.cushionAmount}::bigint, ${input.cushionCurrency},
                  ${input.effectiveFrom}::date, ${input.actorUserId}::uuid)
        `);
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "category_limit",
        entityId: input.categoryId,
        action: "update",
        actorUserId: uid,
        before: before.rows[0] ?? null,
        after: {
          normalAmount: input.normalAmount,
          normalCurrency: input.normalCurrency,
          cushionAmount: input.cushionAmount,
          cushionCurrency: input.cushionCurrency,
          effectiveFrom: input.effectiveFrom,
        },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "category_limit",
        aggregateId: input.categoryId,
        eventType: "budgeting.limit.changed",
        payload: {
          categoryId: input.categoryId,
          normalAmount: input.normalAmount,
          normalCurrency: input.normalCurrency,
          cushionAmount: input.cushionAmount,
          effectiveFrom: input.effectiveFrom,
          actorUserId: input.actorUserId,
        },
      });
    });

    if (r.isErr()) throw r.error;
  }

  async getEffectiveLimit(
    tenantId: string,
    categoryId: string,
    reportDate: string,
  ): Promise<CategoryLimitRow | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        category_id: string;
        normal_amount: string;
        normal_currency: string;
        cushion_amount: string;
        cushion_currency: string;
        effective_from: Date;
        effective_to: Date | null;
        actor_user_id: string;
        created_at: Date;
      }>(sql`
        SELECT id, tenant_id::text, category_id::text,
               normal_amount::text, normal_currency,
               cushion_amount::text, cushion_currency,
               effective_from, effective_to,
               actor_user_id::text, created_at
        FROM budgeting.category_limits
        WHERE category_id = ${categoryId}::uuid
          AND effective_from <= ${reportDate}::date
          AND (effective_to IS NULL OR effective_to >= ${reportDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      `);
      return result.rows[0] ?? null;
    });

    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToDto(r.value);
  }

  async effectiveForMonth(
    tenantId: string,
    _budgetId: string,
    monthStart: string,
  ): Promise<Map<string, { planned: bigint; cushion: bigint }>> {
    // v1.1 invariant: budget_id === tenant_id; category_limits are tenant-scoped
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        category_id: string;
        normal_amount: string;
        cushion_amount: string;
      }>(sql`
        SELECT category_id::text, normal_amount::text, cushion_amount::text
          FROM budgeting.category_limits
         WHERE tenant_id = ${tenantId}::uuid
           AND effective_from <= ${monthStart}::date
           AND (effective_to IS NULL OR effective_to > ${monthStart}::date)
      `);
      return result.rows;
    });

    if (r.isErr()) throw r.error;
    const m = new Map<string, { planned: bigint; cushion: bigint }>();
    for (const row of r.value) {
      m.set(row.category_id, {
        planned: BigInt(row.normal_amount),
        cushion: BigInt(row.cushion_amount),
      });
    }
    return m;
  }

  async listForCategory(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryLimitRow[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{
        id: string;
        tenant_id: string;
        category_id: string;
        normal_amount: string;
        normal_currency: string;
        cushion_amount: string;
        cushion_currency: string;
        effective_from: Date;
        effective_to: Date | null;
        actor_user_id: string;
        created_at: Date;
      }>(sql`
        SELECT id, tenant_id::text, category_id::text,
               normal_amount::text, normal_currency,
               cushion_amount::text, cushion_currency,
               effective_from, effective_to,
               actor_user_id::text, created_at
        FROM budgeting.category_limits
        WHERE category_id = ${categoryId}::uuid
          AND tenant_id = ${tenantId}::uuid
        ORDER BY effective_from DESC
      `);
      return result.rows;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(rowToDto);
  }
}
