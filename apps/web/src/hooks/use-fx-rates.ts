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
