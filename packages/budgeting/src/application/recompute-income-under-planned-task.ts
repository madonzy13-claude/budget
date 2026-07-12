/**
 * recompute-income-under-planned-task.ts — create-or-resolve helper for the
 * INCOME_UNDER_PLANNED task kind (r33).
 *
 * Fires when the AVAILABLE money (all FX→budget ccy) is LESS than the total planned
 * spending (Σ category planned) — a "your plan outspends what you have, review your
 * spendings" nudge. NO income gate: a budget with no income configured but a plan it
 * can't cover still fires. Available =
 *   + UPCOMING income — payments still to arrive THIS month (pay-day not yet passed;
 *     already-received income sits in a wallet and is counted there, no double count)
 *   + Σ SPENDINGS wallet balances
 *   + Σ CUSHION wallet balances — ONLY when the month is in cushion mode
 *     (cushion_mode_enabled); RESERVE wallets are NOT counted (earmarked buffer).
 * Planned counts EVERY
 * category INCLUDING a MANUAL Investments amount (planning to invest more than you
 * earn IS overcommitment — you can't invest money you don't have). The only
 * exclusion is a SMART Investments category: its planned is `income − needs − wants`
 * (clamped ≥0), so including it nets back to income and can never exceed it —
 * mathematically identical to excluding it (the fire condition reduces to
 * `income < Σ other planned` either way). Its stored normal_amount is not its real
 * limit, so we drop it from the raw sum.
 *
 * Mirrors recompute-cushion-task.ts: pure decision + a tx-based compute (raw SQL,
 * like computeCushionSummary) so it runs INSIDE the trigger mutation's withTenantTx
 * (atomic, sees uncommitted changes).
 *
 * Caller sites (every mutation that can change income or planned):
 *   - incomes routes: create / update / delete income
 *   - set-category-limit.ts (planned normal_amount change)
 *   - budgets PATCH route (default_currency change → income FX baseline)
 *   - budgeting-reconciliation.ts (hourly sweep — catches income-currency FX drift)
 *
 * Idempotency: emit = INSERT ON CONFLICT DO UPDATE (refreshes the payload with the
 * live shortfall) via the partial unique index tasks_income_under_planned_pending_uq
 * (budget_id) WHERE kind='INCOME_UNDER_PLANNED' AND status='PENDING'. Resolve =
 * UPDATE WHERE status='PENDING' (no-op if none open). Safe to call N times.
 */
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { FxProvider } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import { recurringMonthlyNormalize } from "./recurring-monthly-normalize";
import type { TaskRepo, IncomeUnderPlannedPayload } from "../ports/task-repo";

/** System user for own-tx recomputes (no human actor on the trigger path). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Adapter-shape tx (matches computeCushionSummary / resolve-task). */
type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Pure emit-or-resolve decision. Fires when AVAILABLE money is strictly below the
 * planned spend. NO income gate — a budget with no income configured but a plan it
 * can't cover still fires. Available = upcoming income (payments still to arrive
 * this month) + spendings [+ cushion in cushion mode] wallet balances. Equal → no
 * fire.
 */
export function decideIncomeUnderPlanned(input: {
  availableCents: bigint;
  plannedCents: bigint;
}): { emit: boolean; shortfallCents: bigint } {
  const shortfall = input.plannedCents - input.availableCents;
  return shortfall > 0n
    ? { emit: true, shortfallCents: shortfall }
    : { emit: false, shortfallCents: 0n };
}

export interface IncomeVsPlanned {
  /** Upcoming income this month (pay-day not yet passed), FX→budget ccy. */
  upcomingIncomeCents: bigint;
  /** Σ spendable wallet balances (spendings [+ cushion in cushion mode]), FX→budget ccy. */
  walletCents: bigint;
  /** upcomingIncomeCents + walletCents — the money compared against planned. */
  availableCents: bigint;
  plannedCents: bigint;
  currency: string;
}

/** Raw income row shape for the upcoming-income projection. */
interface IncomeRow {
  amount_cents: string;
  currency: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadence_anchor: number | null;
  yearly_month: number | null;
}

