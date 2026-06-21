/**
 * holding-repo.ts — DrizzleHoldingRepo (Phase 9). Tenant-scoped CRUD over
 * budgeting.investments via withTenantTx (activates investments_tenant_isolation RLS).
 * bigint cents bound as strings (node-postgres has no native bigint param);
 * numeric quantity stays a string end-to-end. listForBudget joins the price cache
 * so tracked holdings read their latest price (custom holdings keep their column).
 * value/P-L math is a use-case concern (P06) — this returns plain Holding entities.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Holding, type HoldingType } from "../../domain/holding";
import type { HoldingRepo, NewHolding } from "../../ports/holding-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

const b8 = (v: bigint | null): string | null =>
  v === null ? null : v.toString();

function mapRow(row: Record<string, unknown>): Holding {
  const cents = (k: string): bigint | null => {
    const v = row[k];
    return v === null || v === undefined ? null : BigInt(String(v));
  };
  return new Holding(
    String(row.id),
    String(row.tenant_id),
    String(row.name),
    String(row.holding_type) as HoldingType,
    (row.group_name as string | null) ?? null,
    (row.instrument_id as string | null) ?? null,
    cents("buy_price_cents"),
    (row.buy_currency as string | null) ?? null,
    String(row.quantity),
    cents("current_price_cents"),
    (row.current_price_currency as string | null) ?? null,
    Number(row.sort_order),
    row.archived_at ? new Date(String(row.archived_at)) : null,
    new Date(String(row.created_at)),
    (row.ui_type as string | null) ?? null,
    (row.metal as string | null) ?? null,
    (row.metal_kind as string | null) ?? null,
    (row.unit_of_measure as string | null) ?? null,
  );
}

export class DrizzleHoldingRepo implements HoldingRepo {
  async create(
    tenantId: string,
    budgetId: string,
    userId: string,
    input: NewHolding,
  ): Promise<Holding> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        const res = await dt.execute(sql`
          INSERT INTO budgeting.investments
            (id, tenant_id, budget_id, instrument_id, name, holding_type, ui_type,
             group_name, buy_price_cents, buy_currency, quantity, current_price_cents,
             current_price_currency, metal, metal_kind, unit_of_measure, sort_order, created_at)
          VALUES
            (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid, ${input.instrumentId}::uuid,
             ${input.name}, ${input.holdingType}, ${input.uiType},
             ${input.group},
             ${b8(input.buyPriceCents)}::bigint, ${input.buyCurrency},
             ${input.quantity}::numeric, ${b8(input.currentPriceCents)}::bigint,
             ${input.currentPriceCurrency},
             ${input.metal}, ${input.metalKind}, ${input.unitOfMeasure},
             COALESCE((SELECT MAX(sort_order) + 1 FROM budgeting.investments
                        WHERE budget_id = ${budgetId}::uuid AND archived_at IS NULL), 0),
             now())
          RETURNING id::text AS id, tenant_id::text AS tenant_id, name, holding_type,
                    ui_type, group_name, instrument_id::text AS instrument_id,
                    buy_price_cents::text AS buy_price_cents, buy_currency,
                    quantity::text AS quantity,
                    current_price_cents::text AS current_price_cents,
                    current_price_currency, metal, metal_kind, unit_of_measure,
                    sort_order, archived_at, created_at
        `);
        return mapRow(res.rows[0]);
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    input: NewHolding,
  ): Promise<Holding | null> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        const res = await dt.execute(sql`
          UPDATE budgeting.investments SET
            instrument_id = ${input.instrumentId}::uuid,
            name = ${input.name},
            holding_type = ${input.holdingType},
            ui_type = ${input.uiType},
            group_name = ${input.group},
            buy_price_cents = ${b8(input.buyPriceCents)}::bigint,
            buy_currency = ${input.buyCurrency},
            quantity = ${input.quantity}::numeric,
            current_price_cents = ${b8(input.currentPriceCents)}::bigint,
            current_price_currency = ${input.currentPriceCurrency},
            metal = ${input.metal},
            metal_kind = ${input.metalKind},
            unit_of_measure = ${input.unitOfMeasure}
          WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND archived_at IS NULL
          RETURNING id::text AS id, tenant_id::text AS tenant_id, name, holding_type,
                    ui_type, group_name, instrument_id::text AS instrument_id,
                    buy_price_cents::text AS buy_price_cents, buy_currency,
                    quantity::text AS quantity,
                    current_price_cents::text AS current_price_cents,
                    current_price_currency, metal, metal_kind, unit_of_measure,
                    sort_order, archived_at, created_at
        `);
        return res.rows.length ? mapRow(res.rows[0]) : null;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async archive(tenantId: string, userId: string, id: string): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        await dt.execute(sql`
          UPDATE budgeting.investments SET archived_at = now()
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND archived_at IS NULL
        `);
      },
    );
    if (r.isErr()) throw r.error;
  }

  async listForBudget(
    tenantId: string,
    budgetId: string,
    userId: string,
  ): Promise<Holding[]> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        const res = await dt.execute(sql`
          SELECT inv.id::text AS id, inv.tenant_id::text AS tenant_id, inv.name,
                 inv.holding_type, inv.ui_type, inv.group_name,
                 inv.metal, inv.metal_kind, inv.unit_of_measure,
                 inv.instrument_id::text AS instrument_id,
                 inv.buy_price_cents::text AS buy_price_cents, inv.buy_currency,
                 inv.quantity::text AS quantity,
                 CASE WHEN inv.instrument_id IS NOT NULL AND c.price IS NOT NULL
                      THEN round(c.price * 100)::bigint::text
                      ELSE inv.current_price_cents::text END AS current_price_cents,
                 CASE WHEN inv.instrument_id IS NOT NULL AND c.currency IS NOT NULL
                      THEN c.currency
                      ELSE inv.current_price_currency END AS current_price_currency,
                 inv.sort_order, inv.archived_at, inv.created_at
            FROM budgeting.investments inv
            LEFT JOIN budgeting.instrument_price_cache c
                   ON c.instrument_id = inv.instrument_id
           WHERE inv.budget_id = ${budgetId}::uuid
             AND inv.tenant_id = ${tenantId}::uuid
             AND inv.archived_at IS NULL
           ORDER BY inv.sort_order ASC, inv.created_at ASC
        `);
        return res.rows.map(mapRow);
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async reorder(
    tenantId: string,
    userId: string,
    orderedIds: string[],
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        for (let i = 0; i < orderedIds.length; i++) {
          await dt.execute(sql`
            UPDATE budgeting.investments SET sort_order = ${i}
             WHERE id = ${orderedIds[i]}::uuid AND tenant_id = ${tenantId}::uuid
          `);
        }
      },
    );
    if (r.isErr()) throw r.error;
  }

  async findById(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<Holding | null> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        const res = await dt.execute(sql`
          SELECT id::text AS id, tenant_id::text AS tenant_id, name, holding_type,
                 ui_type, group_name, metal, metal_kind, unit_of_measure,
                 instrument_id::text AS instrument_id,
                 buy_price_cents::text AS buy_price_cents, buy_currency,
                 quantity::text AS quantity,
                 current_price_cents::text AS current_price_cents,
                 current_price_currency, sort_order, archived_at, created_at
            FROM budgeting.investments
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
           LIMIT 1
        `);
        return res.rows.length ? mapRow(res.rows[0]) : null;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }
}
