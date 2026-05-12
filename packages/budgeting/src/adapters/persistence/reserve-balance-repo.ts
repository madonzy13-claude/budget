/**
 * reserve-balance-repo.ts — Drizzle adapter for ReserveBalanceRepo port.
 * SELECTs from budgeting.category_reserve_balance VIEW (created by migration 0013/0014).
 * Money at adapter boundary: balance_cents (bigint) → Money.of(decimal, currency).
 * RLS inherited from VIEW's base tables (expense_ledger, category_limits, budget_mode_history).
 * RSCM-01 + RSCM-02 per D-PH2-02.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, withInfraTx } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { ReserveBalanceRepo } from "../../ports/reserve-balance-repo";

/** Convert balance_cents (bigint or numeric string from Postgres) to Money decimal. */
function centsToMoney(balanceCents: unknown, currency: string): Money {
  const cents = typeof balanceCents === "bigint"
    ? balanceCents
    : BigInt(String(balanceCents ?? "0"));
  // Convert cents to decimal: 10000 cents → "100.00"
  const whole = cents / 100n;
  const fraction = cents % 100n;
  const decimalStr = `${whole}.${String(fraction < 0n ? -fraction : fraction).padStart(2, "0")}`;
  return Money.of(decimalStr, currency as Currency);
}

/** Fetch budget default_currency (tenant_id = budget_id in this schema). */
async function getBudgetCurrency(budgetId: string): Promise<string> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (q: unknown) => Promise<{ rows: Array<{ default_currency: string }> }>;
    };
    const rs = await drizzleTx.execute(
      sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid LIMIT 1`,
    );
    return rs.rows[0]?.default_currency ?? "EUR";
  });
  return r.isOk() ? r.value : "EUR";
}

export function createReserveBalanceRepo(): ReserveBalanceRepo {
  return {
    async getForBudget(budgetId, tenantId, _asOf) {
      const currency = await getBudgetCurrency(budgetId);
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId("system"),
        async (tx) => {
          const drizzleTx = tx as {
            execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          const result = await drizzleTx.execute(
            sql`SELECT category_id, balance_cents
                FROM budgeting.category_reserve_balance
                WHERE budget_id = ${budgetId}::uuid`,
          );
          return result.rows;
        },
      );
      if (r.isErr()) throw r.error;
      const map = new Map<string, Money>();
      for (const row of r.value) {
        map.set(
          row.category_id as string,
          centsToMoney(row.balance_cents, currency),
        );
      }
      return map;
    },

    async getForCategory(budgetId, categoryId, tenantId, _asOf) {
      const currency = await getBudgetCurrency(budgetId);
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId("system"),
        async (tx) => {
          const drizzleTx = tx as {
            execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          const result = await drizzleTx.execute(
            sql`SELECT balance_cents
                FROM budgeting.category_reserve_balance
                WHERE budget_id = ${budgetId}::uuid
                  AND category_id = ${categoryId}::uuid`,
          );
          return result.rows[0] ?? null;
        },
      );
      if (r.isErr()) throw r.error;
      if (!r.value) {
        // No history for this category — return zero balance
        return Money.of("0", currency as Currency);
      }
      return centsToMoney(r.value.balance_cents, currency);
    },
  };
}
