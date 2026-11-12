/**
 * wealth-snapshot-repo.ts — Drizzle adapter for the Overview Wealth series (11-06).
 *
 * Reads budgeting.budget_wealth_snapshots rows for a budget in a date range,
 * ordered by captured_at (uses budget_wealth_snapshots_series_idx). Opens its own
 * withTenantTx scoped to budgetId (v1.1: budget_id === tenant_id) so the RLS GUC
 * app.tenant_ids is set. Returns aggregate cents (bigint) — bucket aggregation
 * + the live point live in the service.
 *
 * Phase 14 (D-02): a snapshot is stored in the currency of its capture and is
 * never rewritten. It is re-expressed on read in the budget's CURRENT currency
 * at its own capture date, so a currency change (and back) is lossless.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { budgetCurrency, fxConvert, storedOr } from "./fx-sql";
import type { WealthSnapshotRow } from "../../application/get-overview-wealth";
import type { ImportedSnapshot } from "../../application/import-wealth-snapshots";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** One amount column in the budget's current currency at its capture date (NULL stays NULL). */
const snap = (column: string, budgetId: string) =>
  storedOr(
    sql`fx_cache_ccy`,
    sql`${sql.identifier(`fx_cache_${column}`)}`,
    budgetCurrency(budgetId),
    fxConvert(sql`${sql.identifier(column)}`, sql`currency`, budgetCurrency(budgetId), sql`captured_at::date`),
  );

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface WealthSnapshotRepo {
  seriesForRange(
    budgetId: string,
    from: string,
    to: string,
  ): Promise<WealthSnapshotRow[]>;
  /** The most recent snapshot STRICTLY BEFORE `from` — the "opening value" the
   *  chart carries forward across the leading gap so a range that starts before
   *  the first in-range tick shows last month's value, not 0 (round 24 item 2). */
  openingBefore(
    budgetId: string,
    from: string,
  ): Promise<WealthSnapshotRow | null>;
  /** 15-21: past points from an imported balance history, source 'import'. A
   *  day that already holds any snapshot is left alone and reported. */
  insertImported(
    budgetId: string,
    rows: ImportedSnapshot[],
  ): Promise<{ created: { id: string; date: string }[]; skippedExisting: string[] }>;
  /** Deletes an imported snapshot; a worker snapshot is never deleted. */
  deleteImported(budgetId: string, id: string): Promise<boolean>;
}

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString();

export function createWealthSnapshotRepo(): WealthSnapshotRepo {
  return {
    async seriesForRange(budgetId, from, to): Promise<WealthSnapshotRow[]> {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const res = await (tx as DrizzleTx).execute(sql`
            SELECT captured_at,
                   COALESCE(${snap("capitalization_cents", budgetId)}, 0)::text AS capitalization_cents,
                   COALESCE(${snap("investment_value_cents", budgetId)}, 0)::text AS investment_value_cents,
                   ${snap("investment_cost_basis_cents", budgetId)}::text AS investment_cost_basis_cents
              FROM budgeting.budget_wealth_snapshots
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${budgetId}::uuid
               AND captured_at >= ${from}::date
               AND captured_at < (${to}::date + interval '1 day')
               -- No pair to the budget currency = no point, never a fabricated 0
               -- (review WR-04: the chart read it as wealth crashing to zero).
               AND ${snap("capitalization_cents", budgetId)} IS NOT NULL
               AND ${snap("investment_value_cents", budgetId)} IS NOT NULL
             ORDER BY captured_at
          `);
          return res.rows.map((row) => ({
            captured_at: new Date(row.captured_at as string),
            capitalization_cents: BigInt(row.capitalization_cents as string),
            investment_value_cents: BigInt(
              row.investment_value_cents as string,
            ),
            investment_cost_basis_cents:
              row.investment_cost_basis_cents == null
                ? null
                : BigInt(row.investment_cost_basis_cents as string),
          }));
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async openingBefore(budgetId, from): Promise<WealthSnapshotRow | null> {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const res = await (tx as DrizzleTx).execute(sql`
            SELECT captured_at,
                   COALESCE(${snap("capitalization_cents", budgetId)}, 0)::text AS capitalization_cents,
                   COALESCE(${snap("investment_value_cents", budgetId)}, 0)::text AS investment_value_cents,
                   ${snap("investment_cost_basis_cents", budgetId)}::text AS investment_cost_basis_cents
              FROM budgeting.budget_wealth_snapshots
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${budgetId}::uuid
               AND captured_at < ${from}::date
               -- No pair to the budget currency = no point, never a fabricated 0
               -- (review WR-04: the chart read it as wealth crashing to zero).
               AND ${snap("capitalization_cents", budgetId)} IS NOT NULL
               AND ${snap("investment_value_cents", budgetId)} IS NOT NULL
             ORDER BY captured_at DESC
             LIMIT 1
          `);
          const row = res.rows[0];
          if (!row) return null;
          return {
            captured_at: new Date(row.captured_at as string),
            capitalization_cents: BigInt(row.capitalization_cents as string),
            investment_value_cents: BigInt(
              row.investment_value_cents as string,
            ),
            investment_cost_basis_cents:
              row.investment_cost_basis_cents == null
                ? null
                : BigInt(row.investment_cost_basis_cents as string),
          } satisfies WealthSnapshotRow;
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async insertImported(budgetId, rows) {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const created: { id: string; date: string }[] = [];
          const skippedExisting: string[] = [];
          for (const row of rows) {
            // The rebuilt monthly history sits at 00:00: a second point on the
            // same day would draw two different totals for one date.
            const res = await (tx as DrizzleTx).execute(sql`
              INSERT INTO budgeting.budget_wealth_snapshots
                (tenant_id, budget_id, captured_at, capitalization_cents,
                 investment_value_cents, investment_cost_basis_cents, currency, source)
              SELECT ${budgetId}::uuid, ${budgetId}::uuid, ${row.capturedAt.toISOString()}::timestamptz,
                     ${row.capitalizationCents.toString()}::bigint,
                     ${row.investmentValueCents.toString()}::bigint,
                     ${row.investmentCostBasisCents?.toString() ?? null}::bigint,
                     ${row.currency}, 'import'
               WHERE NOT EXISTS (
                 SELECT 1 FROM budgeting.budget_wealth_snapshots
                  WHERE budget_id = ${budgetId}::uuid
                    AND captured_at >= ${`${row.date}T00:00:00Z`}::timestamptz
                    AND captured_at < ${nextDay(row.date)}::timestamptz)
              ON CONFLICT DO NOTHING
              RETURNING id
            `);
            const id = res.rows[0]?.id as string | undefined;
            if (id) created.push({ id, date: row.date });
            else skippedExisting.push(row.date);
          }
          return { created, skippedExisting };
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async deleteImported(budgetId, id) {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const res = await (tx as DrizzleTx).execute(sql`
            DELETE FROM budgeting.budget_wealth_snapshots
             WHERE id = ${id}::uuid
               AND budget_id = ${budgetId}::uuid
               AND source = 'import'
            RETURNING id
          `);
          return res.rows.length > 0;
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },
  };
}
