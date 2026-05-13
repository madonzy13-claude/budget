"use server";

import type { RecurringRuleListItem } from "@/components/budgeting/recurring-rules-list";
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
