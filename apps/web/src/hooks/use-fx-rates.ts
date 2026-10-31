"use client";
/**
 * use-fx-rates.ts — today's rate from one currency to several (GET /fx/rate).
 * R6 (user): an investment group can be shown in another currency.
 */
import { useQueries } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { today } from "@/components/budgeting/wallets-tab/swap-shared";

export const fxRateKey = (from: string, to: string, date: string) =>
  ["fx-rate", from, to, date] as const;

/** to → rate (1 from → rate to); a currency still loading is absent. */
export function useFxRates(from: string, tos: string[]): Map<string, number> {
  const date = today();
  const wanted = [...new Set(tos)].filter((to) => to !== from);
  const results = useQueries({
    queries: wanted.map((to) => ({
      queryKey: fxRateKey(from, to, date),
      queryFn: async () => {
        const res = await clientApiFetch(
          `/fx/rate?from=${from}&to=${to}&date=${date}`,
        );
        if (!res.ok) throw new Error(await res.text());
        return ((await res.json()) as { rate: string }).rate;
      },
      staleTime: 60 * 60_000,
    })),
  });
  const rates = new Map<string, number>([[from, 1]]);
  wanted.forEach((to, i) => {
    const r = results[i]?.data;
    if (r != null) rates.set(to, Number(r));
  });
  return rates;
}

export interface CurrencyPL {
  currency: string;
  valueCents: string;
  costCents: string;
  realizedCents: string;
  unrealizedCents: string;
  totalPLCents: string;
  contributedCents: string;
  pct: number | null;
}

export const currencyPLKey = (
  budgetId: string,
  currency: string,
  ids: string[],
) =>
  [
    "budget",
    budgetId,
    "investments",
    "pl",
    currency,
    [...ids].sort().join(","),
  ] as const;

/** R6 (user): P/L of a set of assets in a currency, every entry at its own
 *  date's rate (GET /investments/pl). One result per request, in order. */
export function useCurrencyPLs(
  budgetId: string,
  reqs: { currency: string; ids: string[] }[],
): (CurrencyPL | undefined)[] {
  const results = useQueries({
    queries: reqs.map((r) => ({
      queryKey: currencyPLKey(budgetId, r.currency, r.ids),
      queryFn: async () => {
        const res = await clientApiFetch(
          `/budgets/${budgetId}/investments/pl?currency=${r.currency}&ids=${[...r.ids].sort().join(",")}`,
        );
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as CurrencyPL;
      },
      enabled: r.ids.length > 0,
      staleTime: 60_000,
    })),
  });
  return results.map((q) => q.data);
}
