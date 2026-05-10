"use server";

/**
 * actions.ts — RSC server actions for the recurring page.
 * Fetches active rules + pending drafts via API.
 */
import type { RecurringRuleListItem } from "@/components/budgeting/recurring-rules-list";
import type { PendingDraft } from "@/components/budgeting/pending-drafts-inbox";

function apiBase(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

export async function getRecurringRules(): Promise<RecurringRuleListItem[]> {
  try {
    const res = await fetch(`${apiBase()}/api/recurring-rules`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { rules: RecurringRuleListItem[] };
    return data.rules ?? [];
  } catch {
    return [];
  }
}

export async function getPendingDrafts(): Promise<PendingDraft[]> {
  try {
    const res = await fetch(`${apiBase()}/api/recurring-drafts`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { drafts: PendingDraft[] };
    return data.drafts ?? [];
  } catch {
    return [];
  }
}
