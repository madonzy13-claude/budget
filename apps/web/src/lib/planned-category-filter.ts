/**
 * planned-category-filter.ts — the planned timeline's category multi-select
 * (260802 request).
 *
 * The picker lets a member drop the categories that drown out the rest. Picking
 * everything, or nothing, both mean "no filter" — closing an empty picker shows
 * the whole chart rather than an empty one.
 *
 * Every category is offered and shown by default, investments included (260803
 * user request) — the picker is what narrows the view.
 *
 * The choice is remembered on the MEMBER's own row for that budget (see
 * use-member-ui-prefs), so it follows the person from phone to desktop and never
 * changes what the other members see. It lived in localStorage first, which is a
 * device rather than a person: the same user on a second machine was back to
 * "All categories" (user report, 260802).
 */
/** Each chart remembers its own choice under its own preference key. */
export const PLANNED_TIMELINE_PREF = "planned-categories";
export const PLANNED_PIE_PREF = "planned-pie-categories";
/** PAST or FUTURE, kept on the member's row like the time range: a choice about
 *  how you read your budget belongs to you, not to the browser you made it in
 *  (user, 260810). Stored as a one-element list, which is all ui_prefs holds. */
export const PLANNED_BASIS_PREF = "planned-basis";

/** The stored basis, or "past" when nothing is stored / the value is unknown. */
export function decodeBasis(stored: unknown): "past" | "future" {
  const v = Array.isArray(stored) ? stored[0] : stored;
  // "current" is what the FUTURE reading was called before 260807.
  return v === "future" || v === "current" ? "future" : "past";
}

/** What to ask the API for — `undefined` means "everything, as before". */
export function effectiveCategoryIds(
  selected: string[],
  allIds: string[],
): string[] | undefined {
  const live = prunePlannedCategories(selected, allIds);
  if (live.length === 0) return undefined;
  return live.length === allIds.length ? undefined : live;
}

/** Keep only ids the budget still has, in the order the categories are listed. */
export function prunePlannedCategories(
  selected: string[],
  allIds: string[],
): string[] {
  const picked = new Set(selected);
  return allIds.filter((id) => picked.has(id));
}
