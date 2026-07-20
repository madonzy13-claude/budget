"use client";
/**
 * aggregation-section.tsx — Settings self-toggle for include_in_aggregation
 * (Task 11, all-budgets aggregate overview) + R2: self-set ownership_share_pct.
 *
 * Clone of reserves-section.tsx's shape: optimistic local flip → PUT
 * /budgets/:id/aggregation { included, share_pct }, rollback + toast on error.
 * Unlike the other feature-flag sections this is NOT owner-gated (the route
 * binds the caller's own userId as both actor and target row) — every member
 * decides for themselves whether this budget counts toward THEIR personal
 * all-budgets total, and how much of it (R2 replaced the owner-gated Σ=100
 * "Ownership split" editor with this self-set per-member %, default 100).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface AggregationSectionProps {
  budgetId: string;
  includeInAggregation: boolean;
  sharePct: number;
}

function clampSharePct(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function AggregationSection({
  budgetId,
  includeInAggregation,
  sharePct,
}: AggregationSectionProps) {
  const t = useTranslations("budget.aggregation");
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(includeInAggregation);
  const [pct, setPct] = useState(clampSharePct(sharePct));
  // Last value confirmed saved to the server — separate from `pct` (the live
  // input value while typing) so a failed blur-save can roll back to it.
  const [savedPct, setSavedPct] = useState(clampSharePct(sharePct));
  const [saving, setSaving] = useState(false);

  async function save(nextIncluded: boolean, nextPct: number) {
    setSaving(true);
    try {
      const res = await api.budgets[":id"].aggregation.$put({
        param: { id: budgetId },
        json: { included: nextIncluded, share_pct: nextPct },
      });
      if (!res.ok) throw new Error("Failed to update aggregation settings");
      // The all-budgets aggregate + this budget's own detail query both read
      // these fields — invalidate both so the change takes effect without a
      // reload.
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      return true;
    } catch {
      toast.error(t("error_save"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(checked: boolean) {
    const prevEnabled = enabled;
    setEnabled(checked);
    const ok = await save(checked, pct);
    if (ok) {
      setSavedPct(pct);
      toast.success(checked ? t("feature_on_toast") : t("feature_off_toast"));
    } else {
      setEnabled(prevEnabled);
    }
  }

  function handleShareChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === "") return; // let the user clear the field while typing
    setPct(clampSharePct(Number(e.target.value)));
  }

  async function handleShareBlur() {
    const nextPct = clampSharePct(pct);
    setPct(nextPct);
    if (nextPct === savedPct) return;
    const ok = await save(enabled, nextPct);
    if (ok) setSavedPct(nextPct);
    else setPct(savedPct);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-[var(--body)]">
            {t("feature_label")}
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("feature_help_text")}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
          aria-label={t("feature_label")}
          data-testid="settings-aggregation-toggle"
          className="shrink-0"
        />
      </div>
      {enabled && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--hairline-dark)] pt-3">
          <div className="min-w-0 space-y-1">
            <label
              htmlFor="settings-aggregation-share"
              className="text-sm text-[var(--body)]"
            >
              {t("share_label")}
            </label>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("share_help")}
            </p>
          </div>
          <input
            id="settings-aggregation-share"
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="numeric"
            data-testid="settings-aggregation-share"
            className="num w-20 shrink-0 rounded-[var(--radius-lg)] bg-[var(--surface-elevated-dark)] px-2 py-1 text-right"
            value={pct}
            onChange={handleShareChange}
            onBlur={handleShareBlur}
            disabled={saving}
          />
        </div>
      )}
    </div>
  );
}
