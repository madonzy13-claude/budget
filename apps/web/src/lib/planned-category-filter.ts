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
