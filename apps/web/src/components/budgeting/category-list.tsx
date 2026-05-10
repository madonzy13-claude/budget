/**
 * category-list.tsx — RSC component listing categories grouped by root/sub.
 * Fetches server-side. Icon-only actions have aria-labels.
 */
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Pencil, Archive, FolderOpen } from "lucide-react";

interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  scope: string;
  archivedAt: string | null;
}

interface CategoryListProps {
  locale: string;
  apiBase?: string;
}

async function fetchCategories(
  apiBase: string,
  cookieHeader: string
): Promise<CategoryDto[]> {
  try {
    const res = await fetch(`${apiBase}/categories`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = await res.json();
    return body.categories ?? [];
  } catch {
    return [];
  }
}

export async function CategoryList({ locale: _locale, apiBase = "/api" }: CategoryListProps) {
  const t = await getTranslations("budgeting_categories.categories");
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const categories = await fetchCategories(apiBase, cookieHeader);
  const active = categories.filter((c) => !c.archivedAt);

  const roots = active.filter((c) => !c.parentId);
  const childrenMap = new Map<string, CategoryDto[]>();
  for (const cat of active) {
    if (cat.parentId) {
      const arr = childrenMap.get(cat.parentId) ?? [];
      arr.push(cat);
      childrenMap.set(cat.parentId, arr);
    }
  }

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {roots.map((root) => {
        const children = childrenMap.get(root.id) ?? [];
        return (
          <div key={root.id}>
            <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 group">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{root.name}</span>
                <span className="text-xs text-muted-foreground">
                  {root.scope === "PERSONAL" ? t("scopes.PERSONAL") : t("scopes.SHARED")}
                </span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  aria-label={`Edit ${root.name}`}
                  className="p-1 rounded hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label={`Archive ${root.name}`}
                  className="p-1 rounded hover:bg-muted"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {children.map((child) => (
              <div
                key={child.id}
                className="flex items-center justify-between rounded-md px-3 py-1.5 ml-6 hover:bg-muted/40 group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{child.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {child.scope === "PERSONAL" ? t("scopes.PERSONAL") : t("scopes.SHARED")}
                  </span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    aria-label={`Edit ${child.name}`}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={`Archive ${child.name}`}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
