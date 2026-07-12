"use client";

/**
 * budget-identity-section.tsx — D-01
 *
 * Budget name autosaves on blur via InlineEditCell.
 * Currency field: editable select when hasTransactions=false,
 * locked with tooltip when true.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export interface BudgetIdentitySectionProps {
  budgetId: string;
  name: string;
  defaultCurrency: string;
  hasTransactions: boolean;
  /** r36: amount-privacy flag; ON = Overview hides amounts by default (eye to reveal). */
  amountPrivacyEnabled?: boolean;
  /** Only owners may flip the flag (mirrors the API owner-gate). */
  isOwner?: boolean;
}

export function BudgetIdentitySection({
  budgetId,
  name,
  defaultCurrency,
  hasTransactions,
  amountPrivacyEnabled = true,
  isOwner = true,
}: BudgetIdentitySectionProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const qc = useQueryClient();

  // Amount-privacy toggle (r36). Optimistic flip + PATCH; invalidate the
  // budget-detail query so the Overview eye + default-hidden behavior update
  // without a reload.
  const [privacyOn, setPrivacyOn] = useState(amountPrivacyEnabled);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  useEffect(() => setPrivacyOn(amountPrivacyEnabled), [amountPrivacyEnabled]);

  const savePrivacy = async (checked: boolean) => {
    setPrivacyOn(checked);
    setSavingPrivacy(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { amount_privacy_enabled: checked },
      });
      if (!res.ok) throw new Error("Failed to update amount-privacy flag");
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(
        checked ? t("identity.privacy_on_toast") : t("identity.privacy_off_toast"),
      );
    } catch {
      setPrivacyOn(!checked);
      toast.error(t("identity.privacy_error"));
    } finally {
      setSavingPrivacy(false);
    }
  };

  // Optimistic display name so the inline cell shows the new value
  // immediately after blur, while router.refresh() asynchronously syncs the
  // RSC tree (which also refreshes the top-nav budget switcher).
  const [displayName, setDisplayName] = useState(name);
  useEffect(() => {
    setDisplayName(name);
  }, [name]);

  const saveName = async (newName: string) => {
    const res = await api.budgets[":id"].$patch({
      param: { id: budgetId },
      json: { name: newName },
    });
    if (!res.ok) throw new Error("Failed to save name");
    setDisplayName(newName);
    toast.success(t("identity.name_saved"));
    router.refresh();
  };

  const saveCurrency = async (currency: string) => {
    const res = await api.budgets[":id"].$patch({
      param: { id: budgetId },
      json: { default_currency: currency },
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      if (body.error === "currency_locked") {
        toast.error(t("identity.currency_locked_tooltip"));
        return;
      }
      throw new Error("Failed to update currency");
    }
    toast.success(t("identity.currency_saved"));
    router.refresh();
  };

  return (
    <div className="divide-y divide-[var(--hairline-on-dark)]">
      {/* Budget name — label left, value right, single row. */}
      <div className="flex items-center justify-between gap-4 py-3">
        <p className="shrink-0 text-sm font-semibold text-[var(--body)]">
          {t("identity.name_label")}
        </p>
        <div className="min-w-0 flex-1 text-right">
          <InlineEditCell
            value={displayName}
            testId="budget-name-input"
            ariaLabel={t("identity.name_label")}
            render={(v) => (
              <span className="block rounded-md px-3 py-1.5 text-sm text-[var(--body)] hover:bg-[var(--surface-elevated-dark)]">
                {v}
              </span>
            )}
            renderEditor={(draft, onChange, onCommit, onCancel) => (
              <Input
                autoFocus
                data-testid="budget-name-input"
                value={draft}
                maxLength={80}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onCancel();
                  if (e.key === "Enter") onCommit();
                }}
                className="h-9 bg-[var(--surface-elevated-dark)] text-right text-sm"
              />
            )}
            onSave={saveName}
          />
        </div>
      </div>

      {/* Default currency — label left, picker (or locked display) right.
          The picker is intentionally constrained to ~9rem so the trigger
          reads as a control, not a full-bleed form field. The locked
          state (post-first-transaction) already renders at intrinsic
          size — this matches that footprint for visual consistency. */}
      <div className="flex items-center justify-between gap-4 py-3">
        <p className="shrink-0 text-sm font-semibold text-[var(--body)]">
          {t("identity.currency_label")}
        </p>
        <div className="flex justify-end">
          {hasTransactions ? (
            // Locked (post-first-transaction): plain grey code, no lock chrome —
            // matches the investments-row currency styling (r31 item 4).
            <span
              className="px-3 py-1.5 text-sm text-[var(--muted-foreground)]"
              aria-label={t("identity.currency_locked_tooltip")}
            >
              {defaultCurrency}
            </span>
          ) : (
            // CurrencyPicker's internal triggers (Radix SelectTrigger on
            // desktop, native <select> on touch) both default to w-full,
            // which makes the value text sit at the LEFT of any fixed-
            // width wrapper. Browsers also tend to ignore text-align on
            // <select>. Force intrinsic width on both trigger variants
            // with !w-auto and override Radix's justify-between → end so
            // the value sits at the right edge of the row. The wrapper
            // itself uses inline-flex justify-end so it shrinks to the
            // intrinsic size of the trigger.
            <div className="inline-flex justify-end [&_button]:!w-auto [&_button]:justify-end [&_select]:!w-auto [&_select]:text-right">
              <CurrencyPicker
                value={defaultCurrency}
                onSelect={saveCurrency}
                aria-label={t("identity.currency_label")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Amount-privacy toggle (r36) — when on, the Overview hides amounts by
          default and shows an eye to reveal; when off, amounts are always shown. */}
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-[var(--body)]">
            {t("identity.privacy_label")}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("identity.privacy_hint")}
          </p>
        </div>
        <Switch
          data-testid="amount-privacy-switch"
          checked={privacyOn}
          onCheckedChange={savePrivacy}
          disabled={savingPrivacy || !isOwner}
          aria-label={t("identity.privacy_label")}
        />
      </div>
    </div>
  );
}
