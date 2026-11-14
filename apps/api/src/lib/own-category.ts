import type { BootedDeps } from "../boot";

/**
 * A write naming a category that is not this budget's (another budget's, or
 * permanently deleted) is refused: RLS would hide it from every read, but the
 * row would still be stored pointing at it (found by the 15-17 tenant-leak gate).
 */
export async function categoryMissing(
  budgeting: Pick<BootedDeps["budgeting"], "findCategoryById">,
  tenantId: string,
  categoryId: string | null | undefined,
): Promise<boolean> {
  if (!categoryId) return false;
  const r = await budgeting.findCategoryById({ tenantId, categoryId });
  if (r.isErr()) throw r.error;
  return !r.value;
}
