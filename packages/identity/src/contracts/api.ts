import type { UserId } from "@budget/shared-kernel";

export type Locale = "en" | "pl" | "uk";
export type LLMProviderName = "claude_haiku" | "groq";
export type STTProviderName = "browser" | "groq";

export interface UserDTO {
  id: UserId;
  email: string; // decrypted at adapter boundary
  name: string; // decrypted at adapter boundary
  emailVerified: boolean;
  locale: Locale;
  display_currency: string; // ISO-4217 (per D-05/MONY-09)
  preferred_llm_provider: LLMProviderName | null;
  preferred_stt_provider: STTProviderName | null;
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
