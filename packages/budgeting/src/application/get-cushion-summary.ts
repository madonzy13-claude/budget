/**
 * get-cushion-summary.ts — Single source of cushion math (Phase 7, D-PH7-20).
 *
 * Used by BOTH:
 *   - recompute-cushion-task.ts (auto-resolve helper called from every mutation
 *     that can change cushion shortfall — Plans 04/05/06/07)
 *   - GET /budgets/:id/cushion-summary HTTP endpoint (Plan 07)
 *
 * Math (D-PH7-16):
 *   required_cents = Σ(category_limits.cushion_amount at PIT) × budgets.cushion_target_months
 *   actual_cents   = Σ(wallets WHERE wallet_type='CUSHION') with non-budget-currency
 *                    wallets FX-converted via computeRecurringFx
 *   shortfall_cents = required_cents − actual_cents
 *
 * FX as-of date is TODAY (`Temporal.Now.plainDateISO()`) — Pitfall 5 in
 * 07-RESEARCH.md. The cushion summary answers "what does my cushion look like
 * RIGHT NOW", so the FX rate is the current rate — NOT pinned to any transaction.
 *
 * bigint cents throughout the math; convert to string only at the DTO boundary.
 *
 * Short-circuit: when `cushion_enabled = false` we return an all-zero DTO with
 * `enabled=false` without reading category_limits / wallets. This keeps the
 * "auto-resolve cushion task" path cheap for budgets that have cushion off.
 *
 * Schema notes (v1.1):
 *   - budgeting.category_limits.cushion_amount is the canonical bigint cents
 *     column (NOT NULL); cushion_amount_cents is the parallel nullable column
 *     introduced in MIG-05. We read cushion_amount for parity with
 *     budget-home-summary-repo.ts (which is the existing canonical reader).
 *   - budgeting.wallets has `current_balance numeric(19,4)` (NOT `amount_cents`);
 *     we convert to cents at the boundary via `(current_balance * 100)::bigint`.
 *   - Neither `category_limits` nor `wallets` carry a `budget_id` column —
 *     v1.1 invariant `tenant_id === budget_id` means tenant_id filtering is
 *     sufficient. Both columns are still constrained by RLS through the
 *     `app.tenant_ids` GUC set by the caller's withTenantTx.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { computeRecurringFx, type FxProviderLike } from "./recurring-engine-fx";

/**
 * Adapter-shape tx (matches existing pattern across the application layer —
 * see resolve-task.ts, recurring-engine-fx callers). The runtime drizzle tx is
 * cast to this shape inside the function; no drizzle types leak across the
 * application boundary.
 */
type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * System user UUID used when no human actor is on the request path.
 * Mirrors task-repo.ts / budget-home-summary-repo.ts precedent.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface CushionSummaryDTO {
  required_cents: string;
  actual_cents: string;
  shortfall_cents: string;
  currency: string;
  enabled: boolean;
  target_months: number;
}

/**
 * Pure shape function — accepts an OPEN tx and returns the DTO. Callers MUST
 * have already set the tenant context via withTenantTx (RLS scope) before
 * invoking this function. Generators piggyback this on the trigger event's tx.
 */
