/**
 * spendings-summary-repo.ts — Port interface for SpendingsSummaryRepo.
 * Reads budget metadata (cushion mode, currency, timezone) from tenancy.budgets.
 * No Drizzle imports — hex boundary enforced by dep-cruiser.
 */

export interface SpendingsSummaryRepo {
  getBudgetMeta(
    tenantId: string,
    budgetId: string,
  ): Promise<{
    cushionModeEnabled: boolean;
    currency: string;
    timezone: string; // IANA timezone — COALESCE(timezone, 'UTC') in adapter
  } | null>;
}
