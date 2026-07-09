/**
 * compute-upcoming-by-category.ts — per-category "money still expected to go out
 * this month", used by the Overview "Upcoming" figure (r36).
 *
 * For each category returns the sum, in the budget's default currency, of:
 *   - unconfirmed SPENDING drafts dated in the current month (expense_ledger,
 *     confirmed_at NULL) — recurring-generated (due ≤ today) OR manual, and
 *   - projected recurring occurrences with today < due ≤ month-end that are NOT
 *     yet drafts (the engine only materialises drafts for due ≤ today, so these
 *     two sets are DISJOINT — no double counting).
 *
 * The Overview card then takes, per category, max(remainingBudget, upcoming) so a
 * recurring bill that already fits inside a category's leftover budget is not
 * counted twice (user's chosen "max per category" rule).
 *
 * Uncategorised items (category_id NULL) are bucketed under NONE_CATEGORY_KEY —
 * they have no category budget to max against, so the caller adds them directly.
 */
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { FxProvider } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import { nextOccurrence, type Cadence } from "../domain/cadence";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Map key for upcoming items that carry no category. */
export const NONE_CATEGORY_KEY = "__none__";

/** Backstop so a malformed cadence can never spin the projection loop forever. */
const MAX_PROJECTION_STEPS = 400;

export interface ComputeUpcomingByCategoryDeps {
  fxProvider: FxProvider;
  now?: () => Date;
}

type TxLike = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export function computeUpcomingByCategory(deps: ComputeUpcomingByCategoryDeps) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    /** YYYY-MM — the overview's current month. */
    month: string;
    /** Budget default currency (FX target). */
    currency: string;
  }): Promise<Map<string, bigint>> => {
    const asOf = deps.now ? deps.now() : new Date();
    const [y, m] = input.month.split("-").map(Number);
    const monthStart = Temporal.PlainDate.from({ year: y, month: m, day: 1 });
    const monthEnd = monthStart.with({ day: monthStart.daysInMonth });
    const today = Temporal.Now.plainDateISO();

    const r = await withTenantTx(
      TenantId(input.budgetId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const dz = tx as TxLike;
        const drafts = await dz.execute(sql`
          SELECT category_id,
                 currency_original AS currency,
                 amount_original_cents::text AS cents
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${input.tenantId}::uuid
             AND confirmed_at IS NULL
             AND deleted_at IS NULL
             AND kind = 'SPENDING'
             AND transaction_date >= ${monthStart.toString()}::date
             AND transaction_date <= ${monthEnd.toString()}::date
        `);
        const rules = await dz.execute(sql`
          SELECT category_id,
                 currency,
                 (amount * 100)::bigint::text AS cents,
                 cadence,
                 cadence_anchor,
                 weekly_dow,
                 yearly_month,
                 next_due_date::text AS next_due
            FROM budgeting.recurring_rules
           WHERE tenant_id = ${input.tenantId}::uuid
             AND active = true
        `);
        return { draftRows: drafts.rows, ruleRows: rules.rows };
      },
    );
    if (r.isErr()) throw r.error;
    const { draftRows, ruleRows } = r.value;

    // Collect per-category {cents, currency} items, FX-summed to budget ccy below.
    const byCat = new Map<
      string,
      { amount_cents: bigint; currency: string }[]
    >();
    const push = (catId: unknown, cents: bigint, currency: string) => {
      if (cents === 0n) return;
      const key = (catId as string | null) ?? NONE_CATEGORY_KEY;
      const arr = byCat.get(key) ?? [];
      arr.push({ amount_cents: cents, currency });
      byCat.set(key, arr);
    };

    for (const d of draftRows) {
      push(d.category_id, BigInt(d.cents as string), d.currency as string);
    }

    for (const rule of ruleRows) {
      const cents = BigInt(rule.cents as string);
      if (cents === 0n) continue;
      const spec = {
        cadence: rule.cadence as Cadence,
        anchorDay: (rule.cadence_anchor as number | null) ?? undefined,
        weeklyDow: (rule.weekly_dow as number | null) ?? undefined,
        yearlyMonth: (rule.yearly_month as number | null) ?? undefined,
      };
      let due = Temporal.PlainDate.from(rule.next_due as string);
      let steps = 0;
      while (
        Temporal.PlainDate.compare(due, monthEnd) <= 0 &&
        steps++ < MAX_PROJECTION_STEPS
      ) {
        // Only future occurrences not yet drafted (engine drafts due ≤ today).
        if (Temporal.PlainDate.compare(due, today) > 0) {
          push(rule.category_id, cents, rule.currency as string);
        }
        due = nextOccurrence(spec, due);
      }
    }

    const out = new Map<string, bigint>();
    for (const [key, items] of byCat) {
      out.set(
        key,
        await sumWalletsToCurrency(
          items,
          input.currency,
          deps.fxProvider,
          asOf,
        ),
      );
    }
    return out;
  };
}
