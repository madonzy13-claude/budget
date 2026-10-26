/**
 * history-repo.ts — DrizzleHistoryRepo (Phase 13). commit() writes a whole
 * booking — new holding, holding patches, history entries — in ONE
 * withTenantTx, so a failure anywhere leaves nothing behind. Patches are scoped
 * by id AND budget_id; a miss throws not_found and rolls the booking back.
 * bigint cents bound as strings (node-postgres has no native bigint param).
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { insertHoldingTx } from "./holding-repo";
import type {
  BookingPlan,
  FlowRow,
  HistoryKind,
  HistoryRepo,
  RealizedRow,
  StoredEntry,
} from "../../ports/history-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Reads with no acting user (Overview contributions) — same id the budgeting
 *  snapshot/task repos use. */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const s = (v: bigint | null): string | null =>
  v === null ? null : v.toString();

const ENTRY_SELECT = sql`
  SELECT h.id::text AS id, h.holding_id::text AS holding_id, h.kind,
         h.effective_date::text AS effective_date,
         h.amount_cents::text AS amount_cents, h.amount_currency,
         h.qty_delta::text AS qty_delta,
         h.cost_delta_cents::text AS cost_delta_cents,
         h.value_delta_cents::text AS value_delta_cents,
         h.flow_cents::text AS flow_cents,
         h.realized_budget_cents::text AS realized_budget_cents,
         h.sold_cost_budget_cents::text AS sold_cost_budget_cents,
         h.budget_currency,
         h.prior_principal_cents::text AS prior_principal_cents,
         h.prior_start_date::text AS prior_start_date,
         h.transfer_id::text AS transfer_id, h.created_at,
         (SELECT i.name FROM budgeting.investment_history o
            JOIN budgeting.investments i ON i.id = o.holding_id
           WHERE o.transfer_id = h.transfer_id AND o.id <> h.id
             AND o.deleted_at IS NULL
           LIMIT 1) AS counterparty_name
    FROM budgeting.investment_history h`;

const big = (v: unknown): bigint | null =>
  v === null || v === undefined ? null : BigInt(String(v));

function mapEntry(row: Record<string, unknown>): StoredEntry {
  return {
    id: String(row.id),
    holdingId: String(row.holding_id),
    kind: String(row.kind) as HistoryKind,
    effectiveDate: String(row.effective_date),
    amountCents: big(row.amount_cents),
    amountCurrency: (row.amount_currency as string | null) ?? null,
    // numeric(28,8) → trim trailing zeros so "−0.10000000" reads "-0.1"
    qtyDelta:
      row.qty_delta == null
        ? null
        : String(row.qty_delta)
            .replace(/(\.\d*?)0+$/, "$1")
            .replace(/\.$/, ""),
    costDeltaCents: big(row.cost_delta_cents) ?? 0n,
    valueDeltaCents: big(row.value_delta_cents) ?? 0n,
    flowCents: big(row.flow_cents) ?? 0n,
    realizedBudgetCents: big(row.realized_budget_cents),
    soldCostBudgetCents: big(row.sold_cost_budget_cents),
    budgetCurrency: (row.budget_currency as string | null) ?? null,
    priorPrincipalCents: big(row.prior_principal_cents),
    priorStartDate: (row.prior_start_date as string | null) ?? null,
    transferId: (row.transfer_id as string | null) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    counterpartyName: (row.counterparty_name as string | null) ?? null,
  };
}

export class DrizzleHistoryRepo implements HistoryRepo {
  async commit(
    tenantId: string,
    userId: string,
    plan: BookingPlan,
  ): Promise<{ newHoldingId: string | null; transferId: string | null }> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const dt = tx as DrizzleTx;
        const newHoldingId = plan.newHolding
          ? (
              await insertHoldingTx(
                tx,
                tenantId,
                plan.budgetId,
                plan.newHolding,
              )
            ).id
          : null;

        for (const p of plan.patches) {
          const res = await dt.execute(sql`
            UPDATE budgeting.investments SET
              quantity = COALESCE(${p.quantity ?? null}::numeric, quantity),
              buy_price_cents = COALESCE(${s(p.buyPriceCents ?? null)}::bigint, buy_price_cents),
              current_price_cents = CASE WHEN ${p.currentPriceCents !== undefined}
                                         THEN ${p.currentPriceCents == null ? null : String(p.currentPriceCents)}::numeric
                                         ELSE current_price_cents END,
              deposit_start_date = COALESCE(${p.depositStartDate ?? null}::date, deposit_start_date),
              archived_at = CASE WHEN ${!!p.archive} THEN now()
                                 WHEN ${!!p.unarchive} THEN NULL
                                 ELSE archived_at END
             WHERE id = ${p.id}::uuid AND budget_id = ${plan.budgetId}::uuid
            RETURNING id
          `);
          if (res.rows.length === 0) throw new Error("not_found");
        }

        for (const id of plan.softDeleteEntryIds ?? [])
          await dt.execute(sql`
            UPDATE budgeting.investment_history SET deleted_at = now()
             WHERE id = ${id}::uuid AND budget_id = ${plan.budgetId}::uuid
               AND deleted_at IS NULL
          `);
        for (const id of plan.deleteHoldingIds ?? []) {
          const res = await dt.execute(sql`
            DELETE FROM budgeting.investments
             WHERE id = ${id}::uuid AND budget_id = ${plan.budgetId}::uuid
            RETURNING id
          `);
          if (res.rows.length === 0) throw new Error("not_found");
        }

