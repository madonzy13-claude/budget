/**
 * category-list.tsx — RSC component listing categories as a flat, alphabetically
 * sorted list (categories are unique per workspace; no nesting). Each row is a
 * clickable client island that opens the LimitEditor sheet.
 *
 * Workspace context: takes `wsId` from the page and forwards it on the API
 * request via the X-Budget-ID header.
 */
import { getTranslations } from "next-intl/server";
import { CategoryRowSheet } from "@/components/budgeting/category-row-sheet";
import { serverApiFetch } from "@/lib/budget-fetch.server";

interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  scope: string;
  archivedAt: string | null;
}

interface CategoryListProps {
  locale: string;
  wsId: string;
}

async function fetchCategories(wsId: string): Promise<CategoryDto[]> {
  try {
    const res = await serverApiFetch(wsId, "/categories");
    if (!res.ok) return [];
    const body = await res.json();
    return body.categories ?? [];
  } catch {
    return [];
  }
}

export async function CategoryList({
  locale: _locale,
  wsId,
}: CategoryListProps) {
  const tCat = await getTranslations("budgeting_categories.categories");
  const categories = await fetchCategories(wsId);
  const active = categories
    .filter((c) => !c.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {tCat("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((cat) => (
        <CategoryRowSheet
          key={cat.id}
          categoryId={cat.id}
          categoryName={cat.name}
          editAriaLabel={tCat("editAria", { name: cat.name })}
          archiveAriaLabel={tCat("archiveAria", { name: cat.name })}
          sheetTitle={tCat("form.editTitle")}
        />
      ))}
    </div>
  );
}
