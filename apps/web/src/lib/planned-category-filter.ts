/**
 * planned-category-filter.ts — the planned timeline's category multi-select
 * (260802 request).
 *
 * The picker lets a member drop the categories that drown out the rest. Picking
 * everything, or nothing, both mean "no filter" — closing an empty picker shows
 * the whole chart rather than an empty one.
 *
 * The choice is remembered per BUDGET in localStorage, which keeps it to the
 * member who made it: it never rides the budget record, so one member narrowing
 * their own chart cannot change what the others see.
 */
const key = (budgetId: string) => `budget:${budgetId}:planned-categories`;

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

export function loadPlannedCategories(budgetId: string): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(budgetId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function savePlannedCategories(budgetId: string, ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key(budgetId), JSON.stringify(ids));
  } catch {
    // A full or blocked store costs the memory of the choice, nothing more.
  }
}

/**
 * The categories this chart can show. Investing is not spending — the timeline
 * leaves investment categories out of its default view, so the picker must not
 * offer them: ticking one turned "everything except House" into a chart where a
 * month's investing counted as overspend (user report, 260802).
 */
export function pickableCategories<
  T extends { id: string; isInvestment?: unknown },
>(categories: T[]): T[] {
  return categories.filter((c) => !c.isInvestment);
}