        const transferId = plan.entries.some((e) => e.transfer)
          ? String(
              (await dt.execute(sql`SELECT gen_random_uuid()::text AS id`))
                .rows[0]!.id,
            )
          : null;

        for (const e of plan.entries) {
          const holdingId =
            e.holdingRef === "$new" ? newHoldingId : e.holdingRef;
          if (!holdingId) throw new Error("not_found");
          await dt.execute(sql`
            INSERT INTO budgeting.investment_history
              (tenant_id, budget_id, holding_id, kind, effective_date,
               amount_cents, amount_currency, qty_delta,
               cost_delta_cents, cost_currency, value_delta_cents,
               flow_cents, flow_currency,
               sold_cost_budget_cents, realized_budget_cents, budget_currency,
               prior_principal_cents, prior_start_date, transfer_id)
            VALUES
              (${tenantId}::uuid, ${plan.budgetId}::uuid, ${holdingId}::uuid,
               ${e.kind}, ${e.effectiveDate}::date,
               ${s(e.amountCents)}::bigint, ${e.amountCurrency}, ${e.qtyDelta}::numeric,
               ${s(e.costDeltaCents)}::bigint, ${e.costCurrency}, ${s(e.valueDeltaCents)}::bigint,
               ${s(e.flowCents)}::bigint, ${e.flowCurrency},
               ${s(e.soldCostBudgetCents)}::bigint, ${s(e.realizedBudgetCents)}::bigint,
               ${e.budgetCurrency},
               ${s(e.priorPrincipalCents)}::bigint, ${e.priorStartDate}::date,
               ${e.transfer ? transferId : null}::uuid)
          `);
        }
        return { newHoldingId, transferId };
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  private async read<T>(
    tenantId: string,
    userId: string,
    fn: (dt: DrizzleTx) => Promise<T>,
  ): Promise<T> {
    const r = await withTenantTx(TenantId(tenantId), UserId(userId), (tx) =>
      fn(tx as DrizzleTx),
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async findLegs(
    tenantId: string,
    userId: string,
    entryId: string,
  ): Promise<StoredEntry[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        ${ENTRY_SELECT}
         WHERE h.deleted_at IS NULL
           AND (h.id = ${entryId}::uuid
                OR h.transfer_id = (SELECT transfer_id FROM budgeting.investment_history
                                     WHERE id = ${entryId}::uuid AND deleted_at IS NULL))
      `);
      return res.rows.map(mapEntry);
    });
  }

  async listForHolding(
    tenantId: string,
    userId: string,
    holdingId: string,
  ): Promise<StoredEntry[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        ${ENTRY_SELECT}
         WHERE h.deleted_at IS NULL AND h.holding_id = ${holdingId}::uuid
         ORDER BY h.effective_date, h.created_at, h.id
      `);
      return res.rows.map(mapEntry);
    });
  }

  async realizedByType(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<RealizedRow[]> {
    return this.read(tenantId, userId, async (dt) => {
      // Archived holdings included: a type keeps its realized after its last
      // holding is sold (D-14). Keyed by the holding's CURRENT ui_type.
      const res = await dt.execute(sql`
        SELECT COALESCE(i.ui_type, 'other') AS ui_type,
               COALESCE(h.budget_currency, '') AS budget_currency,
               COALESCE(sum(h.realized_budget_cents), 0)::text AS realized,
               COALESCE(sum(h.sold_cost_budget_cents), 0)::text AS sold_cost
          FROM budgeting.investment_history h
          JOIN budgeting.investments i ON i.id = h.holding_id
         WHERE h.budget_id = ${budgetId}::uuid AND h.deleted_at IS NULL
           AND h.kind IN ('withdraw', 'convert_out')
         GROUP BY 1, 2
      `);
      return res.rows.map((row) => ({
        uiType: String(row.ui_type),
        budgetCurrency: String(row.budget_currency),
        realizedBudgetCents: BigInt(String(row.realized)),
        soldCostBudgetCents: BigInt(String(row.sold_cost)),
      }));
    });
  }

  async getTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<string[]> {
    return this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        SELECT investment_type_order AS o FROM tenancy.budgets
         WHERE id = ${budgetId}::uuid
      `);
      return (res.rows[0]?.o as string[] | undefined) ?? [];
    });
  }

  async setTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
    order: string[],
  ): Promise<void> {
    await this.read(tenantId, userId, async (dt) => {
      const res = await dt.execute(sql`
        UPDATE tenancy.budgets
           SET investment_type_order = ${`{${order.join(",")}}`}::text[]
         WHERE id = ${budgetId}::uuid
        RETURNING id
      `);
      if (res.rows.length === 0) throw new Error("not_found");
    });
  }

  async listFlows(tenantId: string, budgetId: string): Promise<FlowRow[]> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const res = await (tx as DrizzleTx).execute(sql`
          SELECT effective_date::text AS effective_date,
                 flow_cents::text AS flow_cents,
                 COALESCE(flow_currency, amount_currency, cost_currency) AS flow_currency
            FROM budgeting.investment_history
           WHERE budget_id = ${budgetId}::uuid AND deleted_at IS NULL
           ORDER BY effective_date
        `);
        return res.rows.map((row) => ({
          effectiveDate: String(row.effective_date),
          flowCents: BigInt(String(row.flow_cents)),
          flowCurrency: String(row.flow_currency ?? ""),
        }));
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }
}
