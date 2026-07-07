/**
 * task-repo.ts — Port interface for TaskRepo (BDP-03 + Phase 7 extension).
 *
 * No Drizzle imports — hex boundary enforced by dep-cruiser (ENGR-02).
 * Phase 3 shipped the READ path (`listPending`). Phase 7 extends with write
 * operations (emit + resolve) for the Tasks queue generators and the resolve
 * route. All write methods take an OPTIONAL/REQUIRED `tx` parameter so callers
 * inside an existing `withTenantTx` can piggyback their writes onto the same
 * transaction — essential for atomic auto-resolve hooks in Plans 04/05/06.
 *
 * v1.1 invariant: `budget_id === tenant_id`. Both args are kept on the port
 * signature so the adapter can scope RLS by tenant_id while filtering by
 * budget_id — defense-in-depth even though they are equal in v1.1.
 */

/**
 * Minimal tx shape needed by callers. The adapter casts to the concrete drizzle
 * tx type internally. NO drizzle-orm import here (hex boundary — ENGR-02 +
 * dep-cruiser rule: domain/ports cannot import drizzle-orm).
 */
export type TenantTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * The three task kinds shipped in v1.1 Phase 7 (rescoped from the original
 * 4-kind set — STALE_WALLET and MONTH_END_REVIEW dropped per D-PH7-15;
 * CUSHION_BELOW_TARGET added per D-PH7-09). DB CHECK constraint mirrors this.
 */
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET"
  // Phase 9 (INV-01 / A1 / D-10): a tracked instrument a budget holds was
  // delisted (no longer in the daily seed feed → active=false).
  | "INVESTMENT_INSTRUMENT_DELISTED"
  // r33: the budget has income and total planned spending exceeds it — "review
  // your spendings". Shows under the Spendings pill.
  | "INCOME_UNDER_PLANNED";

export type TaskStatus = "PENDING" | "RESOLVED";

export interface TaskSummary {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: TaskStatus;
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp (UTC). Adapter converts from Postgres `timestamptz`. */
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Per-kind payload types (DTO boundary — bigint serialized as string).       */
/* -------------------------------------------------------------------------- */

/**
 * Payload for a RESERVE_TOPUP task. `direction` distinguishes a top-up
 * suggestion (limit > actual) from a withdraw suggestion (limit < actual)
 * — same kind, opposite money flow.
 */
export interface ReserveTopupPayload {
  /** bigint serialized as string (DTO boundary rule). */
  shortfall_cents: string;
  direction: "TOPUP" | "WITHDRAW";
  /** ISO 4217 currency code (e.g., "EUR"). */
  currency: string;
}

/**
 * Payload for a CONFIRM_DRAFT task. Carries enough context for the resolver
 * UI to render the draft summary without an extra read.
 */
export interface ConfirmDraftPayload {
  draft_id: string;
  rule_name: string;
  /** bigint serialized as string (DTO boundary rule). */
  amount_cents: string;
  currency: string;
  /** ISO date "YYYY-MM-DD". */
  transaction_date: string;
  category_id: string;
}

/**
 * Payload for a CUSHION_BELOW_TARGET task. `target_months` is the configured
 * cushion target horizon (1..60). Money fields are bigint-as-string.
 */
export interface CushionBelowTargetPayload {
  shortfall_cents: string;
  required_cents: string;
  actual_cents: string;
  currency: string;
  target_months: number;
}

/**
 * Payload for an INVESTMENT_INSTRUMENT_DELISTED task (Phase 9, A1/D-10). Carries
 * enough context for the row to render "{symbol} delisted — review {name}" without
 * an extra read. `holding_id` is also the dedup key (tasks_investment_delisted_dedup_idx).
 */
export interface InvestmentDelistedPayload {
  holding_id: string;
  holding_name: string;
  instrument_symbol: string;
}

/**
 * Payload for an INCOME_UNDER_PLANNED task (r33). All money fields are
 * bigint-as-string, monthly, in the budget's default currency.
 */
export interface IncomeUnderPlannedPayload {
  /** Total monthly income (FX→budget ccy). */
  income_cents: string;
  /** income + counted wallet balances (spendings + reserve [+ cushion if enabled]), FX→budget ccy. */
  available_cents: string;
  /** Total planned spending (Σ category planned; smart Investments excluded). */
  planned_cents: string;
  /** planned − available (> 0). */
  shortfall_cents: string;
  currency: string;
}

export interface TaskRepo {
  /**
   * Returns PENDING tasks for the given budget, ordered ASC by `created_at`.
   * RLS at the DB layer ensures cross-tenant rows are unreachable; route
   * also asserts `tenantIds.includes(budgetId)` before invoking this.
   */
  listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>;

