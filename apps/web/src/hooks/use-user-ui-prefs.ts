"use client";
/**
 * use-user-ui-prefs.ts — this person's picks for the surfaces that belong to no
 * single budget (260805).
 *
 * GET/PUT /settings/ui-prefs. The sibling of use-member-ui-prefs, and the split
 * is the point: a pick scoped to ONE budget rides the member row, so two people
 * in the same budget keep their own. The all-budgets page is scoped to none of
 * them — it is this person's own view across every budget they can see — so its
 * range selector stores here instead.
 *
 * Writes are a MERGE of one key, and the cache is updated up front: a selector
 * that waits a round trip to redraw reads as a dropped tap.
 *
 * queryKey: ["user", "ui-prefs"]
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export type UserUiPrefs = Record<string, string[]>;

export const userUiPrefsQueryKey = () => ["user", "ui-prefs"] as const;

export function useUserUiPrefs() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: userUiPrefsQueryKey(),
    queryFn: async (): Promise<UserUiPrefs> => {
      const res = await clientApiFetch("/settings/ui-prefs");
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { prefs?: UserUiPrefs }).prefs ?? {};
    },
    // A preference changes only when its owner changes it, so the cached copy
    // is good for the session; a stale read would flip the range mid-visit.
    staleTime: 5 * 60_000,
  });

  const { mutateAsync } = useMutation({
    mutationFn: async (patch: UserUiPrefs) => {
      const res = await clientApiFetch("/settings/ui-prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs: patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { prefs?: UserUiPrefs }).prefs ?? {};
    },
    onSuccess: (prefs) => qc.setQueryData(userUiPrefsQueryKey(), prefs),
  });

  const save = useCallback(
    async (key: string, value: string[]) => {
      // Paint the pick now; the server answer replaces it a moment later.
      qc.setQueryData<UserUiPrefs>(userUiPrefsQueryKey(), (prev) => ({
        ...(prev ?? {}),
        [key]: value,
      }));
      // Offline or a rejected write leaves the page on the new pick for this
      // visit — a range is not worth a popup — and the next load re-reads the
      // stored one.
      await mutateAsync({ [key]: value }).catch(() => undefined);
    },
    [mutateAsync, qc],
  );

  return {
    prefs: query.data ?? {},
    /** false only until the first read lands — the selector waits for it so it
     *  never flashes its default over a stored pick. */
    isLoaded: query.isSuccess || query.isError,
    save,
  };
}
