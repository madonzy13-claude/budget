"use client";

/**
 * bulk-action-bar.tsx — sticky bottom bar for bulk re-categorize (Plan 02-09 EXPN-10).
 *
 * Hidden when no rows selected; appears with surface-elevated-dark background when
 * selectedIds.length >= 1. POSTs /api/transactions/bulk-recategorize on Apply (creates
 * correction rows server-side, single tx). Per UI-SPEC § Multi-select for bulk re-categorize.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { uuidv4 } from "@/lib/uuid";

export interface BulkActionBarCategory {
  id: string;
  name: string;
}

export interface BulkActionBarProps {
  selectedIds: string[];
  categories: BulkActionBarCategory[];
  /** Called after a successful POST so parent can refresh the list + clear selection. */
  onApplied?: () => void;
  /** Test override; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export function BulkActionBar({
  selectedIds,
  categories,
  onApplied,
  fetchImpl,
}: BulkActionBarProps) {
  const t = useTranslations("budgeting.transactions.bulk");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const doFetch = fetchImpl ?? fetch;

  if (selectedIds.length === 0) return null;

  async function apply() {
    if (!newCategoryId) return;
    setSubmitting(true);
    try {
      const res = await doFetch("/api/transactions/bulk-recategorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": uuidv4(),
        },
        body: JSON.stringify({
          transactionIds: selectedIds,
          newCategoryId,
        }),
      });
      if (!res.ok) {
        toast.error(t("applyFailed"));
        return;
      }
      toast.success(t("applySucceeded", { count: selectedIds.length }));
      setNewCategoryId("");
      onApplied?.();
    } catch {
      toast.error(t("applyFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline-on-dark)] bg-[var(--surface-elevated-dark)] px-4 py-3 shadow-lg"
      data-testid="bulk-action-bar"
      role="region"
      aria-label={t("regionLabel")}
    >
      <div className="mx-auto flex max-w-screen-md flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-sm font-medium text-[var(--body)]"
          data-testid="bulk-action-bar-count"
        >
          {t("actionLabel", { count: selectedIds.length })}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="rounded-md border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] px-2 py-1 text-sm text-[var(--body)]"
            value={newCategoryId}
            onChange={(e) => setNewCategoryId(e.target.value)}
            aria-label={t("categorySelectLabel")}
            data-testid="bulk-action-bar-category-select"
          >
            <option value="" disabled>
              {t("categoryPlaceholder")}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!newCategoryId || submitting}
            onClick={() => void apply()}
            data-testid="bulk-action-bar-apply"
          >
            {t("applyButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