/**
 * "Upcoming income" = money expected to arrive later THIS month, so it's spendable
 * toward the plan but not yet sitting in a wallet. A MONTHLY/YEARLY income counts
 * only while its pay-day this month is still in the FUTURE — once the pay-day has
 * passed the money has arrived and is now counted in a wallet, so we drop it here
 * (no double count). DAILY/WEEKLY income has no single pay-day → treated as
 * continuously upcoming (monthly-normalized). Amounts stay in their own currency;
 * the caller FX-sums to the budget currency.
 */
export function upcomingIncomeItems(
  rows: IncomeRow[],
  today: Temporal.PlainDate,
): { amount_cents: bigint; currency: string }[] {
  const out: { amount_cents: bigint; currency: string }[] = [];
  const dim = today.daysInMonth;
  for (const r of rows) {
    const cents = BigInt(r.amount_cents);
    if (cents === 0n) continue;
    if (r.cadence === "MONTHLY" || r.cadence === "YEARLY") {
      // YEARLY only pays in its configured month.
      if (r.cadence === "YEARLY" && r.yearly_month !== today.month) continue;
      const payDay = Math.min(r.cadence_anchor ?? dim, dim);
      if (today.day < payDay) {
        out.push({ amount_cents: cents, currency: r.currency });
      }
    } else {
      // DAILY / WEEKLY — no fixed pay-day; treat as continuously upcoming.
      out.push({
        amount_cents: recurringMonthlyNormalize(cents, r.cadence),
        currency: r.currency,
      });
    }
  }
  return out;
}

/**
 * Read active incomes + wallet balances + total planned (non-investment,
 * non-archived, effective today) for a budget and return the comparable monthly
 * figures in budget currency. Raw SQL over the open tx so it sees the trigger
 * mutation's writes.
 */
export async function computeIncomeVsPlanned(
  tx: TenantTx,
  input: {
    tenantId: string;
    budgetId: string;
    fxProvider: FxProvider;
    now?: () => Date;
  },
): Promise<IncomeVsPlanned> {
  const budgetRow = await tx.execute(sql`
    SELECT default_currency, cushion_mode_enabled
      FROM tenancy.budgets
     WHERE id = ${input.budgetId}::uuid
  `);
  if (budgetRow.rows.length === 0) {
    throw new Error(`Budget not found: ${input.budgetId}`);
  }
  const currency = (budgetRow.rows[0] as { default_currency: string })
    .default_currency;
  // Cushion wallets count toward available money ONLY when the CURRENT MONTH is in
  // cushion mode (cushion_mode_enabled) — that's when the cushion buffer is being
  // spent against. Off = the cushion is an untouchable buffer, not available.
  const cushionModeEnabled = Boolean(
    (budgetRow.rows[0] as { cushion_mode_enabled: boolean })
      .cushion_mode_enabled,
  );

  const asOf = (input.now ?? (() => new Date()))();
  const today = Temporal.Now.plainDateISO();

  // Active incomes → keep only the payments still UPCOMING this month (pay-day not
  // yet passed) → FX sum. Income already received this month sits in a wallet and
  // is counted there instead.
  const incomeRows = await tx.execute(sql`
    SELECT (amount * 100)::bigint::text AS amount_cents,
           currency, cadence, cadence_anchor, yearly_month
      FROM budgeting.incomes
     WHERE tenant_id = ${input.tenantId}::uuid
       AND active = true
  `);
  const upcomingItems = upcomingIncomeItems(
    incomeRows.rows as unknown as IncomeRow[],
    today,
  );
  const upcomingIncomeCents =
    upcomingItems.length > 0
      ? await sumWalletsToCurrency(
          upcomingItems,
          currency,
          input.fxProvider,
          asOf,
        )
      : 0n;

  // Spendable wallet balances toward the plan: SPENDINGS always, CUSHION only in
  // cushion mode (see above). RESERVE is NOT spendable here (earmarked buffer).
  // (current_balance * 100)::bigint mirrors overview-cards-repo. FX→budget ccy.
  const walletRows = await tx.execute(sql`
    SELECT (current_balance * 100)::bigint::text AS amount_cents,
           currency,
           wallet_type
      FROM budgeting.wallets
     WHERE tenant_id = ${input.tenantId}::uuid
       AND archived_at IS NULL
       AND current_balance >= 0
       AND wallet_type IN (
         'SPENDINGS'${cushionModeEnabled ? sql`, 'CUSHION'` : sql``}
       )
  `);
  const walletItems = walletRows.rows.map((r) => ({
    amount_cents: BigInt((r as { amount_cents: string }).amount_cents),
    currency: (r as { currency: string }).currency,
  }));
  const walletCents =
    walletItems.length > 0
      ? await sumWalletsToCurrency(
          walletItems,
          currency,
          input.fxProvider,
          asOf,
        )
      : 0n;

  const availableCents = upcomingIncomeCents + walletCents;

  // Total planned = Σ normal_amount over effective (today) category_limits for
  // NON-archived categories, INCLUDING a manual Investments amount, EXCLUDING only
  // a SMART Investments category (its normal_amount isn't its real limit and it
  // nets to income anyway). normal_amount is budget-ccy cents (raw, no FX — parity
  // with get-cushion-summary + effectiveForMonth).
  const todayStr = Temporal.Now.plainDateISO().toString();
  const plannedRow = await tx.execute(sql`
    SELECT COALESCE(SUM(cl.normal_amount), 0)::text AS total
      FROM budgeting.category_limits cl
      JOIN budgeting.categories c ON c.id = cl.category_id
     WHERE cl.tenant_id = ${input.tenantId}::uuid
       AND cl.effective_from <= ${todayStr}::date
       AND (cl.effective_to IS NULL OR cl.effective_to > ${todayStr}::date)
       AND c.archived_at IS NULL
       AND NOT (c.is_investment = true AND c.investment_limit_mode = 'smart')
  `);
  const plannedCents = BigInt((plannedRow.rows[0] as { total: string }).total);

  return {
    upcomingIncomeCents,
    walletCents,
    availableCents,
    plannedCents,
    currency,
  };
}

