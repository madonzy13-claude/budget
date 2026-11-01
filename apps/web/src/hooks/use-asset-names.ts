"use client";
/**
 * use-asset-names.ts — the type's assets for the name pickers, archived ones
 * included (picking one restores it, by id). Names are not unique (round 5).
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

/** Mirror of AssetNameDto in packages/investments/src/contracts/api.ts. */
export interface AssetNameDto {
  id: string;
  name: string;
  archived: boolean;
  instrumentId: string | null;
  quantity: string;
  valueCents: string | null;
  valueCurrency: string | null;
  symbol?: string | null;
  instrumentName?: string | null;
  holdingType?: string;
  unitOfMeasure?: string | null;
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
