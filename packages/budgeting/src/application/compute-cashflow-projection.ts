/**
 * compute-cashflow-projection.ts — impure loader for the Overview projection
 * timeline. Reads wallets / incomes / scheduled rules / category budgets / month
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
  cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
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

/** How far ahead the forecast looks: a rolling 100 days (user, 260812). */
export const PROJECTION_WINDOW_DAYS = 100;

/**
 * Occurrence ISO dates strictly after `afterExclusive`, up to and including `end`,
 * following `spec` from `seed`. `seed` may be in the past (a scheduled rule's
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
    // ONCE happens once. Its "next occurrence" is the following day — the step
    // the generation loop uses to clear its own deadline — so walking it here
    // would draw a single sofa as a daily payment (260807).
    if (spec.cadence === "ONCE") break;
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
    // 100 days (user, 260812). "To the end of next month" was
    // a horizon that shrank as the month ran out: on the 30th it forecast one
    // month, on the 1st two. A fixed span always looks the same distance ahead.
    const windowEnd = today.add({ days: PROJECTION_WINDOW_DAYS - 1 });
    const thisMonthStartStr = startMonth.toString();
    const thisMonthEndStr = startMonth
      .with({ day: startMonth.daysInMonth })
      .toString();

    // Every month the window touches (up to four), and the date at which each
    // one's limit is read: TODAY for the running month — a limit raised
    // mid-month is in force now — and the 1st for the months after it.
    const monthProbes: { key: string; asOfDate: string }[] = [];
    for (
      let m = startMonth;
      Temporal.PlainDate.compare(m, windowEnd) <= 0;
      m = m.add({ months: 1 })
    ) {
      const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
      monthProbes.push({
        key,
        asOfDate: monthProbes.length === 0 ? today.toString() : m.toString(),
      });
    }
    const firstProbe = monthProbes[0]!.asOfDate;
    const lastProbe = monthProbes[monthProbes.length - 1]!.asOfDate;

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

        // SPENDINGS only. Cushion money is not spendable where it sits — moving
        // it into a spendings wallet is a deliberate act, and until the member
        // makes it the forecast must not spend it for them (user, 260812).
        const wallets = await tx.execute(sql`
          SELECT (current_balance * 100)::bigint::text AS amount_cents, currency
            FROM budgeting.wallets
           WHERE tenant_id = ${input.tenantId}::uuid
             AND archived_at IS NULL
             AND current_balance >= 0
             AND wallet_type = 'SPENDINGS'`);

        // Categories + this-month + next-month active limits (cushion vs normal).
        // POINT-IN-TIME predicates (limit effective ON a single date), NOT a
        // month range: SCD-2 keeps category_limits non-overlapping at any instant,
        // so an equality-at-a-date join returns exactly ONE row per category. A
        // range predicate (effective_from <= monthEnd AND effective_to > monthStart)
        // matches BOTH sides of a mid-month limit change → duplicate category rows
        // → doubled budget. `tl` = limit effective today; `nl` = limit effective at
        // the first of next month. Mirrors get-income-vs-planned's effective-today.
        const cats = await tx.execute(sql`
          SELECT c.id::text AS id, c.name AS name
            FROM budgeting.categories c
           WHERE c.tenant_id = ${input.tenantId}::uuid
             AND c.archived_at IS NULL`);

        // Every limit in force at any of the month probes, resolved per month in
        // JS. SCD-2 keeps the rows non-overlapping at an instant, so the
        // point-in-time predicate below picks exactly one per category per probe
        // — and it holds for reconstructed rows too, which close on the month's
        // LAST day rather than the next month's first.
        const limits = await tx.execute(sql`
          SELECT cl.category_id::text AS category_id,
                 cl.normal_amount::text AS normal_amount,
                 cl.cushion_amount::text AS cushion_amount,
                 cl.effective_from::text AS effective_from,
                 cl.effective_to::text AS effective_to
            FROM budgeting.category_limits cl
            JOIN budgeting.categories c ON c.id = cl.category_id
           WHERE c.tenant_id = ${input.tenantId}::uuid
             AND cl.effective_from <= ${lastProbe}::date
             AND (cl.effective_to IS NULL OR cl.effective_to > ${firstProbe}::date)`);

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

        // Occurrences whose date has passed with no answer yet. Generating a
        // draft rolls the rule's next_due_date forward, so this money is in
        // NEITHER of the two places the projection looks: not a future bill,
        // not confirmed spend. It still rides inside the category's daily burn
        // (the plan hasn't been consumed), and the tooltip says so — the user
        // asked to see that it is still counted and still drifting (260812).
        // Dismissed drafts are answers, so they drop out.
        const pending = await tx.execute(sql`
          SELECT e.transaction_date::text AS date,
                 COALESCE(NULLIF(e.note, ''), sp.note, '') AS name,
                 e.category_id::text AS category_id,
                 e.amount_converted_cents::text AS amount_cents
            FROM budgeting.expense_ledger e
            LEFT JOIN budgeting.scheduled_payments sp ON sp.id = e.scheduled_payment_id
           WHERE e.tenant_id = ${input.tenantId}::uuid
             AND e.kind = 'SPENDING'
             AND e.confirmed_at IS NULL
             AND e.deleted_at IS NULL
             AND e.dismissed_at IS NULL
             AND e.transaction_date <= ${today.toString()}::date
           ORDER BY e.transaction_date`);

        const incomes = await tx.execute(sql`
          SELECT name, (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month,
                 once_date::text AS once_date
            FROM budgeting.incomes
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true
             -- Gone the day after it arrives, like every other read (260807).
             AND (cadence <> 'ONCE' OR once_date >= CURRENT_DATE)`);

        const rules = await tx.execute(sql`
          SELECT category_id::text AS category_id, note,
                 (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month,
                 next_due_date::text AS next_due, end_date::text AS end_date
            FROM budgeting.scheduled_payments
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true`);

        return {
          currency,
          cushionMode,
          walletRows: wallets.rows,
          catRows: cats.rows,
          limitRows: limits.rows,
          spendRows: spend.rows,
          pendingRows: pending.rows,
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

    // The limit in force at each month probe, per category.
    type LimitRow = {
      category_id: string;
      normal_amount: string;
      cushion_amount: string;
      effective_from: string;
      effective_to: string | null;
    };
    const limitsByCat = new Map<string, LimitRow[]>();
    for (const raw of L.limitRows as LimitRow[]) {
      const arr = limitsByCat.get(raw.category_id) ?? [];
      arr.push(raw);
      limitsByCat.set(raw.category_id, arr);
    }
    const budgetAt = (categoryId: string, onDate: string): bigint => {
      const row = (limitsByCat.get(categoryId) ?? []).find(
        (l) =>
          l.effective_from <= onDate &&
          (l.effective_to === null || l.effective_to > onDate),
      );
      if (!row) return 0n;
      return BigInt(L.cushionMode ? row.cushion_amount : row.normal_amount);
    };

    const categories: CashflowCategoryInput[] = (
      L.catRows as Record<string, string>[]
    ).map((r) => {
      const budgetByMonth: Record<string, bigint> = {};
      for (const p of monthProbes)
        budgetByMonth[p.key] = budgetAt(r.id, p.asOfDate);
      return {
        id: r.id,
        name: r.name,
        budgetByMonth,
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

    // Scheduled bills (seeded from nextDueDate), amount FX'd once each.
    const bills: CashflowEvent[] = [];
    for (const raw of L.ruleRows) {
      const r = raw as CadenceRow & {
        category_id: string | null;
        note: string | null;
        next_due: string;
        end_date: string | null;
      };
      const cents = BigInt(r.amount_cents);
      if (cents === 0n) continue;
      const amt = await fxOne(cents, r.currency);
      const seed = Temporal.PlainDate.from(r.next_due);
      // Stop projecting occurrences past the rule's "last date" (inclusive).
      const enumEnd =
        r.end_date && r.end_date < windowEnd.toString()
          ? Temporal.PlainDate.from(r.end_date)
          : windowEnd;
      for (const date of enumerateOccurrences(specOf(r), {
        seed,
        afterExclusive: today,
        end: enumEnd,
      })) {
        bills.push({
          date,
          name: r.note ?? "",
          categoryId: r.category_id,
          amountCents: amt,
        });
      }
    }

    // Already stored in the budget currency (amount_converted_cents), so no FX.
    const pendingDrafts: CashflowEvent[] = (
      L.pendingRows as Record<string, string | null>[]
    ).map((r) => ({
      date: r.date as string,
      name: r.name ?? "",
      categoryId: r.category_id,
      amountCents: BigInt(r.amount_cents as string),
    }));

    const simInput = {
      today: today.toString(),
      windowEnd: windowEnd.toString(),
      currency,
      startCashCents,
      reservePoolCents,
      categories,
      incomePayments,
      bills,
      pendingDrafts,
    };

    // The LINE drips the plan evenly — that is the readable shape, and the one
    // the tooltip explains. The WITHDRAWABLE figure comes from a second, pessimistic
    // run where each month's plan is spendable the moment the month opens: you
    // could genuinely spend it that fast, and only that reading gives an answer
    // that doesn't drift upward every morning you underspend (user, 260812).
    const line = simulateCashflow({ ...simInput, spendTiming: "even" });
    const worstCase = simulateCashflow({
      ...simInput,
      spendTiming: "immediate",
    });
    return { ...line, safeToWithdraw: worstCase.safeToWithdraw };
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
    cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    cadence_anchor: number | null;
    yearly_month: number | null;
    once_date?: string | null;
  },
  today: Temporal.PlainDate,
): Temporal.PlainDate {
  // A one-time income has no anchor to derive a day from — its date IS the
  // occurrence. Without one there is nothing to place, so it seeds at today and
  // the enumeration drops it.
  if (r.cadence === "ONCE") {
    return r.once_date ? Temporal.PlainDate.from(r.once_date) : today;
  }
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
