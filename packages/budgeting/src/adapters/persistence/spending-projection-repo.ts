/**
 * spending-projection-repo.ts — Drizzle adapter for SpendingProjectionRepo port.
 * ENGR-14: upserts spending_by_category_month inside the caller's tx.
 * Does NOT open its own transaction.
 */
import { sql } from "drizzle-orm";
import type { SpendingProjectionRepo, SpendingProjectionUpsertInput } from "../../ports/spending-projection-repo";

export class DrizzleSpendingProjectionRepo implements SpendingProjectionRepo {
  async upsert(tx: unknown, input: SpendingProjectionUpsertInput): Promise<void> {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };
    await drizzleTx.execute(
      sql`INSERT INTO budgeting.spending_by_category_month
            (tenant_id, workspace_id, category_id, month_start_date,
             normal_amount, cushion_amount, currency, updated_at)
          VALUES
            (${input.tenantId}::uuid, ${input.workspaceId}::uuid, ${input.categoryId}::uuid,
             ${input.monthStartDate}::date,
             ${input.deltaNormal}::numeric, ${input.deltaCushion}::numeric,
             ${input.currency}, now())
          ON CONFLICT (tenant_id, category_id, month_start_date) DO UPDATE
            SET normal_amount = spending_by_category_month.normal_amount + EXCLUDED.normal_amount,
                cushion_amount = spending_by_category_month.cushion_amount + EXCLUDED.cushion_amount,
                updated_at = now()`,
    );
  }
}
