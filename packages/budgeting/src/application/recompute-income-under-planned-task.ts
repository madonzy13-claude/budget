/**
 * recompute-income-under-planned-task.ts — create-or-resolve helper for the
 * INCOME_UNDER_PLANNED task kind (r33).
 *
 * Fires when a budget HAS income and the total monthly income (FX→budget ccy) is
 * LESS than the total planned spending (Σ category planned) — a "your plan
 * outspends your income, review your spendings" nudge. Planned counts EVERY
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
import { normalizeIncomesToMonthlyItems } from "./investment-smart-limit";
import type { TaskRepo, IncomeUnderPlannedPayload } from "../ports/task-repo";

/** System user for own-tx recomputes (no human actor on the trigger path). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Adapter-shape tx (matches computeCushionSummary / resolve-task). */
type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Pure emit-or-resolve decision. Fires ONLY when the budget has income AND the
 * monthly income is strictly below the planned spend. Equal → no fire (nothing
 * left to invest, but no overspend either).
 */
export function decideIncomeUnderPlanned(input: {
  hasIncome: boolean;
  monthlyIncomeCents: bigint;
  plannedCents: bigint;
}): { emit: boolean; shortfallCents: bigint } {
  if (!input.hasIncome) return { emit: false, shortfallCents: 0n };
  const shortfall = input.plannedCents - input.monthlyIncomeCents;
  return shortfall > 0n
    ? { emit: true, shortfallCents: shortfall }
    : { emit: false, shortfallCents: 0n };
}

export interface IncomeVsPlanned {
  hasIncome: boolean;
  monthlyIncomeCents: bigint;
  plannedCents: bigint;
  currency: string;
}

/**
 * Read active incomes + total planned (non-investment, non-archived, effective
 * today) for a budget and return the two comparable monthly figures in budget
 * currency. Raw SQL over the open tx so it sees the trigger mutation's writes.
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
    SELECT default_currency
      FROM tenancy.budgets
     WHERE id = ${input.budgetId}::uuid
  `);
  if (budgetRow.rows.length === 0) {
    throw new Error(`Budget not found: ${input.budgetId}`);
  }
  const currency = (budgetRow.rows[0] as { default_currency: string })
    .default_currency;

  // Active incomes (own currency + cadence) → monthly-equivalent items → FX sum.
  const incomeRows = await tx.execute(sql`
    SELECT amount::text AS amount, currency, cadence
      FROM budgeting.incomes
     WHERE tenant_id = ${input.tenantId}::uuid
       AND active = true
  `);
  const incomes = incomeRows.rows as Array<{
    amount: string;
    currency: string;
    cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  }>;
  const hasIncome = incomes.length > 0;
  const asOf = (input.now ?? (() => new Date()))();
  const monthlyIncomeCents = hasIncome
    ? await sumWalletsToCurrency(
        normalizeIncomesToMonthlyItems(incomes),
        currency,
        input.fxProvider,
        asOf,
      )
    : 0n;

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

  return { hasIncome, monthlyIncomeCents, plannedCents, currency };
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
    hasIncome: vp.hasIncome,
    monthlyIncomeCents: vp.monthlyIncomeCents,
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
    income_cents: vp.monthlyIncomeCents.toString(),
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
