"use client";

/**
 * investment-category-slider.tsx — edit form for THE smart Investments category (r33).
 *
 * Unlike a normal category (needs + wants + cushion), the Investments category
 * has NO cushion and a limit that is either MANUAL (user-typed) or SMART
 * (computed on read = monthly income − Σ other planned). Smart requires at least
 * one income in settings; without it the Smart option is disabled with a hint.
 * There is also no delete — the category is removed only from Investments settings.
 */
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/budgeting/fields/amount-input";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/category-colors";

export interface InvestmentCategorySliderProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  month?: string;
  initial: {
    categoryId: string;
    name: string;
    plannedCents: string;
    colorKey: string | null;
    investmentLimitMode?: string | null;
  };
}

type Mode = "smart" | "manual";

function centsToDecimal(cents: string): string {
  const n = parseInt(cents, 10);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0
    ? String(whole)
    : `${whole}.${String(frac).padStart(2, "0")}`;
}
function amountToCents(decimal: string): number {
  const n = parseFloat(decimal);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function InvestmentCategorySlider({
  open,
  onOpenChange,
  budgetId,
  budgetCurrency,
  month,
  initial,
}: InvestmentCategorySliderProps) {
  const t = useTranslations("grid.investCat");
  const locale = useLocale();
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();

  // Authoritative mode + income-gate come from the settings endpoint.
  const statusQuery = useQuery({
    queryKey: ["investment-category", budgetId],
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investment-category`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error("investment_category_status_failed");
      return (await res.json()) as {
        category: { investmentLimitMode?: string | null } | null;
        hasIncome: boolean;
      };
    },
    staleTime: 0,
  });
  const hasIncome = statusQuery.data?.hasIncome ?? false;

  const [name, setName] = useState(initial.name);
  const [colorKey, setColorKey] = useState<string | null>(initial.colorKey);
  const [mode, setMode] = useState<Mode>(
    (initial.investmentLimitMode as Mode) ?? "smart",
  );
  const [manualAmount, setManualAmount] = useState(
    centsToDecimal(initial.plannedCents),
  );
  const [saving, setSaving] = useState(false);

  // Reset on (re)open or when the authoritative mode arrives.
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setColorKey(initial.colorKey);
    setManualAmount(centsToDecimal(initial.plannedCents));
    const authMode =
      (statusQuery.data?.category?.investmentLimitMode as Mode) ??
      (initial.investmentLimitMode as Mode) ??
      "smart";
    setMode(authMode);
  }, [
    open,
    initial.categoryId,
    statusQuery.data?.category?.investmentLimitMode,
  ]);

  // Smart with no income is not allowed — fall back to manual in the UI.
  const effectiveMode: Mode = mode === "smart" && !hasIncome ? "manual" : mode;

  const manualPreview = centsToDisplayCompact(
    String(amountToCents(manualAmount)),
    budgetCurrency,
    locale,
    true,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const targetMode: Mode = effectiveMode;
      const effectiveFrom = `${month ?? new Date().toISOString().slice(0, 7)}-01`;

      // 1) name + color (rename/recolor via the normal category route).
      const patchCat = await clientApiWrite(
        `/budgets/${budgetId}/categories/${initial.categoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, colorKey }),
        },
      );
      if (!patchCat.ok) {
        toast.error(t("error.save"));
        return;
      }

      // 2) limit mode.
      const modeRes = await clientApiWrite(
        `/budgets/${budgetId}/investment-category/limit-mode`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: targetMode }),
        },
      );
      if (!modeRes.ok) {
        toast.error(
          modeRes.status === 409 ? t("smartRequiresIncome") : t("error.save"),
        );
        return;
      }

      // 3) manual → persist the typed limit (cushion always 0).
      if (targetMode === "manual") {
        const limitsRes = await clientApiWrite(
          `/budgets/${budgetId}/categories/${initial.categoryId}/limits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              normalAmount: String(amountToCents(manualAmount)),
              cushionAmount: "0",
              effectiveFrom,
            }),
          },
        );
        if (!limitsRes.ok) {
          toast.error(t("error.save"));
          return;
        }
      }

      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
      qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
      qc.invalidateQueries({ queryKey: ["investment-category", budgetId] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
      // r33: a MANUAL investment amount counts toward planned → refresh the
      // INCOME_UNDER_PLANNED task badge without a reload.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    } catch (err) {
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("error.save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-screen sm:w-[480px] sm:max-w-[480px] bg-[var(--surface-card-dark)] p-0 flex flex-col overflow-y-auto"
        data-testid="invest-cat-slider-content"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-6 py-4 border-b border-[var(--hairline-dark)]">
          <SheetTitle className="text-xl font-semibold text-[var(--body-on-dark)]">
            {t("header")}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 px-6 py-4 gap-4"
          noValidate
        >
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm text-[var(--muted-foreground)]">
              {t("nameLabel")}
            </Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              id="invest-cat-name"
            />
          </div>

          {/* Limit mode: Smart | Manual */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm text-[var(--muted-foreground)]">
              {t("limitLabel")}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="invest-mode-smart"
                variant={effectiveMode === "smart" ? "primary" : "outline"}
                aria-pressed={effectiveMode === "smart"}
                disabled={!hasIncome}
                onClick={() => setMode("smart")}
              >
                {t("mode.smart")}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="invest-mode-manual"
                variant={effectiveMode === "manual" ? "primary" : "outline"}
                aria-pressed={effectiveMode === "manual"}
                onClick={() => setMode("manual")}
              >
                {t("mode.manual")}
              </Button>
            </div>
            {!hasIncome && (
              <p
                data-testid="invest-smart-hint"
                className="text-xs text-[var(--muted-foreground)]"
              >
                {t("smartRequiresIncome")}
              </p>
            )}
          </div>

          {/* Manual amount OR smart explainer */}
          {effectiveMode === "manual" ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm text-[var(--muted-foreground)]">
                {t("manualAmountLabel")}
              </Label>
              <div className="flex items-center gap-2">
                <AmountInput
                  value={manualAmount}
                  onChange={setManualAmount}
                  placeholder="0"
                  className="flex-1 min-w-0"
                  id="invest-cat-manual"
                />
                <span
                  data-testid="invest-manual-readout"
                  className="shrink-0 whitespace-nowrap text-num-sm font-semibold text-[var(--body-on-dark)]"
                >
                  {manualPreview}
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
              {t("smartExplainer")}
            </p>
          )}

          {/* Color picker */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm text-[var(--muted-foreground)]">
              {t("colorLabel")}
            </Label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLORS.map(({ key, hex }) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`invest-color-${key}`}
                  onClick={() => setColorKey(colorKey === key ? null : key)}
                  className={cn(
                    "flex h-8 w-8 rounded-full border-2 transition-all",
                    colorKey === key
                      ? "border-[var(--body-on-dark)] scale-110"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: hex }}
                  aria-pressed={colorKey === key}
                  aria-label={key}
                />
              ))}
            </div>
          </div>

          <SheetFooter className="mt-auto pt-4">
            <Button
              type="submit"
              disabled={saving}
              data-testid="invest-cat-save"
              className="h-12 w-full bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("save")
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
