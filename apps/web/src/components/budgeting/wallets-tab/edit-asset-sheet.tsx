"use client";
/**
 * edit-asset-sheet.tsx — asset Edit (13.1 D-06, D-07, D-36).
 *
 * Label · display currency, plus the current value (hand-valued: broker,
 * savings, cash and other amount assets without an instrument) or the current
 * price per unit (hand-priced quantity assets). Saving a new value/price books
 * a Value/Price updated ledger entry on the server. No history, no type, no
 * quantity, no delete — the ledger owns those.
 *
 * Round-2 gap 10: below, the configuration Edit cannot change is shown locked
 * (deposit rate · capitalization · start; tracked instrument · price; metal ·
 * kind · unit · price · premium) — shown, never sent (D-06).
 *
 * A currency switch on a hand-valued asset converts the field live from the
 * ORIGINAL value (never compounding across switches) with today's rate and an
 * FX line (13.1 UAT 6); an untouched converted value is not sent — the server
 * converts on save (D-36), so only displayCurrency goes.
 */
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
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
import type { HoldingDto } from "@/hooks/use-investments";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { clientApiFetch } from "@/lib/budget-fetch";
import { FxPreviewLine } from "@/components/budgeting/fields/fx-preview-line";
import { Field, NumericInput } from "./holding-sheet";
import { today } from "./swap-shared";
import { ledgerDate } from "./ledger-row";
import { centsToBare } from "@/lib/cents-format";

const decimal = (cents: string | null) =>
  cents == null ? "" : String(Number(cents) / 100);
/** Preview only — the server converts on save (D-36), same as decimal(). */
const convert = (v: string, rate: string) =>
  String(Number((Number(v) * Number(rate)).toFixed(2)));
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
  const locale = useLocale();
  const h = holding;
  // R6 (user): no currency here — the picker above names it; a pick
  // re-converts this figure (see `shownPrice` below).
  const priceLine =
    h.currentPriceCents == null
      ? null
      : centsToBare(String(Math.round(Number(h.currentPriceCents))), locale);
  // [testid suffix, label, value]; a null value is skipped.
  const locked = (
    h.holdingType === "deposit" || h.uiType === "deposit"
      ? [
          [
            "rate",
            t("field.rate"),
            h.depositRateBps == null
              ? null
              : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(h.depositRateBps / 100)}%`,
          ],
          [
            "capFrequency",
            t("field.capFrequency"),
            h.depositCapFrequency && t(`capFrequency.${h.depositCapFrequency}`),
          ],
          [
            "startDate",
            t("field.startDate"),
            h.depositStartDate && ledgerDate(h.depositStartDate, locale),
          ],
        ]
      : h.metal != null
        ? [
            ["metal", t("field.metal"), t(`metalOption.${h.metal}`)],
            [
              "kind",
              t("field.kind"),
              h.metalKind && t(`kindOption.${h.metalKind}`),
            ],
            [
              "uom",
              t("field.uom"),
              h.unitOfMeasure && t(`uomOption.${h.unitOfMeasure}`),
            ],
            ["currentPrice", t("field.currentPrice"), priceLine],
            [
              "premium",
              t("field.premium"),
              h.premiumPct == null ? null : `${Number(h.premiumPct)}%`,
            ],
          ]
        : h.instrumentId != null
          ? [
              ["instrument", t("field.asset"), h.instrumentName],
              ["currentPrice", t("field.currentPrice"), priceLine],
            ]
          : []
  ).filter((f): f is [string, string, string] => !!f[2]);

  const [name, setName] = useState(holding.name);
  const [ccy, setCcy] = useState(ccy0);
  const [price, setPrice] = useState(price0);
  const [fx, setFx] = useState<{ rate: string; asOf: string } | null>(null);
  const [fxFailed, setFxFailed] = useState(false);
  const touched = useRef(false);
  const asked = useRef(ccy0);
  const [error, setError] = useState<string | null>(null);

  const editValue = (v: string) => {
    touched.current = true;
    setPrice(v);
  };
  function pickCcy(next: string) {
    setCcy(next);
    setFx(null);
    setFxFailed(false);
    asked.current = next;
    if (!showValue && !showPrice && priceLine === null) return;
    if (next === ccy0) {
      if (!touched.current) setPrice(price0);
      return;
    }
    void clientApiFetch(`/fx/rate?from=${ccy0}&to=${next}&date=${today()}`)
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as { rate?: string; fxRateDate?: string })
          : null,
      )
      .catch(() => null)
      .then((q) => {
        if (asked.current !== next) return; // a later switch won
        if (!q?.rate) return setFxFailed(true);
        setFx({ rate: q.rate, asOf: q.fxRateDate ?? today() });
        if ((showValue || showPrice) && !touched.current && price0)
          setPrice(convert(price0, q.rate));
      });
  }
  const valueChanged =
    touched.current &&
    price.trim() !== "" &&
    (ccy !== ccy0 || price !== price0);

  const edit = {
    ...(name.trim() !== holding.name ? { name: name.trim() } : {}),
    ...(ccy !== ccy0 ? { displayCurrency: ccy } : {}),
    ...(showValue && valueChanged ? { currentValueCents: toCents(price) } : {}),
    ...(showPrice && valueChanged ? { currentPriceCents: toCents(price) } : {}),
  };
  const canSave =
    Object.keys(edit).length > 0 && name.trim() !== "" && !updateMut.isPending;

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
          setError(t("swap.err.saveFailed"));
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
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("edit.displayCurrency")}>
            <CurrencyPicker
              variant="field"
              value={ccy}
              onSelect={pickCcy}
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
                onChange={editValue}
              />
            </Field>
          )}
          {showPrice && (
            <Field label={`${t("edit.currentPrice")} (${ccy})`}>
              <NumericInput
                testId="edit-asset-price"
                value={price}
                onChange={editValue}
              />
            </Field>
          )}
          {locked.map(([id, label, value]) => (
            <Field key={id} label={label}>
              <div className="relative">
                <Input
                  data-testid={`edit-asset-locked-${id}`}
                  value={
                    // R6: the locked price follows the picked currency.
                    id === "currentPrice" && fx && ccy !== ccy0
                      ? centsToBare(
                          String(
                            Math.round(
                              Number(h.currentPriceCents) * Number(fx.rate),
                            ),
                          ),
                          locale,
                        )
                      : value
                  }
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  className="pr-9"
                  style={{ color: "var(--muted-foreground)" }}
                />
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--muted-foreground)" }}
                />
              </div>
            </Field>
          ))}
          {fx && price0 && (showValue || showPrice) && (
            <div data-testid="edit-asset-fx">
              <FxPreviewLine
                original={{ amount: price0, currency: ccy0 }}
                converted={{
                  amount: convert(price0, fx.rate),
                  currency: ccy,
                }}
                rate={fx.rate}
                asOf={fx.asOf}
              />
            </div>
          )}
          {fxFailed && (
            <p
              role="status"
              className="text-[12px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("edit.fxUnavailable")}
            </p>
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
