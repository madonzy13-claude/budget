/**
 * compute-scheduled-monthly.ts — the retirement burn of a No-limit category (0083).
 *
 * The runway divides the pot by a monthly cost and projects it for decades, so
 * that cost has to be something the category will keep doing. An unbounded
 * category has no plan, so the household's rule (user, 260820) is:
 *
 *   max( average of the last 12 months of spend,
 *        the standing payments that run FOREVER, at their monthly rate )
 *
 * The arithmetic is the pure domain/retirement-burn; this assembles its two
 * inputs. "Forever" is literal: a rule carrying an end_date stops, and a ONCE
 * payment happens on one date, so neither is part of a perpetual burn.
 */
import { sql } from "drizzle-orm";
import type { FxProvider } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import { retirementBurn } from "../domain/retirement-burn";
import {
  scheduledMonthlyNormalize,
  type Cadence,
} from "./scheduled-monthly-normalize";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** The trailing history the average is taken over. Fewer months are used when
 *  that is all there is — a category three months old is not averaged over 12. */
const TRAILING_MONTHS = 12;

export interface ComputeScheduledMonthlyDeps {
  fxProvider: FxProvider;
  now?: () => Date;
}

type TxLike = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** categoryId → what it costs a month from here, in the budget's currency. */
export function computeScheduledMonthly(deps: ComputeScheduledMonthlyDeps) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    currency: string;
  }): Promise<Map<string, bigint>> => {
    const asOf = deps.now ? deps.now() : new Date();
    const today = asOf.toISOString().substring(0, 10);
    const from = new Date(asOf);
    from.setUTCMonth(from.getUTCMonth() - TRAILING_MONTHS);

    const r = await withTenantTx(
      TenantId(input.budgetId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const dz = tx as TxLike;
        // Spend already converted to the budget currency, by month, so the
        // average needs no FX of its own.
        const spend = await dz.execute(sql`
          SELECT category_id,
                 to_char(transaction_date, 'YYYY-MM') AS month,
                 COALESCE(SUM(amount_converted_cents), 0)::text AS cents
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${input.tenantId}::uuid
             AND kind = 'SPENDING'
             AND category_id IS NOT NULL
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
             AND transaction_date >= ${from.toISOString().substring(0, 10)}::date
             AND transaction_date < date_trunc('month', ${today}::date)
           GROUP BY category_id, to_char(transaction_date, 'YYYY-MM')
        `);
        // active = true also excludes soft-deleted rules, which set both.
        const rules = await dz.execute(sql`
          SELECT category_id,
                 currency,
                 (amount * 100)::bigint::text AS cents,
                 cadence,
                 next_due_date::text AS next_due,
                 end_date::text AS end_date
            FROM budgeting.scheduled_payments
           WHERE tenant_id = ${input.tenantId}::uuid
             AND active = true
             AND category_id IS NOT NULL
        `);
        return { spendRows: spend.rows, ruleRows: rules.rows };
      },
    );
    if (r.isErr()) throw r.error;
    const { spendRows, ruleRows } = r.value;

    const spendByCat = new Map<string, bigint[]>();
    for (const s of spendRows) {
      const id = s.category_id as string;
      const arr = spendByCat.get(id) ?? [];
      arr.push(BigInt(s.cents as string));
      spendByCat.set(id, arr);
    }

    // Perpetual rules only, FX-converted once each: anything with an end_date
    // stops, and ONCE is a single date — neither costs anything at infinity.
    const perpetualByCat = new Map<string, bigint>();
    for (const row of ruleRows) {
      if ((row.end_date as string | null) !== null) continue;
      const cadence = row.cadence as Cadence | "ONCE";
      if (cadence === "ONCE") continue;
      const id = row.category_id as string;
      const monthly = scheduledMonthlyNormalize(
        BigInt(row.cents as string),
        cadence,
      );
      if (monthly === 0n) continue;
      const inBudgetCcy = await sumWalletsToCurrency(
        [{ amount_cents: monthly, currency: row.currency as string }],
        input.currency,
        deps.fxProvider,
        asOf,
      );
      perpetualByCat.set(id, (perpetualByCat.get(id) ?? 0n) + inBudgetCcy);
    }

    const out = new Map<string, bigint>();
    for (const id of new Set([
      ...spendByCat.keys(),
      ...perpetualByCat.keys(),
    ])) {
      out.set(
        id,
        retirementBurn({
          trailingMonthlySpend: spendByCat.get(id) ?? [],
          perpetualMonthlyCents: perpetualByCat.get(id) ?? 0n,
        }),
      );
    }
    return out;
  };
}
