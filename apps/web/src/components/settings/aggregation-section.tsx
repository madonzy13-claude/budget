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
import { Input } from "@/components/ui/input";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { api } from "@/lib/api-client";
import { persistNow } from "@/lib/query-persist";

export interface AggregationSectionProps {
  budgetId: string;
  includeInAggregation: boolean;
  sharePct: number;
}

function clampSharePct(n: number): number {
  if (!Number.isFinite(n)) return 100;
  // Allow up to 2 decimals (numeric(5,2)); clamp 0-100.
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/** Parse a user string (dot OR comma decimal) → clamped share number. */
function parseSharePct(raw: string): number {
  return clampSharePct(Number(raw.replace(/\s/g, "").replace(",", ".")));
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
      // Patch the persisted detail snapshot too, so a same-session reload (which
      // re-hydrates from IndexedDB before the refetch lands) shows the new value
      // instead of the stale one.
      qc.setQueryData(
        ["budget", budgetId, "detail"],
        (old: Record<string, unknown> | undefined) =>
          old
            ? {
                ...old,
                ownership_share_pct: nextPct,
                include_in_aggregation: nextIncluded,
              }
            : old,
      );
      void persistNow(qc);
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

  // Commit an inline-edited share (dot or comma decimal). Rolls back to the last
  // saved value on a failed PUT.
  async function commitShare(raw: string) {
    const nextPct = parseSharePct(raw);
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
          {/* text-xs like the privacy hint above it — this one read a size
              larger than every description around it (user, 260810). */}
          <p className="text-xs text-[var(--muted-foreground)]">
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
            {/* A heading, like every other setting's — it was a <label>, so
                it came out unbolted and with a pointer cursor over text that
                is not a control (user, 260810). The field keeps its own
                aria-label, so nothing is lost by dropping the association. */}
            <p className="text-sm font-semibold text-[var(--body)]">
              {t("share_label")}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("share_help")}
            </p>
          </div>
          {/* Renders "100%" as text; tap the number → an input to edit the bare
              value (no % sign), decimals with dot or comma. Same inline-edit feel
              as the Name field. */}
          <div className="w-20 shrink-0 text-right" data-inline-cell>
            <InlineEditCell
              value={String(pct)}
              ariaLabel={t("share_label")}
              disabled={saving}
              testId="settings-aggregation-share"
              render={(v) => (
                <span className="num text-sm text-[var(--body)]">{v}%</span>
              )}
              renderEditor={(draft, onChange) => (
                <Input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => onChange(e.target.value)}
                  className="h-9 w-20 text-right"
                />
              )}
              onSave={commitShare}
            />
          </div>
        </div>
      )}
    </div>
  );
}
