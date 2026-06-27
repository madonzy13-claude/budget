import type { UserId } from "@budget/shared-kernel";

export type Locale = "en" | "pl" | "uk";

export interface UserDTO {
  id: UserId;
  email: string; // decrypted at adapter boundary
  name: string; // decrypted at adapter boundary
  emailVerified: boolean;
  locale: Locale;
  display_currency: string; // ISO-4217 (per D-05/MONY-09)
  timezone: string; // IANA zone (e.g. "Europe/Warsaw"); NULL in DB reads back as "UTC"
}

export interface SessionDTO {
  id: string;
  userId: UserId;
  device: string;
  ipAddress: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

/**
 * HomeSummaryResponse — wire-format DTO for `GET /budgets/:id/home-summary`
 * (HOME-02 / D-PH3-12). Consumed by apps/web's React Query hooks. Bigint
 * cents are serialized as strings to round-trip safely across JSON.
 */
export interface HomeSummaryResponse {
  budgetId: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  display_currency: string;
  spent_current_month: { amount_cents: string; currency: string };
  wallets_value_display_ccy: {
    amount_cents: string;
    currency: string;
    converted_at: string;
  };
  top_overspent: Array<{
    category_id: string;
    category_name: string;
    over_amount_cents: string;
  }>;
}

/**
 * BudgetActiveResponse — wire-format DTO for `GET /budgets/active`.
 *
 * v1.1 IA consistency (03-RESEARCH §"Data Contracts" §4): the response key
 * was renamed from `workspaces` → `budgets`. The legacy `workspaces` key is
 * retained as an alias for one Phase 3 wave so existing web call sites
 * reading `body.workspaces` continue to work; Plans 03-04/03-05 read
 * `body.budgets ?? body.workspaces` so the dual emission is forward-compatible.
 */
export interface BudgetActiveResponse {
  /** Canonical key (v1.1, post-rename). */
  budgets: Array<{ id: string; name: string; role: string; kind: string }>;
  /** @deprecated v1.0 alias — readers should prefer `budgets`. Removed in a
   * later Phase 3 wave once apps/web migrates fully. */
  workspaces: Array<{ id: string; name: string; role: string; kind: string }>;
}

/**
 * TaskKind / TaskSummaryResponse / ListPendingTasksResponse — wire-format DTOs
 * for `GET /budgets/:budgetId/tasks?status=pending` (BDP-03 / D-PH3-13).
 *
 * Phase 3 ships the READ path only. The banner reads `tasks.length` to render
 * the count chip and renders `kind` per task. Payload shape per task kind is
 * owned by Phase 7 generators; the contract type keeps it opaque
 * (`Record<string, unknown>`) so Phase 7 can extend per-kind payloads without
 * a breaking change to this surface.
 */
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "STALE_WALLET"
  | "MONTH_END_REVIEW";

export interface TaskSummaryResponse {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: "PENDING" | "RESOLVED";
  payload: Record<string, unknown>;
  /** ISO-8601 UTC timestamp. */
  created_at: string;
}

export interface ListPendingTasksResponse {
  budgetId: string;
  tasks: TaskSummaryResponse[];
}
