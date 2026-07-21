"use client";
/**
 * possession-sheet.tsx — Add / edit a possession (house/car/jewelry/…).
 *
 * A possession is a physical asset tracked at a single current value: name +
 * currency + amount + a per-item icon. It rides the holdings endpoint as
 * holdingType "possession" (quantity=1, the amount stored as both buy + current
 * price so it carries no phantom P/L). Deliberately thin — none of the
 * type-first / instrument-search machinery of HoldingSheet applies here.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { useCreateHolding } from "@/hooks/use-create-holding";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import type { HoldingDto } from "@/hooks/use-investments";
import { WalletCustomizer } from "./wallet-customizer";
import { POSSESSION_ICONS } from "@/lib/possession-icons";

interface PossessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  budgetId: string;
  budgetCurrency: string;
  holding?: HoldingDto | null;
}

/** Decimal string → integer-cents string, or null. */
function toCents(value: string): string | null {
  const n = Number(value.replace(/\s/g, "").replace(/,/g, ".").trim());
  if (!value.trim() || !Number.isFinite(n)) return null;
  return String(Math.round(n * 100));
}
function centsToDecimal(cents: string | null | undefined): string {
  if (cents == null) return "";
  const n = Number(cents);
  return Number.isFinite(n) ? String(n / 100) : "";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-caption text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function PossessionSheet({
  open,
  onOpenChange,
  mode,
  budgetId,
  budgetCurrency,
  holding,
}: PossessionSheetProps) {
  const t = useTranslations("budget.possessions");
  const createMut = useCreateHolding(budgetId);
  const updateMut = useUpdateHolding(budgetId);

  const [name, setName] = useState(holding?.name ?? "");
  const [currency, setCurrency] = useState(
    holding?.currentPriceCurrency ?? budgetCurrency,
  );
  const [amount, setAmount] = useState(
    centsToDecimal(holding?.currentPriceCents ?? null),
  );
  const [icon, setIcon] = useState<string | null>(holding?.icon ?? null);

  const cents = toCents(amount);
  const canSave = name.trim().length > 0 && cents != null;

  function handleSave() {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      holdingType: "possession" as const,
      uiType: "possession",
      icon,
      quantity: "1",
      currentPriceCents: cents,
      currentPriceCurrency: currency,
      // Store the amount as the buy basis too so a possession carries no P/L.
      buyPriceCents: cents,
      buyCurrency: currency,
    };
    if (mode === "create") {
      createMut.mutate(payload as Parameters<typeof createMut.mutate>[0]);
    } else if (holding) {
      updateMut.mutate({
        holdingId: holding.id,
        ...payload,
      } as Parameters<typeof updateMut.mutate>[0]);
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-4">
        <SheetHeader className="mb-2">
          <SheetTitle>
            {mode === "create" ? t("sheet.addTitle") : t("sheet.editTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          <Field label={t("field.name")}>
            <Input
              data-testid="possession-sheet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("field.namePlaceholder")}
            />
          </Field>

          <div className="space-y-1">
            <span className="text-caption text-[var(--muted-foreground)]">
              {t("field.icon")}
            </span>
            <div>
              <WalletCustomizer
                color={null}
                icon={icon}
                icons={POSSESSION_ICONS}
                showColor={false}
                ariaLabel={t("field.icon")}
                onChange={(patch) => {
                  if (patch.icon !== undefined) setIcon(patch.icon);
                }}
              />
            </div>
          </div>

          <Field label={t("field.currency")}>
            <CurrencyPicker
              variant="field"
              value={currency}
              onSelect={setCurrency}
              aria-label={t("field.currency")}
            />
          </Field>

          <Field label={t("field.amount")}>
            <Input
              type="text"
              inputMode="decimal"
              data-testid="possession-sheet-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-num-md tabular-nums"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--hairline-dark)] pt-4">
          <Button
            type="button"
            variant="primary"
            data-testid="possession-sheet-submit"
            disabled={!canSave}
            onClick={handleSave}
            className="flex-1"
          >
            {t("sheet.save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("sheet.cancel")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
