/**
 * recurring-end-date.ts — "last date" cutoff for recurring rules.
 *
 * A rule may carry an optional end_date. Once the next occurrence falls
 * strictly AFTER end_date, the rule is exhausted: no further drafts, and the
 * generation loops deactivate it. end_date itself is inclusive (a draft due
 * exactly on end_date is still produced).
 *
 * ISO YYYY-MM-DD strings compare lexicographically == chronologically, so no
 * date library is needed — keeps this trivially unit-testable and shared by
 * both the worker engine and the create-time catch-up loop.
 */
export function isRuleExhausted(
  nextDueISO: string,
  endDateISO: string | null,
): boolean {
  return endDateISO !== null && nextDueISO > endDateISO;
}
