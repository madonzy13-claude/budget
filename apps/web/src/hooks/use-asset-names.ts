"use client";
/**
 * use-asset-names.ts — autocomplete over a type's assets, hidden (qty 0) ones
 * included so a buy under that name revives it (D-02, D-17).
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

/** Mirror of AssetNameDto in packages/investments/src/contracts/api.ts. */
export interface AssetNameDto {
  id: string;
  name: string;
  archived: boolean;
  instrumentId: string | null;
  valueCents: string | null;
  valueCurrency: string | null;
}

export const namesKey = (budgetId: string, uiType: string) =>
  ["budget", budgetId, "investments", "names", uiType] as const;

export function useAssetNames(budgetId: string, uiType: string | null) {
  return useQuery({
    queryKey: namesKey(budgetId, uiType ?? ""),
    enabled: uiType !== null,
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/names?type=${encodeURIComponent(uiType!)}`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { names: AssetNameDto[] }).names;
    },
  });
}
