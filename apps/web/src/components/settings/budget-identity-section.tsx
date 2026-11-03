"use client";

/**
 * budget-identity-section.tsx — D-01
 *
 * Budget name autosaves on blur via InlineEditCell.
 * Currency field: the owner can change it at any time (Phase 14, D-01) behind
 * a confirm dialog — every total re-expresses in the new currency; members see
 * it read-only.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface BudgetIdentitySectionProps {
  budgetId: string;
  name: string;
  defaultCurrency: string;
  /** Kept for callers (settings progress); the currency no longer locks on it. */
  hasTransactions?: boolean;
  /** The currency is the household's — the owner's to change. The name is
   *  each member's own label (260808), so anyone may rename (261103, user). */
  isOwner?: boolean;
}

export function BudgetIdentitySection({
  budgetId,
  name,
  defaultCurrency,
  isOwner = true,
}: BudgetIdentitySectionProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const qc = useQueryClient();

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
    // The switcher in the header is a CLIENT component reading
    // ["active-budgets"], cached for 30 seconds — so router.refresh() alone
    // re-rendered the server tree while the dropdown kept the old name until
    // that cache went stale on its own (user, 260809). Rename it in place for
    // the instant change, then let the server confirm.
    qc.setQueryData(
      ["active-budgets"],
      (old: { id: string; name: string }[] | undefined) =>
        old?.map((b) => (b.id === budgetId ? { ...b, name: newName } : b)),
    );
    void qc.invalidateQueries({ queryKey: ["active-budgets"] });
    toast.success(t("identity.name_saved"));
    router.refresh();
  };

  // Phase 14 (UI-SPEC §4): a pick opens the confirm dialog; nothing is sent
  // until the owner confirms. `current` follows a confirmed change at once.
  const [current, setCurrent] = useState(defaultCurrency);
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setCurrent(defaultCurrency);
  }, [defaultCurrency]);

  const confirmCurrency = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await api.budgets[":id"].$patch({
        param: { id: budgetId },
        json: { default_currency: pending as never },
      });
      if (!res.ok) throw new Error("Failed to update currency");
      setCurrent(pending);
      // Every amount of this budget is re-expressed server-side: drop every
      // cached query that belongs to it (summary, overview, reserves, tasks…).
      void qc.invalidateQueries({
        predicate: (q) => (q.queryKey as unknown[]).includes(budgetId),
      });
      void qc.invalidateQueries({ queryKey: ["active-budgets"] });
      toast.success(t("identity.currency_saved"));
      router.refresh();
    } catch {
      toast.error(t("identity.currency_save_failed"));
    } finally {
      setSaving(false);
      setPending(null);
    }
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
            // No horizontal padding: every switch on this card ends at the
            // row's right edge, and 12px of padding left the name and the
            // currency stopping short of it (user, 260810). The hover tint
            // hugs the text instead, which still reads as "this is editable".
            render={(v) => (
              // 261103 (user): dotted like the Assets amounts — editable.
              <span className="editable-dots block rounded-md py-1.5 text-sm text-[var(--body)] hover:bg-[var(--surface-elevated-dark)]">
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
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-[var(--body)]">
            {t("identity.currency_label")}
          </p>
        </div>
        <div className="flex justify-end">
          {!isOwner ? (
            // A member sees the household's currency read-only: plain grey
            // code — matches the investments-row currency styling (r31 item 4).
            <span className="py-1.5 text-sm text-[var(--muted-foreground)]">
              {current}
            </span>
          ) : (
            // CurrencyPicker's internal triggers (Radix SelectTrigger on
            // desktop, native <select> on touch) both default to w-full,
            // which makes the value text sit at the LEFT of any fixed-
            // width wrapper. Browsers also tend to ignore text-align on
            // <select>. Force intrinsic width on both trigger variants
            // with !w-auto and override Radix's justify-between → end so
            // the value sits at the right edge of the row. iOS ignores
            // text-align on a <select> — text-align-last does the job there,
            // so the code sits over its dotted line (user, 261103). The wrapper
            // itself uses inline-flex justify-end so it shrinks to the
            // intrinsic size of the trigger.
            <div data-testid="budget-currency-picker" className="editable-dots inline-flex justify-end [&_button]:!w-auto [&_button]:justify-end [&_select]:!w-auto [&_select]:text-right [&_select]:[text-align-last:right]">
              <CurrencyPicker
                value={pending ?? current}
                onSelect={(v: string) => {
                  if (v !== current) setPending(v);
                }}
                aria-label={t("identity.currency_label")}
              />
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o && !saving) setPending(null);
        }}
      >
        <AlertDialogContent data-testid="budget-currency-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("identity.currency_confirm_title", { currency: pending ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("identity.currency_confirm_body", { currency: pending ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} data-testid="budget-currency-cancel">
              {t("identity.currency_confirm_cancel", { currentCurrency: current })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              data-testid="budget-currency-confirm"
              onClick={(e) => {
                e.preventDefault();
                void confirmCurrency();
              }}
            >
              {t("identity.currency_confirm_cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
