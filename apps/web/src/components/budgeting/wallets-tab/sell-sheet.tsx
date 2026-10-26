"use client";
/**
 * sell-sheet.tsx — Phase 13 Sell (UI-SPEC §3; D-01..D-04, D-17, D-20).
 *
 * Stacked steps, not a wizard: How much is left? → Where did the money go?
 * (New investment / Existing investment / Out of investments) → Amount
 * received → Date. A live preview mirrors the server booking (13-01):
 *   quantity: sold cost = buy × sold qty
 *   amount:   kept cost = buy × left ÷ value (row % unchanged)
 *   deposit:  sold cost = principal − left (all interest is realized, D-20)
 * Realized = received − sold cost, shown in the received currency.
 * One POST /sell; the server is authoritative.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { clientApiFetch } from "@/lib/budget-fetch";
import { centsToBare } from "@/lib/cents-format";
import { deriveUiType, type UiType } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import type { HoldingDto } from "@/hooks/use-investments";
import { SellError, useSellHolding } from "@/hooks/use-sell-holding";
import {
  Field,
  HoldingFormFields,
  NumericInput,
  type DestinationHolding,
} from "./holding-sheet";

type Dest = "new" | "existing" | "out";
const DESTS: Dest[] = ["new", "existing", "out"];

/** Mirror of the server's holdingShape (packages/investments domain). */
function shapeOf(h: HoldingDto): "quantity" | "amount" | "deposit" {
  if (h.holdingType === "deposit") return "deposit";
  const ui = deriveUiType(h.uiType, h.holdingType, h.isCustom);
  if (ui === "stocks" || ui === "crypto" || ui === "precious_metals")
    return "quantity";
  return Number(h.quantity) === 1 ? "amount" : "quantity";
}

const num = (s: string) => Number(s.replace(/\s/g, "").replace(/,/g, "."));
const today = () => new Date().toLocaleDateString("en-CA");
const trimQty = (q: string) =>
  q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;
const ccyOf = (h: HoldingDto) =>
  h.buyCurrency ?? h.currentPriceCurrency ?? "PLN";
const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";