export interface RecomputeIncomeUnderPlannedDeps {
  taskRepo: TaskRepo;
  fxProvider: FxProvider;
  now?: () => Date;
}

/**
 * Recompute income-vs-planned and emit-or-resolve the INCOME_UNDER_PLANNED task.
 * MUST be called inside an existing withTenantTx.
 */
export async function recomputeIncomeUnderPlannedTask(
  tx: TenantTx,
  input: { tenantId: string; budgetId: string },
  deps: RecomputeIncomeUnderPlannedDeps,
): Promise<void> {
  const vp = await computeIncomeVsPlanned(tx, {
    tenantId: input.tenantId,
    budgetId: input.budgetId,
    fxProvider: deps.fxProvider,
    now: deps.now,
  });

  const decision = decideIncomeUnderPlanned({
    availableCents: vp.availableCents,
    plannedCents: vp.plannedCents,
  });

  if (!decision.emit) {
    await deps.taskRepo.resolveByKindAndBudget(
      input.tenantId,
      input.budgetId,
      "INCOME_UNDER_PLANNED",
      tx,
    );
    return;
  }

  const payload: IncomeUnderPlannedPayload = {
    income_cents: vp.upcomingIncomeCents.toString(),
    available_cents: vp.availableCents.toString(),
    planned_cents: vp.plannedCents.toString(),
    shortfall_cents: decision.shortfallCents.toString(),
    currency: vp.currency,
  };
  await deps.taskRepo.emitIncomeUnderPlanned(
    input.tenantId,
    input.budgetId,
    payload,
    tx,
  );
}

/**
 * Standalone factory: opens its OWN withTenantTx and runs the recompute. For
 * callers that mutate income/planned via repos (own tx) and then want to refresh
 * the task in a fresh tx AFTER the save — mirrors set-category-limit's cushion
 * recompute ("errors don't fail the save"). Never throws to the caller.
 */
export function makeRecomputeIncomeUnderPlannedTask(
  deps: RecomputeIncomeUnderPlannedDeps,
) {
  return async (input: {
    tenantId: string;
    budgetId: string;
  }): Promise<void> => {
    try {
      await withTenantTx(
        TenantId(input.tenantId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          await recomputeIncomeUnderPlannedTask(
            tx as unknown as TenantTx,
            input,
            deps,
          );
        },
      );
    } catch (e) {
      console.error(
        `[income-under-planned] recompute failed for budget ${input.budgetId}:`,
        e,
      );
    }
  };
}
