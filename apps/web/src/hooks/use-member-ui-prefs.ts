"use client";
/**
 * use-member-ui-prefs.ts — this member's own chart picks for one budget.
 *
 * GET/PUT /budgets/:id/ui-prefs. The Overview's category pickers used to
 * remember their choice in localStorage, which is a DEVICE, not a person: the
 * same user opening the budget on their desktop was back to "All categories"
 * (user report, 260802). The choice now rides the member row.
 *
 * Writes are a MERGE of ONE key, so the timeline picker and the pie picker never
 * clear each other, and the cache is updated up front — a picker that waits a
 * round trip to redraw reads as a dropped click.
 *
 * queryKey: ["budget", budgetId, "ui-prefs"]
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export type MemberUiPrefs = Record<string, string[]>;

export const memberUiPrefsQueryKey = (budgetId: string) =>
  ["budget", budgetId, "ui-prefs"] as const;

export async function fetchMemberUiPrefs(
  budgetId: string,
): Promise<MemberUiPrefs> {
  const res = await clientApiFetch(`/budgets/${budgetId}/ui-prefs`, {
    headers: { "X-Budget-ID": budgetId },
  });
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as { prefs?: MemberUiPrefs }).prefs ?? {};
}

export function useMemberUiPrefs(budgetId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: memberUiPrefsQueryKey(budgetId),
    queryFn: () => fetchMemberUiPrefs(budgetId),
    // A preference changes only when its owner changes it, so the cached copy is
    // good for the session; a stale pick would flip a chart back mid-visit.
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (patch: MemberUiPrefs) => {
      const res = await clientApiFetch(`/budgets/${budgetId}/ui-prefs`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "X-Budget-ID": budgetId,
        },
        body: JSON.stringify({ prefs: patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { prefs?: MemberUiPrefs }).prefs ?? {};
    },
    onSuccess: (prefs) =>
      qc.setQueryData(memberUiPrefsQueryKey(budgetId), prefs),
  });

  const { mutateAsync } = mutation;
  const save = useCallback(
    async (key: string, ids: string[]) => {
      // Paint the pick now; the server answer replaces it a moment later.
      qc.setQueryData<MemberUiPrefs>(
        memberUiPrefsQueryKey(budgetId),
        (prev) => ({ ...(prev ?? {}), [key]: ids }),
      );
      // Offline or a rejected write leaves the chart on the new pick for this
      // visit — a filter is not worth a popup — and the next load re-reads the
      // stored one.
      await mutateAsync({ [key]: ids }).catch(() => undefined);
    },
    [budgetId, mutateAsync, qc],
  );

  return {
    prefs: query.data ?? {},
    /** false only until the first read lands — the pickers wait for it so they
     *  never flash "All categories" over a stored pick. */
    isLoaded: query.isSuccess || query.isError,
    save,
  };
}
