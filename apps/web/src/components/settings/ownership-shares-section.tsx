"use client";
/**
 * ownership-shares-section.tsx — Task 12: owner ownership-share editor
 * (shared budgets, whole-panel Σ=100 rewrite).
 *
 * Whole-panel editor: one % input per member, live total, save gated on
 * every pct being an integer 0..100 AND Σ === 100. Mirrors
 * aggregation-section.tsx's optimistic-free shape (no local state persists
 * across a failed save — the fields just keep whatever the user typed).
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface OwnershipSharesSectionProps {
  budgetId: string;
  members: { userId: string; name: string; pct: number }[];
}

export function OwnershipSharesSection({
  budgetId,
  members,
}: OwnershipSharesSectionProps) {
  const t = useTranslations("budget.ownership");
  const qc = useQueryClient();
  const [pcts, setPcts] = useState<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.userId, m.pct])),
  );
  const [saving, setSaving] = useState(false);
  const total = useMemo(
    () => Object.values(pcts).reduce((a, b) => a + (b || 0), 0),
    [pcts],
  );
  const valid =
    total === 100 &&
    Object.values(pcts).every((p) => Number.isInteger(p) && p >= 0 && p <= 100);

  async function save() {
    setSaving(true);
    try {
      const res = await api.budgets[":id"].members.shares.$put({
        param: { id: budgetId },
        json: {
          shares: members.map((m) => ({
            userId: m.userId,
            pct: pcts[m.userId] ?? 0,
          })),
        },
      });
      if (!res.ok) throw new Error("Failed to save shares");
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(t("saved_toast"));
    } catch {
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">{t("title")}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("help_text")}
        </p>
      </div>
      {members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-[var(--body)]">{m.name}</span>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            data-testid={`ownership-input-${m.userId}`}
            className="num w-20 rounded-[var(--radius-lg)] bg-[var(--surface-elevated-dark)] px-2 py-1 text-right"
            value={pcts[m.userId] ?? 0}
            onChange={(e) =>
              setPcts((p) => ({
                ...p,
                [m.userId]:
                  e.target.value === "" ? 0 : parseInt(e.target.value, 10),
              }))
            }
          />
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-[var(--hairline-dark)] pt-2">
        <span className="text-sm text-[var(--muted-foreground)]">
          {t("total_label")}
        </span>
        <span
          data-testid="ownership-total"
          className={`num ${valid ? "" : "text-[var(--trading-down)]"}`}
        >
          {total}%
        </span>
      </div>
      {!valid && (
        <p className="text-caption text-[var(--trading-down)]">
          {t("must_be_100")}
        </p>
      )}
      <button
        type="button"
        data-testid="ownership-save"
        disabled={!valid || saving}
        onClick={save}
        className="rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
      >
        {t("save")}
      </button>
    </div>
  );
}
