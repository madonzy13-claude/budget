"use client";

/**
 * category-row-sheet.tsx — Static row + a Pencil button that opens the edit
 * sheet (CategoryEditForm in edit mode). The row body itself is NOT clickable
 * — only the Pencil icon triggers the editor.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive, FolderOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryEditForm } from "@/components/budgeting/category-edit-form";
import { clientApiFetch } from "@/lib/budget-fetch";

interface LimitDto {
  id: string;
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface CategoryRowSheetProps {
  categoryId: string;
  categoryName: string;
  editAriaLabel: string;
  archiveAriaLabel: string;
  sheetTitle: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CategoryRowSheet({
  categoryId,
  categoryName,
  editAriaLabel,
  archiveAriaLabel,
  sheetTitle,
}: CategoryRowSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<LimitDto | null>(null);
  const [loading, setLoading] = useState(false);

  // When the sheet opens, fetch the currently effective limit so the editor
  // pre-fills (same-day re-edit then UPDATEs in place per SCD-2 contract).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await clientApiFetch(
          `/categories/${categoryId}/limits/effective?date=${todayIso()}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (res.ok) setExisting((await res.json()) as LimitDto);
        else setExisting(null);
      } catch {
        if (!cancelled) setExisting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoryId]);

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="group flex items-center justify-between rounded-lg border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4 py-3 transition-all hover:border-[var(--primary)]/30 hover:bg-[var(--surface-elevated-dark)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]">
            <FolderOpen className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <span className="text-sm font-semibold text-[var(--on-dark)] truncate">
            {categoryName}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            aria-label={editAriaLabel}
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--primary)] cursor-pointer"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={archiveAriaLabel}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--destructive)] cursor-pointer"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full bg-[var(--canvas-dark)] sm:max-w-lg"
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-[var(--on-dark)]">{sheetTitle}</SheetTitle>
          </SheetHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            <CategoryEditForm
              mode={{
                kind: "edit",
                category: { id: categoryId, name: categoryName },
                existingLimit: existing,
              }}
              onSuccess={handleSuccess}
              onCancel={() => setOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
