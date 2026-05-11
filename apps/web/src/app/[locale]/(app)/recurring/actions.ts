"use server";

/**
 * actions.ts — RSC server actions for the recurring page.
 * Fetches active rules + pending drafts via API in the caller's workspace
 * (wsId comes from the URL — `/[locale]/workspaces/[wsId]/recurring`).
 */
import type { RecurringRuleListItem } from "@/components/budgeting/recurring-rules-list";
import type { PendingDraft } from "@/components/budgeting/pending-drafts-inbox";
import { serverApiFetch } from "@/lib/budget-fetch.server";

export async function getRecurringRules(
  wsId: string,
): Promise<RecurringRuleListItem[]> {
  try {
    const res = await serverApiFetch(wsId, "/recurring-rules");
    if (!res.ok) return [];
    const data = (await res.json()) as { rules: RecurringRuleListItem[] };
    return data.rules ?? [];
  } catch {
    return [];
  }
}

export async function getPendingDrafts(
  wsId: string,
): Promise<PendingDraft[]> {
  try {
    const res = await serverApiFetch(wsId, "/recurring-drafts");
    if (!res.ok) return [];
    const data = (await res.json()) as { drafts: PendingDraft[] };
    return data.drafts ?? [];
  } catch {
    return [];
  }
}
