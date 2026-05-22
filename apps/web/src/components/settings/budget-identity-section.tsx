"use client";

/**
 * budget-identity-section.tsx — D-01
 *
 * Budget name autosaves on blur via InlineEditCell.
 * Currency field: editable select when hasTransactions=false,
 * locked with tooltip when true.
 */
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";

export interface BudgetIdentitySectionProps {
  budgetId: string;
  name: string;
  defaultCurrency: string;
  hasTransactions: boolean;
}

export function BudgetIdentitySection({
  budgetId,
  name,
  defaultCurrency,
  hasTransactions,
}: BudgetIdentitySectionProps) {
  const t = useTranslations("settings");

  const saveName = async (newName: string) => {
    const res = await api.budgets[":id"].$patch({
      param: { id: budgetId },
      json: { name: newName },
    });
    if (!res.ok) throw new Error("Failed to save name");
    toast.success(t("identity.name_saved"));
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
  };

  return (
    <div className="space-y-4">
      {/* Budget name */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("identity.name_label")}
        </p>
        <InlineEditCell
          value={name}
          ariaLabel={t("identity.name_label")}
          render={(v) => (
            <span className="block rounded-md px-3 py-2 text-sm text-[var(--body)] hover:bg-[var(--surface-elevated-dark)]">
              {v}
            </span>
          )}
          renderEditor={(draft, onChange, onCommit, onCancel) => (
            <Input
              autoFocus
              value={draft}
              maxLength={80}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommit}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
                if (e.key === "Enter") onCommit();
              }}
              className="h-9 bg-[var(--surface-elevated-dark)] text-sm"
            />
          )}
          onSave={saveName}
        />
      </div>

      {/* Default currency */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("identity.currency_label")}
        </p>
        {hasTransactions ? (
          <div className="flex items-center gap-2">
            <span className="rounded-md px-3 py-2 text-sm text-[var(--body)]">
              {defaultCurrency}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock
                    className="h-4 w-4 text-[var(--muted-foreground)]"
                    aria-label={t("identity.currency_locked_tooltip")}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("identity.currency_locked_tooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <CurrencyPicker
            value={defaultCurrency}
            onSelect={saveCurrency}
            aria-label={t("identity.currency_label")}
          />
        )}
      </div>
    </div>
  );
}