export async function computeCushionSummary(
  tx: TenantTx,
  input: {
    tenantId: string;
    budgetId: string;
    fxProvider: FxProviderLike;
  },
): Promise<CushionSummaryDTO> {
  // 1. Read budget flags + currency + target_months
  const budgetRow = await tx.execute(sql`
    SELECT cushion_enabled, cushion_target_months, default_currency
      FROM tenancy.budgets
     WHERE id = ${input.budgetId}::uuid
  `);
  if (budgetRow.rows.length === 0) {
    throw new Error(`Budget not found: ${input.budgetId}`);
  }
  const budget = budgetRow.rows[0] as {
    cushion_enabled: boolean;
    cushion_target_months: number;
    default_currency: string;
  };

  // Short-circuit: cushion disabled → all zeros, no further reads needed.
  if (!budget.cushion_enabled) {
    return {
      required_cents: "0",
      actual_cents: "0",
      shortfall_cents: "0",
      currency: budget.default_currency,
      enabled: false,
      target_months: budget.cushion_target_months,
    };
  }

  // 2. Sum category cushion amounts at PIT (SCD-2 active row predicate matches
  //    budget-home-summary-repo.ts:175-176). We use the canonical
  //    `cushion_amount` column (NOT NULL) rather than the v1.1 parallel
  //    `cushion_amount_cents` to stay consistent with the rest of the codebase.
  //    Active row = effective_from <= today AND (effective_to IS NULL OR
  //    effective_to > today). v1.1: tenant_id === budget_id; filter on
  //    tenant_id (category_limits has no budget_id column).
  const todayPlainDate = Temporal.Now.plainDateISO();
  const todayStr = todayPlainDate.toString();
  const cushionAmounts = await tx.execute(sql`
    SELECT COALESCE(SUM(cushion_amount), 0)::text AS total
      FROM budgeting.category_limits
     WHERE tenant_id = ${input.tenantId}::uuid
       AND effective_from <= ${todayStr}::date
       AND (effective_to IS NULL OR effective_to > ${todayStr}::date)
  `);
  const totalCushion = BigInt(
    (cushionAmounts.rows[0] as { total: string }).total,
  );
  const targetMonths = BigInt(budget.cushion_target_months);
  const requiredCents = totalCushion * targetMonths;

  // 3. Read CUSHION wallets (active = archived_at IS NULL). v1.1: tenant-scoped
  //    (wallets has no budget_id column). current_balance is numeric(19,4) —
  //    multiply by 100 and round to get bigint cents at the boundary.
  const cushionWallets = await tx.execute(sql`
    SELECT currency,
           (current_balance * 100)::bigint::text AS amount_cents
      FROM budgeting.wallets
     WHERE tenant_id = ${input.tenantId}::uuid
       AND wallet_type = 'CUSHION'
       AND archived_at IS NULL
  `);

  // 4. FX-convert to budget currency (TODAY as as-of — Pitfall 5).
  //    Reuse computeRecurringFx: it handles same-currency short-circuit and
  //    enforces the `0 < rate < 1e6` bounds check (T-07-03-01 mitigation).
  let actualCents = 0n;
  for (const row of cushionWallets.rows as Array<{
    currency: string;
    amount_cents: string;
  }>) {
    const fxResult = await computeRecurringFx({
      ruleCurrency: row.currency,
      budgetCurrency: budget.default_currency,
      amountOriginalCents: row.amount_cents,
      dueDateStr: todayStr,
      fxProvider: input.fxProvider,
    });
    actualCents += BigInt(fxResult.amountConvertedCents);
  }

  const shortfallCents = requiredCents - actualCents;

  return {
    required_cents: requiredCents.toString(),
    actual_cents: actualCents.toString(),
    shortfall_cents: shortfallCents.toString(),
    currency: budget.default_currency,
    enabled: true,
    target_months: budget.cushion_target_months,
  };
}

export interface GetCushionSummaryDeps {
  fxProvider: FxProviderLike;
}

export interface GetCushionSummaryInput {
  tenantId: string;
  budgetId: string;
}

/**
 * Application service factory — closure-over-deps. The returned function opens
 * its own withTenantTx and wraps the pure shape function. Used by the HTTP
 * endpoint (`GET /budgets/:id/cushion-summary` — Plan 07).
 */
export function getCushionSummary(deps: GetCushionSummaryDeps) {
  return async (
    input: GetCushionSummaryInput,
  ): Promise<Result<CushionSummaryDTO, Error>> => {
    try {
      const r = await withTenantTx(
        TenantId(input.tenantId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          return await computeCushionSummary(tx as unknown as TenantTx, {
            tenantId: input.tenantId,
            budgetId: input.budgetId,
            fxProvider: deps.fxProvider,
          });
        },
      );
      if (r.isErr()) return err(r.error);
      return ok(r.value);
    } catch (e) {
      return err(e as Error);
    }
  };
}