export function SellSheet({
  open,
  onOpenChange,
  budgetId,
  budgetCurrency,
  holding,
  holdings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
  holdings: HoldingDto[];
}) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const sellMut = useSellHolding(budgetId);
  const offlineToast = useOfflineWriteToast();

  const shape = shapeOf(holding);
  const held = num(holding.quantity);
  const valueCents = Number(holding.valueCents);
  const buyCents = Number(holding.buyPriceCents ?? 0);
  const srcCcy = ccyOf(holding);

  const [left, setLeft] = useState("");
  const [dest, setDest] = useState<Dest>("new");
  const [newHolding, setNewHolding] = useState<DestinationHolding | null>(null);
  const [existingId, setExistingId] = useState("");
  const [qtyBought, setQtyBought] = useState("");
  const [chosenCcy, setChosenCcy] = useState(srcCcy);
  const [received, setReceived] = useState("");
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [date, setDate] = useState(today());
  const [serverError, setServerError] = useState<string | null>(null);

  const existing = holdings.find((h) => h.id === existingId);
  const receivedCcy =
    dest === "existing" && existing ? ccyOf(existing) : chosenCcy;

  // Today's rate holding currency → received currency (prefill + preview).
  const [rate, setRate] = useState(1);
  useEffect(() => {
    if (receivedCcy === srcCcy) {
      setRate(1);
      return;
    }
    let live = true;
    void clientApiFetch(
      `/fx/rate?from=${srcCcy}&to=${receivedCcy}&date=${today()}`,
    )
      .then(async (r) => (r.ok ? ((await r.json()) as { rate: string }) : null))
      .then((q) => live && q && setRate(Number(q.rate)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [srcCcy, receivedCcy]);

  // ── Booking preview (display-only Number math; the server books in bigint) ──
  const calc = useMemo(() => {
    if (left.trim() === "") return null;
    const l = num(left);
    if (!Number.isFinite(l) || l < 0) return { tooHigh: true } as const;
    if (shape === "quantity") {
      if (l >= held) return { tooHigh: true } as const;
      const unitValue = held > 0 ? valueCents / held : 0;
      return {
        tooHigh: false,
        soldValue: (held - l) * unitValue,
        soldCost: buyCents * (held - l),
        rowValue: l * unitValue,
        rowCost: buyCents * l,
      } as const;
    }
    const keep = l * 100;
    if (keep >= valueCents) return { tooHigh: true } as const;
    const soldCost =
      shape === "deposit"
        ? buyCents - keep
        : buyCents - (valueCents > 0 ? (buyCents * keep) / valueCents : 0);
    return {
      tooHigh: false,
      soldValue: valueCents - keep,
      soldCost,
      rowValue: keep,
      rowCost: buyCents - soldCost,
    } as const;
  }, [left, shape, held, valueCents, buyCents]);

  // Prefill "Amount received" with today's value of the sold part (D-17).
  useEffect(() => {
    if (receivedTouched || !calc || calc.tooHigh) return;
    setReceived(String(Math.round(calc.soldValue * rate) / 100));
  }, [calc, rate, receivedTouched]);

  const receivedCents = Math.round(num(received || "0") * 100);
  // ponytail: display-only Number math (no-float-money keys on member names).
  const soldPart = calc && !calc.tooHigh ? calc.soldCost : null;
  const realized = soldPart === null ? null : receivedCents - soldPart * rate;

  const errReceived = received.trim() !== "" && !(receivedCents > 0);
  const errFuture = date > today();
  const destOk =
    dest === "out" ||
    (dest === "new" && newHolding !== null) ||
    (dest === "existing" &&
      !!existing &&
      (shapeOf(existing) !== "quantity" || num(qtyBought) > 0));
  const canSubmit =
    !!calc &&
    !calc.tooHigh &&
    receivedCents > 0 &&
    !errFuture &&
    destOk &&
    !sellMut.isPending;

  const destinations = holdings.filter(
    (h) =>
      h.id !== holding.id &&
      h.holdingType !== "deposit" &&
      h.holdingType !== "possession",
  );
  const byType = new Map<UiType, HoldingDto[]>();
  for (const h of destinations) {
    const ui = deriveUiType(h.uiType, h.holdingType, h.isCustom);
    byType.set(ui, [...(byType.get(ui) ?? []), h]);
  }

  const money = (c: number) =>
    centsToBare(String(Math.round(Math.abs(c))), locale);
  const signed = (c: number) => `${c > 0 ? "+" : c < 0 ? "−" : ""}${money(c)}`;

  function submit() {
    if (!canSubmit || !calc || calc.tooHigh) return;
    setServerError(null);
    const leftBody =
      shape === "quantity"
        ? { quantity: String(num(left)) }
        : { valueCents: String(Math.round(num(left) * 100)) };
    const destination =
      dest === "out"
        ? ({ kind: "out" } as const)
        : dest === "existing"
          ? {
              kind: "existing" as const,
              holdingId: existingId,
              ...(existing && shapeOf(existing) === "quantity"
                ? { quantityBought: String(num(qtyBought)) }
                : {}),
            }
          : {
              kind: "new" as const,
              holding: { ...newHolding!, currentPriceCurrency: receivedCcy },
            };
    sellMut.mutate(
      {
        holdingId: holding.id,
        body: {
          effectiveDate: date,
          left: leftBody,
          destination,
          receivedCents: String(receivedCents),
          receivedCurrency: receivedCcy,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            t(dest === "out" ? "sell.toastWithdraw" : "sell.toastSale"),
          );
          onOpenChange(false);
        },
        onError: (e: Error) => {
          const se = e as SellError;
          if (isOfflineWriteError(e)) return offlineToast();
          if (se.code === "fx_unavailable")
            return setServerError(
              t("sell.errFx", {
                currency: se.currency ?? "",
                date: se.date ?? "",
              }),
            );
          setServerError(t("sell.errSave"));
        },
      },
    );
  }

  const onRadioKey = (e: React.KeyboardEvent) => {
    const i = DESTS.indexOf(dest);
    if (e.key === "ArrowDown" || e.key === "ArrowRight")
      setDest(DESTS[(i + 1) % DESTS.length]!);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      setDest(DESTS[(i + DESTS.length - 1) % DESTS.length]!);
    else return;
    e.preventDefault();
  };

  const heading = "text-[16px] font-semibold leading-[1.4]";
  const caption = "text-[12px] leading-[1.4]";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="sell-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-2">
          <SheetTitle style={{ color: "var(--body-on-dark)" }}>
            {t("sell.title", { name: holding.name })}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-1">
          {/* 1. How much is left? */}
          <section className="space-y-2">
            <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
              {t("sell.leftLabel")}
            </h3>
            <Field
              label={
                shape === "quantity" ? t("sell.qtyLeft") : t("sell.valueLeft")
              }
            >
              <NumericInput
                testId="sell-left"
                value={left}
                onChange={setLeft}
              />
            </Field>
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {shape === "quantity"
                ? t("sell.qtyHelper", { qty: trimQty(holding.quantity) })
                : t("sell.valueHelper", {
                    value: `${money(valueCents)} ${srcCcy}`,
                  })}
            </p>
            {calc?.tooHigh && (
              <p
                role="alert"
                className={caption}
                style={{ color: "var(--trading-down)" }}
              >
                {t("sell.errLeftTooHigh")}
              </p>
            )}
            <button
              type="button"
              data-testid="sell-all"
              className="min-h-11 text-[14px] underline-offset-2 hover:underline"
              style={{ color: "var(--body-on-dark)" }}
              onClick={() => setLeft("0")}
            >
              {t("sell.sellAll")}
            </button>
            {calc && !calc.tooHigh && (
              <div
                className="space-y-1 rounded-[var(--radius-md)] p-4"
                style={{ background: "var(--surface-card-dark)" }}
              >
                <p
                  className={caption}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("sell.previewRow")}
                </p>
                <p
                  data-testid="sell-preview-row"
                  className="num text-[24px] font-semibold leading-[1.2]"
                  style={{ color: "var(--body-on-dark)" }}
                >
                  {money(calc.rowValue)} {srcCcy}
                </p>
                <p
                  className={caption}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("sell.previewRealized")}{" "}
                  <span
                    data-testid="sell-preview-realized"
                    className="num"
                    style={{ color: signColor(realized ?? 0) }}
                  >
                    {signed(realized ?? 0)} {receivedCcy}
                  </span>
                </p>
              </div>
            )}
          </section>

          {/* 2. Where did the money go? */}
          <section className="space-y-2">
            <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
              {t("sell.destTitle")}
            </h3>
            <div
              role="radiogroup"
              aria-label={t("sell.destTitle")}
              className="space-y-2"
              onKeyDown={onRadioKey}
            >
              {DESTS.map((d) => {
                const key =
                  d === "new"
                    ? "destNew"
                    : d === "existing"
                      ? "destExisting"
                      : "destOut";
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={dest === d}
                    tabIndex={dest === d ? 0 : -1}
                    data-testid={`sell-dest-${d}`}
                    onClick={() => setDest(d)}
                    className="flex min-h-11 w-full flex-col items-start rounded-[var(--radius-md)] border px-4 py-2 text-left"
                    style={{
                      background: "var(--surface-card-dark)",
                      borderColor:
                        dest === d ? "var(--primary)" : "var(--hairline-dark)",
                    }}
                  >
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: "var(--body-on-dark)" }}
                    >
                      {t(`sell.${key}`)}
                    </span>
                    <span
                      className={caption}
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {t(`sell.${key}Desc`)}
                    </span>
                  </button>
                );
              })}
            </div>

            {dest === "new" && (
              <HoldingFormFields
                budgetId={budgetId}
                budgetCurrency={budgetCurrency}
                receivedCurrency={receivedCcy}
                initialUiType="cash"
                onChange={setNewHolding}
              />
            )}
            {dest === "existing" && (
              <>
                <select
                  data-testid="sell-existing"
                  aria-label={t("sell.destExisting")}
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                  style={{
                    background: "var(--surface-card-dark)",
                    borderColor: "var(--hairline-dark)",
                    color: "var(--body-on-dark)",
                  }}
                >
                  <option value="" disabled>
                    {t("sell.destExistingDesc")}
                  </option>
                  {[...byType].map(([ui, hs]) => (
                    <optgroup key={ui} label={t(`uitype.${ui}`)}>
                      {hs.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} · {ccyOf(h)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {existing && shapeOf(existing) === "quantity" && (
                  <Field label={t("sell.qtyBought")}>
                    <NumericInput
                      testId="sell-qty-bought"
                      value={qtyBought}
                      onChange={setQtyBought}
                    />
                  </Field>
                )}
              </>
            )}
          </section>

          {/* 3. Amount received (destination's currency, D-17) */}
          <section className="space-y-2">
            <Field label={`${t("sell.received")} (${receivedCcy})`}>
              <NumericInput
                testId="sell-received"
                value={received}
                onChange={(v) => {
                  setReceivedTouched(true);
                  setReceived(v);
                }}
              />
            </Field>
            {dest !== "existing" && (
              <CurrencyPicker
                variant="field"
                value={chosenCcy}
                onSelect={(v) => {
                  setChosenCcy(v);
                  setReceivedTouched(false);
                }}
                aria-label={t("sell.received")}
              />
            )}
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {t("sell.receivedHelper")}
            </p>
            {errReceived && (
              <p
                role="alert"
                className={caption}
                style={{ color: "var(--trading-down)" }}
              >
                {t("sell.errReceived")}
              </p>
            )}
          </section>

          {/* 4. Date (default today, past allowed, D-06) */}
          <section className="space-y-2">
            <Field label={t("sell.date")}>
              <Input
                type="date"
                data-testid="sell-date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {errFuture && (
              <p
                role="alert"
                className={caption}
                style={{ color: "var(--trading-down)" }}
              >
                {t("sell.errFuture")}
              </p>
            )}
          </section>

          {serverError && (
            <p
              role="alert"
              className="text-[14px]"
              style={{ color: "var(--trading-down)" }}
            >
              {serverError}
            </p>
          )}

          <div
            className="flex items-center gap-2 border-t pt-4"
            style={{ borderColor: "var(--hairline-dark)" }}
          >
            <Button
              type="button"
              variant="primary"
              data-testid="sell-submit"
              disabled={!canSubmit}
              onClick={submit}
              className="flex-1"
            >
              {sellMut.isPending
                ? t("sell.saving")
                : t(dest === "out" ? "sell.submitWithdraw" : "sell.submitSale")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("sell.discard")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
