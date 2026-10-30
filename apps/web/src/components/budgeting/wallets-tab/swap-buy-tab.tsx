"use client";
/**
 * swap-buy-tab.tsx — Swap → Buy (13.1 D-08). Type / name / instrument are the
 * asset's, locked. Three shapes:
 *   quantity      quantity · buy price · currency  → {kind:"quantity"}
 *   cash/savings  amount · currency (cost and value rise alike) → {kind:"amount"}
 *   broker        amount added · account value after → {kind:"broker"}; the
 *                 deposit is cost + contribution, the rest is market move.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { centsToBare } from "@/lib/cents-format";
import {
  UI_TYPE_ORDER,
  deriveUiType,
  holdingShape,
} from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import { AssetWriteError } from "@/lib/investment-invalidate";
import { buildSwapSummary } from "@/lib/swap-summary";
import type { HoldingDto } from "@/hooks/use-investments";
import { useBuyAsset, type BuyAssetBody } from "@/hooks/use-buy-asset";
import { useSellHolding } from "@/hooks/use-sell-holding";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UI_TYPE_COLOR, UI_TYPE_ICON } from "@/lib/investment-icons";
import { Field, NumericInput } from "./holding-sheet";
import {
  ErrorLine,
  HeldButton,
  RadioCards,
  heldQty,
  trimQty,
  LockedField,
  SwapDateField,
  SwapFooter,
  caption,
  ccyOf,
  heading,
  dateOk,
  num,
  qtyString,
  signColor,
  toCents,
} from "./swap-shared";

export interface SwapTabProps {
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
  holdings: HoldingDto[];
  date: string;
  setDate: (d: string) => void;
  minDate: string | null;
  onDone: () => void;
  /** Round 4: the main amount/quantity, carried across Buy / Sell / Transfer
   *  (seeds this tab's main field; every edit writes it back). */
  draft?: string;
  setDraft?: (v: string) => void;
  /** Add / New transaction: Type and Name are already chosen above. */
  hideLocked?: boolean;
}

