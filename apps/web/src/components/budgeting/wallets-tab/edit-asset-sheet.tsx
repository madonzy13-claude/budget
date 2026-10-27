"use client";
/**
 * edit-asset-sheet.tsx — asset Edit (13.1 D-06, D-07, D-36).
 *
 * Label · display currency, plus the current value (hand-valued: broker,
 * savings, cash and other amount assets without an instrument) or the current
 * price per unit (hand-priced quantity assets). Saving a new value/price books
 * a Value/Price updated ledger entry on the server. No history, no type, no
 * quantity, no delete — the ledger owns those.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { holdingShape } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import type { AssetWriteError } from "@/lib/investment-invalidate";
import type { HoldingDto } from "@/hooks/use-investments";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { Field, NumericInput } from "./holding-sheet";

const decimal = (cents: string | null) =>
  cents == null ? "" : String(Number(cents) / 100);
/** Decimal → cents string, 6 sub-cent places kept (unit prices). */
const toCents = (v: string) =>
  String(
    Number((Number(v.replace(/\s/g, "").replace(/,/g, ".")) * 100).toFixed(6)),
  );

export function EditAssetSheet({
  open,
  onOpenChange,
  budgetId,
  budgetCurrency,
  holding,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
}) {
  const t = useTranslations("budget.investments");
  const updateMut = useUpdateHolding(budgetId);
  const handValued =
    holding.instrumentId == null &&
    holding.holdingType !== "deposit" &&
    holding.uiType !== "deposit";
  const byQty = holdingShape(holding) === "quantity";
  const showValue = handValued && !byQty;
  const showPrice = handValued && byQty;
  const ccy0 =
    holding.currentPriceCurrency ?? holding.buyCurrency ?? budgetCurrency;
  const price0 = decimal(holding.currentPriceCents);

  const [name, setName] = useState(holding.name);
  const [ccy, setCcy] = useState(ccy0);
  const [price, setPrice] = useState(price0);
  const [takenName, setTakenName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const edit = {
    ...(name.trim() !== holding.name ? { name: name.trim() } : {}),
    ...(ccy !== ccy0 ? { displayCurrency: ccy } : {}),
    ...(showValue && price !== price0 && price.trim()
      ? { currentValueCents: toCents(price) }
      : {}),
    ...(showPrice && price !== price0 && price.trim()
      ? { currentPriceCents: toCents(price) }
      : {}),
  };
  const taken = takenName !== null && name.trim() === takenName;
  const canSave =
    Object.keys(edit).length > 0 &&
    name.trim() !== "" &&
    !taken &&
    !updateMut.isPending;

  function save() {
    if (!canSave) return;
    setError(null);
    updateMut.mutate(
      { holdingId: holding.id, silent: true, ...edit },
      {
        onSuccess: () => {
          toast.success(t("edit.saved"));
          onOpenChange(false);
        },
        onError: (e) => {
          if (isOfflineWriteError(e)) return;
          if ((e as AssetWriteError).code === "label_taken")
            setTakenName(name.trim());
          else setError(t("swap.err.saveFailed"));
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="edit-asset-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-2">
          <SheetTitle
            className="break-words"
            style={{ color: "var(--body-on-dark)" }}
          >
            {t("sheet.title.edit")}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-1">
          <Field label={t("edit.label")}>
            <Input
              data-testid="edit-asset-name"
              value={name}
              aria-invalid={taken || undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {taken && (
            <p
              role="alert"
              className="text-[12px]"
              style={{ color: "var(--trading-down)" }}
            >
              {t("asset.name.taken")}
            </p>
          )}
          <Field label={t("edit.displayCurrency")}>
            <CurrencyPicker
              variant="field"
              value={ccy}
              onSelect={setCcy}
              aria-label={t("edit.displayCurrency")}
            />
          </Field>
          <p
            className="text-[12px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("edit.displayCurrencyHelp")}
          </p>
          {showValue && (
            <Field label={`${t("edit.currentValue")} (${ccy})`}>
              <NumericInput
                testId="edit-asset-value"
                value={price}
                onChange={setPrice}
              />
            </Field>
          )}
          {showPrice && (
            <Field label={`${t("edit.currentPrice")} (${ccy})`}>
              <NumericInput
                testId="edit-asset-price"
                value={price}
                onChange={setPrice}
              />
            </Field>
          )}
          {error && (
            <p
              role="alert"
              className="text-[14px]"
              style={{ color: "var(--trading-down)" }}
            >
              {error}
            </p>
          )}
          <div
            className="flex flex-col gap-2 border-t pt-4"
            style={{ borderColor: "var(--hairline-dark)" }}
          >
            <Button
              type="button"
              variant="primary"
              data-testid="edit-asset-save"
              disabled={!canSave}
              onClick={save}
              className="h-auto min-h-11 w-full whitespace-normal break-words"
            >
              {t("edit.save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-auto min-h-11 w-full whitespace-normal break-words"
            >
              {t("swap.discard")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
