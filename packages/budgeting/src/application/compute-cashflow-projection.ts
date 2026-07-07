/**
 * compute-cashflow-projection.ts — impure loader for the Overview projection
 * timeline. Reads wallets / incomes / recurring rules / category budgets / month
 * spend via raw SQL over withTenantTx, pulls per-category reserve from the injected
 * reservePositions seam, FX-converts every amount to the budget currency, enumerates
 * dated income + bill events across the window, then hands a fully-materialised
 * CashflowSimInput to the pure simulateCashflow. Mirrors the raw-SQL style of
 * compute-upcoming-by-category.ts and recompute-income-under-planned-task.ts.
 */
import { Temporal } from "temporal-polyfill";
import { sql } from "drizzle-orm";
import { nextOccurrence, type CadenceSpec } from "../domain/cadence";
import {
  TenantId,
  UserId,
  type FxProvider,
  type Result,
} from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import {
  simulateCashflow,
  type CashflowProjection,
  type CashflowCategoryInput,
  type CashflowEvent,
} from "./simulate-cashflow-projection";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type TxLike = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

type CadenceRow = {
  amount_cents: string;
  currency: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadence_anchor: number | null;
  weekly_dow: number | null;
  yearly_month: number | null;
};

const specOf = (r: CadenceRow): CadenceSpec => ({
  cadence: r.cadence,
  anchorDay: r.cadence_anchor ?? undefined,
  weeklyDow: r.weekly_dow ?? undefined,
  yearlyMonth: r.yearly_month ?? undefined,
});

/** Backstop so a malformed cadence can never spin the projection loop forever. */
export const MAX_PROJECTION_STEPS = 400;

/**
 * Occurrence ISO dates strictly after `afterExclusive`, up to and including `end`,
 * following `spec` from `seed`. `seed` may be in the past (a recurring rule's
 * nextDueDate) — the loop advances until it clears `afterExclusive`.
 */
export function enumerateOccurrences(
  spec: CadenceSpec,
  opts: {
    seed: Temporal.PlainDate;
    afterExclusive: Temporal.PlainDate;
    end: Temporal.PlainDate;
  },
): string[] {
  const out: string[] = [];
  let cur = opts.seed;
  let steps = 0;
  while (
    Temporal.PlainDate.compare(cur, opts.end) <= 0 &&
    steps++ < MAX_PROJECTION_STEPS
  ) {
    if (Temporal.PlainDate.compare(cur, opts.afterExclusive) > 0) {
      out.push(cur.toString());
    }
    cur = nextOccurrence(spec, cur);
  }
  return out;
}

export interface ComputeCashflowProjectionDeps {
  fxProvider: FxProvider;
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<{ userDefinedCents: bigint }, Error>>;
  now?: () => Date;
}