export function SwapBuyTab({
  budgetId,
  budgetCurrency,
  holding,
  holdings,
  date,
  setDate,
  minDate,
  onDone,
  draft = "",
  setDraft,
  hideLocked = false,
}: SwapTabProps) {
  const t = useTranslations("budget.investments");
  const buyMut = useBuyAsset(budgetId);
  const sellMut = useSellHolding(budgetId);
  const ui = deriveUiType(
    holding.uiType,
    holding.holdingType,
    holding.isCustom,
  );
  const shape =
    ui === "broker"
      ? "broker"
      : holdingShape(holding) === "quantity"
        ? "quantity"
        : "amount";
  const assetCcy = ccyOf(holding, budgetCurrency);
  const valueCents = Number(holding.valueCents);
  const held = num(holding.quantity);

  const [qty, setQtyState] = useState(shape === "quantity" ? draft : "");
  const [price, setPrice] = useState("");
  const [amount, setAmountState] = useState(shape === "quantity" ? "" : draft);
  const setQty = (v: string) => {
    setQtyState(v);
    setDraft?.(v);
  };
  const setAmount = (v: string) => {
    setAmountState(v);
    setDraft?.(v);
  };
  const [ccy, setCcy] = useState(holding.buyCurrency ?? assetCcy);
  // A carried amount prefills "value after" like a typed one (D-08).
  const [valueAfter, setValueAfter] = useState(
    shape === "broker" && draft.trim() !== "" && Number.isFinite(num(draft))
      ? String((valueCents + toCents(draft)) / 100)
      : "",
  );
  const [valueAfterTouched, setValueAfterTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // R6 (user): where the money came from — outside (today's Buy) or another
  // asset (sold into this one, booked by the Sell endpoint).
  const [from, setFrom] = useState<"out" | "asset">("out");
  const [srcId, setSrcId] = useState("");
  const [taken, setTaken] = useState("");
  const sources = holdings.filter(
    (h) => h.id !== holding.id && Number(h.valueCents) > 0,
  );
  const groups = UI_TYPE_ORDER.map(
    (ui) =>
      [
        ui,
        sources.filter(
          (h) => deriveUiType(h.uiType, h.holdingType, h.isCustom) === ui,
        ),
      ] as const,
  ).filter(([, list]) => list.length > 0);
  const src =
    from === "asset" ? sources.find((h) => h.id === srcId) : undefined;
  const srcQty = !!src && holdingShape(src) === "quantity";
  const srcCcy = src ? ccyOf(src, budgetCurrency) : "";
  /** What stays in the source — null while invalid (same math as Sell). */
  const left = (() => {
    if (!src || !(num(taken) > 0)) return null;
    if (srcQty) {
      const e8 =
        Math.round(num(src.quantity) * 1e8) - Math.round(num(taken) * 1e8);
      return e8 < 0 ? null : ({ quantity: qtyString(e8 / 1e8) } as const);
    }
    const v = Math.round(Number(src.valueCents));
    const sold = toCents(taken);
    return sold > v ? null : ({ valueCents: String(v - sold) } as const);
  })();
  const overTaken = !!src && num(taken) > 0 && !left;

  const money = (c: number) => centsToBare(String(Math.round(Math.abs(c))));
  const signed = (c: number) => `${c > 0 ? "+" : c < 0 ? "−" : ""}${money(c)}`;

  const onAmount = (v: string) => {
    setAmount(v);
    // Prefill "value after" = current + amount until the user sets it (D-08).
    if (shape === "broker" && !valueAfterTouched) {
      const a = num(v);
      setValueAfter(
        Number.isFinite(a) ? String((valueCents + toCents(v)) / 100) : "",
      );
    }
  };

  const typed = (s: string) => s.trim() !== "";
  const positive = (s: string) => typed(s) && num(s) > 0;
  const fields = shape === "quantity" ? [qty, price] : [amount];
  const badAmount = fields.some((f) => typed(f) && !(num(f) > 0));
  const badAfter =
    shape === "broker" && typed(valueAfter) && !(num(valueAfter) >= 0);
  const fromAsset = from === "asset";
  const valid =
    fields.every(positive) &&
    (fromAsset
      ? !!left
      : !badAfter && (shape !== "broker" || typed(valueAfter))) &&
    dateOk(date, minDate);

  const summary = !valid
    ? buildSwapSummary(null)
    : shape === "quantity"
      ? buildSwapSummary({
          tab: "buy",
          shape,
          name: holding.name,
          qty0: held,
          qty1: held + num(qty),
          v0: valueCents,
          v1:
            valueCents +
            num(qty) * (held > 0 ? valueCents / held : toCents(price)),
          ccy: assetCcy,
        })
      : shape === "amount"
        ? buildSwapSummary({
            tab: "buy",
            shape,
            name: holding.name,
            v0: valueCents,
            v1: valueCents + toCents(amount),
            ccy: assetCcy,
          })
        : buildSwapSummary({
            tab: "buy",
            shape,
            name: holding.name,
            v0: valueCents,
            v1: toCents(valueAfter),
            ccy: assetCcy,
            marketCents: toCents(valueAfter) - valueCents - toCents(amount),
            depositCents: 0,
          });

  const onError = (e: unknown) => {
    if (isOfflineWriteError(e)) return;
    const w = e as AssetWriteError;
    setServerError(
      w.code === "fx_unavailable"
        ? t("swap.err.fx", {
            currency: w.currency ?? "",
            date: w.date ?? "",
          })
        : w.code === "before_latest_entry"
          ? t("swap.err.beforeLatest", { date: minDate ?? "" })
          : t("swap.err.saveFailed"),
    );
  };
  const onSuccess = () => {
    toast.success(t("swap.cta.buy", { name: holding.name }));
    onDone();
  };

  function submit() {
    if (!valid) return;
    setServerError(null);
    if (fromAsset && src && left) {
      sellMut.mutate(
        {
          holdingId: src.id,
          body: {
            effectiveDate: date,
            left,
            destination:
              shape === "quantity"
                ? {
                    kind: "existing",
                    holdingId: holding.id,
                    quantityBought: qtyString(num(qty)),
                    priceCents: String(toCents(price)),
                  }
                : { kind: "existing", holdingId: holding.id },
            ...(shape === "quantity"
              ? {}
              : { receivedCents: String(toCents(amount)) }),
            receivedCurrency: shape === "broker" ? assetCcy : ccy,
          },
        },
        { onSuccess, onError },
      );
      return;
    }
    const body: BuyAssetBody =
      shape === "quantity"
        ? {
            kind: "quantity",
            quantity: qtyString(num(qty)),
            priceCents: String(toCents(price)),
            currency: ccy,
            effectiveDate: date,
          }
        : shape === "amount"
          ? {
              kind: "amount",
              amountCents: String(toCents(amount)),
              currency: ccy,
              effectiveDate: date,
            }
          : {
              kind: "broker",
              amountCents: String(toCents(amount)),
              valueAfterCents: String(toCents(valueAfter)),
              effectiveDate: date,
            };
    buyMut.mutate({ holdingId: holding.id, body }, { onSuccess, onError });
  }

  return (
    <>
      <div className="space-y-4">
        {!hideLocked && (
          <>
            <LockedField
              label={t("field.type")}
              value={t(`uitype.${ui}`)}
              testId="swap-locked-type"
            />
            <LockedField
              label={t("asset.name.label")}
              value={holding.name}
              testId="swap-locked-name"
            />
          </>
        )}
        {holding.instrumentId && (
          <LockedField
            label={t("field.asset")}
            value={holding.instrumentName ?? holding.symbol ?? ""}
            testId="swap-locked-instrument"
          />
        )}

        <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
          {t("swap.buy.from")}
        </h3>
        <RadioCards
          value={from}
          onChange={setFrom}
          label={t("swap.buy.from")}
          testPrefix="swap-buy-from-"
          options={(["out", "asset"] as const).map((k) => ({
            k,
            title: t(`swap.buy.src.${k}`),
            desc: t(`swap.buy.src.${k}Desc`),
          }))}
        />
        {fromAsset && (
          <>
            <Field label={t("swap.buy.srcAsset")}>
              <Select
                value={srcId}
                onValueChange={(v) => {
                  setSrcId(v);
                  setTaken("");
                }}
              >
                <SelectTrigger
                  data-testid="swap-buy-src"
                  aria-label={t("swap.buy.srcAsset")}
                  className="min-h-11 w-full"
                >
                  <SelectValue placeholder={t("swap.buy.srcPlaceholder")} />
                </SelectTrigger>
                {/* R6 (user): grouped by type, icon headers, rich rows. */}
                <SelectContent
                  position="popper"
                  className="max-h-[min(60dvh,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]"
                >
                  {groups.map(([ui, list], gi) => {
                    const Icon = UI_TYPE_ICON[ui];
                    return (
                      <SelectGroup key={ui}>
                        {gi > 0 && <SelectSeparator />}
                        <SelectLabel
                          data-testid={`swap-buy-src-group-${ui}`}
                          className="flex items-center gap-2 normal-case tracking-normal"
                        >
                          <Icon
                            data-type-icon
                            className="h-4 w-4 shrink-0"
                            style={{ color: UI_TYPE_COLOR[ui] }}
                            aria-hidden="true"
                          />
                          {t(`uitype.${ui}`)}
                        </SelectLabel>
                        {list.map((h) => (
                          <SelectItem
                            key={h.id}
                            value={h.id}
                            data-testid={`swap-buy-src-option-${h.id}`}
                            className="min-h-11 pl-8"
                          >
                            <span className="flex w-full min-w-0 items-center justify-between gap-3">
                              <span data-src-name className="min-w-0 truncate">
                                {h.name}
                              </span>
                              <span className="flex shrink-0 flex-col items-end leading-tight tabular-nums">
                                <span data-src-value>
                                  {`${money(Number(h.valueCents))} ${ccyOf(h, budgetCurrency)}`}
                                </span>
                                {holdingShape(h) === "quantity" && (
                                  <span
                                    data-src-qty
                                    className="text-[11px]"
                                    style={{
                                      color: "var(--muted-foreground)",
                                      opacity: 0.7,
                                    }}
                                  >
                                    {heldQty(t, h)}
                                  </span>
                                )}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            {src && (
              <>
                <Field label={srcQty ? t("sell.qtySold") : t("sell.valueSold")}>
                  <NumericInput
                    testId="swap-buy-taken"
                    value={taken}
                    onChange={setTaken}
                  />
                </Field>
                <HeldButton
                  testId="swap-buy-src-held"
                  onClick={() =>
                    setTaken(
                      srcQty
                        ? trimQty(src.quantity)
                        : String(Number(src.valueCents) / 100),
                    )
                  }
                >
                  {srcQty
                    ? t("sell.qtyHelper", { qty: heldQty(t, src) })
                    : t("sell.valueHelper", {
                        value: `${money(Number(src.valueCents))} ${srcCcy}`,
                      })}
                </HeldButton>
                {overTaken && <ErrorLine>{t("swap.err.overHeld")}</ErrorLine>}
              </>
            )}
          </>
        )}

        {shape === "quantity" && (
          <>
            <Field label={t("swap.buy.quantity")}>
              <NumericInput
                testId="swap-buy-qty"
                value={qty}
                onChange={setQty}
              />
            </Field>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={t("swap.buy.price")}>
                  <NumericInput
                    testId="swap-buy-price"
                    value={price}
                    onChange={setPrice}
                  />
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <CurrencyPicker
                  variant="field"
                  value={ccy}
                  onSelect={setCcy}
                  aria-label={t("swap.buy.price")}
                />
              </div>
            </div>
            <p
              data-testid="swap-buy-total"
              className={caption}
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("swap.buy.total", {
                amount: `${money(positive(qty) && positive(price) ? num(qty) * toCents(price) : 0)} ${ccy}`,
              })}
            </p>
          </>
        )}

        {shape === "amount" && (
          <>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={t("swap.buy.amountAdded")}>
                  <NumericInput
                    testId="swap-buy-amount"
                    value={amount}
                    onChange={setAmount}
                  />
                </Field>
              </div>
              <div className="w-24 shrink-0">
                <CurrencyPicker
                  variant="field"
                  value={ccy}
                  onSelect={setCcy}
                  aria-label={t("swap.buy.amountAdded")}
                />
              </div>
            </div>
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {t("swap.buy.cashHelp")}
            </p>
          </>
        )}

        {shape === "broker" && (
          <>
            <Field label={`${t("swap.buy.amountAdded")} (${assetCcy})`}>
              <NumericInput
                testId="swap-buy-amount"
                value={amount}
                onChange={onAmount}
              />
            </Field>
            {!fromAsset && (
              <>
                <Field label={`${t("swap.buy.valueAfter")} (${assetCcy})`}>
                  <NumericInput
                    testId="swap-buy-value-after"
                    value={valueAfter}
                    onChange={(v) => {
                      setValueAfterTouched(true);
                      setValueAfter(v);
                    }}
                  />
                </Field>
                <p
                  className={caption}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("swap.buy.valueAfterHelp", {
                    current: money(valueCents),
                    amount: money(toCents(amount || "0")),
                  })}
                </p>
              </>
            )}
            {valid && !fromAsset && (
              <p data-testid="swap-buy-split" className={caption}>
                <span
                  style={{
                    color: signColor(
                      toCents(valueAfter) - valueCents - toCents(amount),
                    ),
                  }}
                >
                  {t("swap.buy.split", {
                    market: signed(
                      toCents(valueAfter) - valueCents - toCents(amount),
                    ),
                    deposit: signed(0),
                  })}
                </span>
              </p>
            )}
          </>
        )}

        {(badAmount || badAfter) && (
          <ErrorLine>{t("swap.err.positive")}</ErrorLine>
        )}
        <SwapDateField value={date} onChange={setDate} min={minDate} />
        {serverError && <ErrorLine>{serverError}</ErrorLine>}
      </div>
      <SwapFooter
        summary={summary}
        label={t("swap.cta.buy", { name: holding.name })}
        disabled={!valid}
        pending={buyMut.isPending || sellMut.isPending}
        onSubmit={submit}
        onDiscard={onDone}
      />
    </>
  );
}
