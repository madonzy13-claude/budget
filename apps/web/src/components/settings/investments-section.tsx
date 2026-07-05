"use client";
/**
 * investments-section.tsx — Settings toggle for investments_enabled (Phase 9).
 *
 * Mirrors cushion-section's master flag: optimistic local flip + PATCH
 * /budgets/:id { investments_enabled }, rollback + toast on error. Reuses the
 * existing <Switch>. Copy from budget.investments.feature_* (T-9-18: the flag is
 * convenience — the API enforces RLS + membership regardless of client render).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export interface InvestmentsSectionProps {
  budgetId: string;
  investmentsEnabled: boolean;
}

export function InvestmentsSection({
  budgetId,
  investmentsEnabled,
}: InvestmentsSectionProps) {
  const t = useTranslations("budget.investments");
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(investmentsEnabled);
  const [saving, setSaving] = useState(false);

  async function handleEnabledChange(checked: boolean) {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { investments_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update investments flag");
      // The Wallets tab reads investmentsEnabled from the budget-detail query;
      // invalidate it so the section appears/disappears WITHOUT a page reload.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(checked ? t("feature_on_toast") : t("feature_off_toast"));
    } catch {
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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
          onCheckedChange={handleEnabledChange}
          disabled={saving}
          aria-label={t("feature_label")}
          data-testid="settings-investments-toggle"
          className="shrink-0"
        />
      </div>

      {/* r33: smart Investments category — only meaningful when the feature is on. */}
      {enabled && <SmartCategoryToggle budgetId={budgetId} />}
    </div>
  );
}

/**
 * r33: toggles THE smart "Investments" spendings category. Default ON when the
 * feature is enabled and it was never created (auto-creates); an explicit OFF
 * archives it (data preserved), which the `exists` flag remembers so it isn't
 * re-created on the next visit.
 */
function SmartCategoryToggle({ budgetId }: { budgetId: string }) {
  const t = useTranslations("budget.investments");
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  const [saving, setSaving] = useState(false);
  const autoCreatedRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: ["investment-category", budgetId],
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investment-category`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error("investment_category_status_failed");
      return (await res.json()) as {
        category: { id: string } | null;
        hasIncome: boolean;
        exists: boolean;
      };
    },
    staleTime: 0,
  });

  const active = statusQuery.data?.category != null;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["investment-category", budgetId] });
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
    qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
  }

  // notify=false for the silent default-on auto-create; user toggles notify.
  async function setActive(next: boolean, notify = true) {
    setSaving(true);
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investment-category`,
        {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          ...(next
            ? {
                body: JSON.stringify({
                  name: t("smart_category.default_name"),
                }),
              }
            : {}),
        },
      );
      if (!res.ok) throw new Error("toggle_failed");
      invalidate();
      if (notify) {
        toast.success(
          next ? t("smart_category.on_toast") : t("smart_category.off_toast"),
        );
      }
    } catch (err) {
      if (isOfflineWriteError(err)) offlineToast();
      else toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  // Default ON: create the category the first time the feature is on and it has
  // never existed (exists=false). An explicit OFF sets exists=true (archived
  // row), so we never revive what the user turned off.
  useEffect(() => {
    if (
      statusQuery.data &&
      !statusQuery.data.exists &&
      !autoCreatedRef.current &&
      !saving
    ) {
      autoCreatedRef.current = true;
      void setActive(true, false); // silent default-on create — no toast
    }
  }, [statusQuery.data?.exists]);

  return (
    <div className="flex items-start justify-between gap-4 border-t border-[var(--hairline)] pt-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("smart_category.label")}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("smart_category.help_text")}
        </p>
      </div>
      <Switch
        checked={active}
        onCheckedChange={setActive}
        disabled={saving || statusQuery.isLoading}
        aria-label={t("smart_category.label")}
        data-testid="settings-smart-category-toggle"
        className="shrink-0"
      />
    </div>
  );
}
