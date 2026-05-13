/**
 * /budgets/[id]/spendings — RSC shell.
 *
 * Fetches 4 endpoints in parallel using serverApiFetch(budgetId, ...) so that
 * X-Budget-ID header is set on every request (T-04-04-07 mitigation).
 *
 * budgetTz + budgetCurrency come from the spendings-summary response (Plan 04-02
 * extended DTO) — NOT from a separate /budgets/:id fetch.
 *
 * ?month param validated: regex /^\d{4}-\d{2}$/ — falls back to current month
 * on malformed input (T-04-04-01 mitigation — never used in redirect URL).
 */
import { Temporal } from "temporal-polyfill";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function SpendingsPage({
  params,
  searchParams,
}: PageProps) {
  const { id: budgetId } = await params;
  const { month: monthParam } = await searchParams;

  // T-04-04-01: regex-validate ?month before any use
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : Temporal.Now.plainDateISO().toPlainYearMonth().toString();

  const [categoriesRes, txnsRes, draftsRes, summaryRes] = await Promise.all([
    serverApiFetch(budgetId, `/budgets/${budgetId}/categories`),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
    ),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/transactions?month=${month}&confirmed=false`,
    ),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/spendings-summary?month=${month}`,
    ),
  ]);

  const categories = categoriesRes.ok
    ? ((await categoriesRes.json()) as { categories: unknown[] }).categories
    : [];
  const transactions = txnsRes.ok
    ? ((await txnsRes.json()) as { transactions: unknown[] }).transactions
    : [];
  const drafts = draftsRes.ok
    ? ((await draftsRes.json()) as { transactions: unknown[] }).transactions
    : [];
  const summary = summaryRes.ok
    ? await summaryRes.json()
    : {
        categories: [],
        cushionModeEnabled: false,
        budgetCurrency: "USD",
        budgetTz: "UTC",
        month,
      };

  return (
    <SpendingsGridClient
      budgetId={budgetId}
      budgetCurrency={(summary as { budgetCurrency?: string }).budgetCurrency ?? "USD"}
      budgetTz={(summary as { budgetTz?: string }).budgetTz ?? "UTC"}
      month={month}
      initialCategories={categories as Parameters<typeof SpendingsGridClient>[0]["initialCategories"]}
      initialTransactions={transactions as Parameters<typeof SpendingsGridClient>[0]["initialTransactions"]}
      initialDrafts={drafts as Parameters<typeof SpendingsGridClient>[0]["initialDrafts"]}
      initialSummary={summary as Parameters<typeof SpendingsGridClient>[0]["initialSummary"]}
    />
  );
}