export function computeCashflowProjection(deps: ComputeCashflowProjectionDeps) {
  return async (input: {
    tenantId: string;
    budgetId: string;
  }): Promise<CashflowProjection> => {
    const asOf = deps.now ? deps.now() : new Date();
    const today = Temporal.Now.plainDateISO();
    const startMonth = today.with({ day: 1 });
    const nextMonthStart = startMonth.add({ months: 1 });
    const windowEnd = nextMonthStart.with({ day: nextMonthStart.daysInMonth });
    const thisMonthStartStr = startMonth.toString();
    const thisMonthEndStr = startMonth
      .with({ day: startMonth.daysInMonth })
      .toString();
    const nextMonthStartStr = nextMonthStart.toString();

    // One read tx for all budget rows (read-only; no atomicity needed).
    const loaded = await withTenantTx(
      TenantId(input.budgetId),
      UserId(SYSTEM_USER_ID),
      async (txRaw) => {
        const tx = txRaw as TxLike;
        const meta = await tx.execute(sql`
          SELECT default_currency, cushion_mode_enabled
            FROM tenancy.budgets WHERE id = ${input.budgetId}::uuid`);
        if (meta.rows.length === 0) throw new Error("budget_not_found");
        const currency = (meta.rows[0] as { default_currency: string })
          .default_currency;
        const cushionMode = Boolean(
          (meta.rows[0] as { cushion_mode_enabled: boolean })
            .cushion_mode_enabled,
        );

        const wallets = await tx.execute(sql`
          SELECT (current_balance * 100)::bigint::text AS amount_cents, currency
            FROM budgeting.wallets
           WHERE tenant_id = ${input.tenantId}::uuid
             AND archived_at IS NULL
             AND wallet_type IN ('SPENDINGS'${cushionMode ? sql`, 'CUSHION'` : sql``})`);

        // Categories + this-month + next-month active limits (cushion vs normal).
        // POINT-IN-TIME predicates (limit effective ON a single date), NOT a
        // month range: SCD-2 keeps category_limits non-overlapping at any instant,
        // so an equality-at-a-date join returns exactly ONE row per category. A
        // range predicate (effective_from <= monthEnd AND effective_to > monthStart)
        // matches BOTH sides of a mid-month limit change → duplicate category rows
        // → doubled budget. `tl` = limit effective today; `nl` = limit effective at
        // the first of next month. Mirrors get-income-vs-planned's effective-today.
        const cats = await tx.execute(sql`
          SELECT c.id::text AS id, c.name AS name,
                 COALESCE(tl.normal_amount, 0)::text AS this_normal,
                 COALESCE(tl.cushion_amount, 0)::text AS this_cushion,
                 COALESCE(nl.normal_amount, 0)::text AS next_normal,
                 COALESCE(nl.cushion_amount, 0)::text AS next_cushion
            FROM budgeting.categories c
            LEFT JOIN budgeting.category_limits tl
              ON tl.category_id = c.id
             AND tl.effective_from <= ${today.toString()}::date
             AND (tl.effective_to IS NULL OR tl.effective_to > ${today.toString()}::date)
            LEFT JOIN budgeting.category_limits nl
              ON nl.category_id = c.id
             AND nl.effective_from <= ${nextMonthStartStr}::date
             AND (nl.effective_to IS NULL OR nl.effective_to > ${nextMonthStartStr}::date)
           WHERE c.tenant_id = ${input.tenantId}::uuid
             AND c.archived_at IS NULL`);

        const spend = await tx.execute(sql`
          SELECT category_id::text AS id, SUM(amount_converted_cents)::text AS spent
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${input.tenantId}::uuid
             AND kind = 'SPENDING'
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
             AND transaction_date >= ${thisMonthStartStr}::date
             AND transaction_date <= ${thisMonthEndStr}::date
           GROUP BY category_id`);

        const incomes = await tx.execute(sql`
          SELECT name, (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month
            FROM budgeting.incomes
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true`);

        const rules = await tx.execute(sql`
          SELECT category_id::text AS category_id, note,
                 (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month,
                 next_due_date::text AS next_due
            FROM budgeting.recurring_rules
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true`);

        return {
          currency,
          cushionMode,
          walletRows: wallets.rows,
          catRows: cats.rows,
          spendRows: spend.rows,
          incomeRows: incomes.rows,
          ruleRows: rules.rows,
        };
      },
    );
    if (loaded.isErr()) throw loaded.error;
    const L = loaded.value;
    const currency = L.currency;

    // Emergency reserve pot = total RESERVE-wallet money (userDefined reserve —
    // what the user sees as "available reserves"), NOT the engine's internal
    // per-category R (which can far exceed the actual wallet money).
    const rp = await deps.reservePositions({
      tenantId: input.tenantId,
      budgetId: input.budgetId,
    });
    const reservePoolCents = rp.isOk() ? rp.value.userDefinedCents : 0n;

    // Start cash = spendable wallets, FX→ccy.
    const walletItems = L.walletRows.map((r) => ({
      amount_cents: BigInt((r as { amount_cents: string }).amount_cents),
      currency: (r as { currency: string }).currency,
    }));
    const startCashCents =
      walletItems.length > 0
        ? await sumWalletsToCurrency(
            walletItems,
            currency,
            deps.fxProvider,
            asOf,
          )
        : 0n;

    // FX one amount to budget ccy (reuses the tested sum helper per distinct item).
    const fxOne = async (cents: bigint, from: string): Promise<bigint> =>
      from === currency
        ? cents
        : await sumWalletsToCurrency(
            [{ amount_cents: cents, currency: from }],
            currency,
            deps.fxProvider,
            asOf,
          );

    const spentById = new Map<string, bigint>();
    for (const r of L.spendRows)
      spentById.set(
        (r as { id: string }).id,
        BigInt((r as { spent: string }).spent),
      );

    const categories: CashflowCategoryInput[] = (
      L.catRows as Record<string, string>[]
    ).map((r) => {
      const thisBudget = BigInt(L.cushionMode ? r.this_cushion : r.this_normal);
      const nextBudget = BigInt(L.cushionMode ? r.next_cushion : r.next_normal);
      return {
        id: r.id,
        name: r.name,
        budgetThisMonthCents: thisBudget,
        budgetNextMonthCents: nextBudget,
        spentSoFarCents: spentById.get(r.id) ?? 0n,
      };
    });

    // Income pay-dates strictly after today within the window. nextOccurrence
    // advances a FULL period from `prev`, so seeding at `today` would SKIP this
    // month's pay-day (nextOccurrence(MONTHLY anchor 25, Jul-15) → Aug-25). Seed
    // MONTHLY/YEARLY at the current period's anchor via incomeSeedDate (below);
    // DAILY/WEEKLY walk forward from today with no skip risk.
    const incomePayments: CashflowEvent[] = [];
    for (const raw of L.incomeRows) {
      const r = raw as CadenceRow & { name: string };
      const cents = BigInt(r.amount_cents);
      if (cents === 0n) continue;
      const amt = await fxOne(cents, r.currency);
      for (const date of enumerateOccurrences(specOf(r), {
        seed: incomeSeedDate(r, today),
        afterExclusive: today,
        end: windowEnd,
      })) {
        incomePayments.push({ date, name: r.name, amountCents: amt });
      }
    }

    // Recurring bills (seeded from nextDueDate), amount FX'd once each.
    const bills: CashflowEvent[] = [];
    for (const raw of L.ruleRows) {
      const r = raw as CadenceRow & {
        category_id: string | null;
        note: string | null;
        next_due: string;
      };
      const cents = BigInt(r.amount_cents);
      if (cents === 0n) continue;
      const amt = await fxOne(cents, r.currency);
      const seed = Temporal.PlainDate.from(r.next_due);
      for (const date of enumerateOccurrences(specOf(r), {
        seed,
        afterExclusive: today,
        end: windowEnd,
      })) {
        bills.push({
          date,
          name: r.note ?? "",
          categoryId: r.category_id,
          amountCents: amt,
        });
      }
    }

    return simulateCashflow({
      today: today.toString(),
      windowEnd: windowEnd.toString(),
      currency,
      startCashCents,
      reservePoolCents,
      categories,
      incomePayments,
      bills,
    });
  };
}

/**
 * Seed date for enumerating an income's pay-dates. nextOccurrence advances a FULL
 * period from `prev`, so seeding at `today` would skip this month's pay-day. Seed
 * MONTHLY/YEARLY at the current period's anchor (may be ≤ today — enumerateOccurrences
 * then drops it and advances); DAILY/WEEKLY walk forward from today with no skip risk.
 */
export function incomeSeedDate(
  r: {
    cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    cadence_anchor: number | null;
    yearly_month: number | null;
  },
  today: Temporal.PlainDate,
): Temporal.PlainDate {
  if (r.cadence === "MONTHLY") {
    return today.with({
      day: Math.min(r.cadence_anchor ?? today.day, today.daysInMonth),
    });
  }
  if (r.cadence === "YEARLY") {
    const month = r.yearly_month ?? today.month;
    const dim = Temporal.PlainDate.from({
      year: today.year,
      month,
      day: 1,
    }).daysInMonth;
    return Temporal.PlainDate.from({
      year: today.year,
      month,
      day: Math.min(r.cadence_anchor ?? 1, dim),
    });
  }
  return today; // DAILY / WEEKLY
}
