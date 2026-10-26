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
  HistoryRepo,
} from "../../ports/history-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** Reads with no acting user (Overview contributions) — same id the budgeting
 *  snapshot/task repos use. */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const s = (v: bigint | null): string | null =>
  v === null ? null : v.toString();

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