  /* ------------------------------------------------------------------------ */
  /* Phase 7 write methods (emit + resolve).                                  */
  /*                                                                          */
  /* tx is REQUIRED for emit methods (always called from inside an existing   */
  /* withTenantTx — generators run inside the tx that produced the trigger    */
  /* event). tx is OPTIONAL for resolve (POST /tasks/:id/resolve opens its    */
  /* own tx; inline auto-resolve hooks piggyback the caller's tx).            */
  /* ------------------------------------------------------------------------ */

  /**
   * Idempotent resolve. UPDATEs only when row is PENDING AND tenant_id
   * matches; cross-tenant attempts silently no-op (0 rows updated). Already
   * RESOLVED rows are not re-resolved.
   */
  /**
   * r32: actorUserId (the human who resolved it) is carried into the
   * task.resolved event so the push handler can skip the actor's own devices —
   * you don't need a "task completed" ping for a task you just closed. Omitted
   * for system/auto-resolve paths (→ notify all members).
   */
  resolve(
    taskId: string,
    tenantId: string,
    tx?: TenantTx,
    actorUserId?: string,
  ): Promise<void>;

  /**
   * Emits a RESERVE_TOPUP task. Idempotent at the DB layer via partial unique
   * index on (budget_id, kind) WHERE status='PENDING' (migration 0026).
   */
  emitReserveTopup(
    tenantId: string,
    budgetId: string,
    payload: ReserveTopupPayload,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Emits a CONFIRM_DRAFT task. Idempotent at the DB layer via partial unique
   * index on (payload_json->>'draft_id') WHERE kind='CONFIRM_DRAFT' AND
   * status='PENDING' (migration 0026).
   */
  emitConfirmDraft(
    tenantId: string,
    budgetId: string,
    payload: ConfirmDraftPayload,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Emits a CUSHION_BELOW_TARGET task. Idempotent at the DB layer via partial
   * unique index on (budget_id, kind) WHERE status='PENDING' (migration 0026).
   */
  emitCushionBelowTarget(
    tenantId: string,
    budgetId: string,
    payload: CushionBelowTargetPayload,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Emits an INVESTMENT_INSTRUMENT_DELISTED task (Phase 9, A1/D-10). Idempotent
   * at the DB layer via the partial unique index on (payload_json->>'holding_id')
   * WHERE kind='INVESTMENT_INSTRUMENT_DELISTED' AND status='PENDING' (migration
   * 0038, tasks_investment_delisted_dedup_idx). Re-running the daily seed never
   * creates a second OPEN task for the same holding (ON CONFLICT DO NOTHING).
   */
  emitInvestmentDelisted(
    tenantId: string,
    budgetId: string,
    payload: InvestmentDelistedPayload,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Emits an INCOME_UNDER_PLANNED task (r33). Idempotent via the partial unique
   * index on (budget_id) WHERE kind='INCOME_UNDER_PLANNED' AND status='PENDING'.
   * ON CONFLICT DO UPDATE refreshes the payload with the live shortfall.
   */
  emitIncomeUnderPlanned(
    tenantId: string,
    budgetId: string,
    payload: IncomeUnderPlannedPayload,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Resolves all PENDING tasks for a (tenantId, budgetId, kind) tuple in one
   * statement. Used by auto-resolve hooks when the underlying trigger
   * condition is no longer true (e.g. cushion target now met).
   */
  resolveByKindAndBudget(
    tenantId: string,
    budgetId: string,
    kind: TaskKind,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Resolves a PENDING CONFIRM_DRAFT task by its embedded draft_id payload
   * field. Used when a draft is confirmed or dismissed inline (Plan 04).
   */
  resolveConfirmDraftByDraftId(
    tenantId: string,
    draftId: string,
    tx: TenantTx,
  ): Promise<void>;

  /**
   * Resolves PENDING INVESTMENT_INSTRUMENT_DELISTED tasks whose holding is in
   * `holdingIds` (r31b). Called by the daily seed when an instrument reappears in
   * the feed (reactivated) so the stale delisted task — and the holding's delisted
   * chrome — clears instead of lingering. Returns the number resolved. No-op for
   * an empty list. tenant-scoped (RLS), so run inside withTenantTx.
   */
  resolveInvestmentDelistedForHoldings(
    tenantId: string,
    holdingIds: string[],
    tx: TenantTx,
  ): Promise<number>;
}
