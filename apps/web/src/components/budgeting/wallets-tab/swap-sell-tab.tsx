"use client";
/**
 * swap-sell-tab.tsx — Swap → Sell (13.1 D-09, D-20..D-23, D-31; Phase 13 UAT
 * tests 4–5). How much was sold (round 2: the client converts it to the
 * server's `left`; Sell everything only fills the field) → where the money
 * went → destination detail → amount received + currency on ONE line → date.
 *
 *   New / Existing   a linked leg in the destination asset. A quantity
 *                    destination is quantity × price (13.1 UAT 10): the price
 *                    is the asset's own (Existing, read-only) or the live /
 *                    typed one (New) and NEVER follows the quantity; the
 *                    quantity follows sold value ÷ price only until typed.
 *                    Received = quantity × price — no Amount received field.
 *   Out              optionally lands in a wallet (existing: its currency,
 *                    locked; new: name · type · currency) or Nowhere (D-20).
 *
 * An existing ASSET preselects its own currency but any may be picked (R5-6):
 * the server books the leg into that asset at one deal rate.
 *
 * Realized previews the server's single deal rate (13.1 UAT 14): proceeds in
 * the source currency = received ÷ rate(source → received), minus sold cost.
 *
 * Preview mirrors the server booking with display-only Number math:
 *   quantity: sold cost = buy × sold qty
 *   amount:   kept cost = buy × kept ÷ value
 *   deposit:  sold cost = principal − kept (all interest realized)
 */
import { stablePeg } from "@/lib/stablecoins";
import { isCashLike } from "@/lib/cash-like";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";
import { centsToBare } from "@/lib/cents-format";
import { holdingShape, isQtyUiType } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import type { AssetWriteError } from "@/lib/investment-invalidate";
import { buildSwapSummary } from "@/lib/swap-summary";
import { useWallets, type WalletDto } from "@/hooks/use-wallets";
import { useSellHolding, type WalletTarget } from "@/hooks/use-sell-holding";
import {
  Field,
  HoldingFormFields,
  NumericInput,
  type DestinationHolding,
} from "./holding-sheet";
import type { SwapTabProps } from "./swap-buy-tab";
import {
  RadioCards,
  caption,
  ccyOf,
  dateOk,
  ErrorLine,
  heading,
  HeldButton,
  heldQty,
  num,
  qtyString,
  SwapDateField,
  NoteField,
  noteBody,
  useOtherAssetDate,
  SwapFooter,
  toCents,
  today,
  trimQty,
} from "./swap-shared";

// R6-3 (user): one "Into investments" card (pick an asset in place, or name a
// new one) + "Out of investments". The old New / Existing split (D-09) is gone.
type Dest = "invest" | "out";
type WalletKind = WalletTarget["kind"];
const DESTS: Dest[] = ["invest", "out"];
const WALLET_KINDS: WalletKind[] = ["existing", "new", "nowhere"];
const WALLET_TYPES = [
  "SPENDINGS",
  "CUSHION",
  "RESERVE",
  "POSSESSION",
  "OTHER",
] as const;

/** A plain decimal string for a derived figure (no float noise). */
const plain = (n: number) => (Number.isFinite(n) ? trimQty(n.toFixed(8)) : "");

// Round-2 gap 7: an in-DOM list that flips above a low trigger and gets the
// screen, never a 2-row native sliver.
const LIST =
  "max-h-[min(60dvh,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]";

const selectStyle = {
  background: "var(--surface-card-dark)",
  borderColor: "var(--hairline-dark)",
  color: "var(--body-on-dark)",
} as const;

export function SwapSellTab({
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
}: SwapTabProps) {
  const t = useTranslations("budget.investments");
  const tw = useTranslations("bdp.tab.wallets.section");
  const sellMut = useSellHolding(budgetId);
  const wallets = (useWallets(budgetId).data ?? []).filter(
    (w) => !w.archivedAt,
  );

  const shape = holdingShape(holding);
  const held = num(holding.quantity);
  const valueCents = Number(holding.valueCents);
  const buyCents = Number(holding.buyPriceCents ?? 0);
  const srcCcy = ccyOf(holding, budgetCurrency);

  const [sold, setSoldState] = useState(draft);
  const setSold = (v: string) => {
    setSoldState(v);
    setDraft?.(v);
  };
  const [dest, setDest] = useState<Dest>("invest");
  const [newHolding, setNewHolding] = useState<DestinationHolding | null>(null);
  const [destQty, setDestQty] = useState("");
  const [destPrice, setDestPrice] = useState("");
  // R6 (user): the first of quantity / price typed fills the other on the
  // fly, once — leaving it or typing the other ends that ("done").
  const [filler, setFiller] = useState<"qty" | "price" | "done" | null>(null);
  // A price we filled (never typed), per unit in the SOURCE currency — shown
  // at the received currency's rate, so a currency change converts it.
  const [autoPrice, setAutoPrice] = useState<number | null>(null);
  const [existingId, setExistingId] = useState("");
  const [walletKind, setWalletKind] = useState<WalletKind>("nowhere");
  const [walletId, setWalletId] = useState("");
  const [walletName, setWalletName] = useState("");
  // R6 (user): an optional note for the ledger row.
  const [note, setNote] = useState("");
  const [walletType, setWalletType] =
    useState<(typeof WALLET_TYPES)[number]>("SPENDINGS");
  const [chosenCcy, setChosenCcy] = useState(srcCcy);
  const [received, setReceived] = useState("");
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const existing = holdings.find((h) => h.id === existingId);
  /** Which booking "Into investments" is: a picked asset, or a new one. */
  const mode: "existing" | "new" | "out" =
    dest === "out" ? "out" : existingId ? "existing" : "new";
  const wallet: WalletDto | undefined = wallets.find((w) => w.id === walletId);
  const receivedCcy =
    dest === "out" && walletKind === "existing" && wallet
      ? wallet.currency
      : chosenCcy;
  // Only an existing wallet locks the currency (D-22); an existing asset
  // preselects its own (R5-6).
  const ccyLocked = dest === "out" && walletKind === "existing";
  const assetCcy = existing ? ccyOf(existing, budgetCurrency) : receivedCcy;
  const pickExisting = (id: string | null) => {
    setExistingId(id ?? "");
    setDestQty("");
    setDestPrice("");
    setFiller(null);
    setAutoPrice(null);
    if (!id) return;
    const h = holdings.find((x) => x.id === id);
    if (h) setChosenCcy(ccyOf(h, budgetCurrency));
    setReceivedTouched(false);
  };
  // R6 (user): a stablecoin destination buys at 1 in the fiat it tracks —
  // currency locked; the quantity is still the user's.
  const destPeg =
    dest !== "invest"
      ? null
      : mode === "existing"
        ? stablePeg(existing?.symbol)
        : (newHolding?.pegCurrency ?? null);
  const newInstrumentId = newHolding?.instrumentId ?? null;
  useEffect(() => {
    if (!destPeg) return;
    setChosenCcy(destPeg);
    setDestPrice("1");
    setAutoPrice(null);
    setFiller("price");
  }, [destPeg, existingId, newInstrumentId]);
  // R6 (user): the sale date's rate asset currency → received currency — the
  // one the server books with (preview of its price and value).
  // A half-typed date isn't a day — keep today's until it is one.
  const rateDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  const [assetRate, setAssetRate] = useState(1);
  useEffect(() => {
    if (mode !== "existing" || assetCcy === receivedCcy) {
      setAssetRate(1);
      return;
    }
    let live = true;
    void clientApiFetch(
      `/fx/rate?from=${assetCcy}&to=${receivedCcy}&date=${rateDate}`,
    )
      .then(async (r) => (r.ok ? ((await r.json()) as { rate: string }) : null))
      .then((q) => live && q && setAssetRate(Number(q.rate)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mode, assetCcy, receivedCcy, rateDate]);

  // The sale date's rate source currency → received currency (prefill +
  // preview; the server books realized at that date's rate too).
  const [rate, setRate] = useState(1);
  useEffect(() => {
    if (receivedCcy === srcCcy) {
      setRate(1);
      return;
    }
    let live = true;
    void clientApiFetch(
      `/fx/rate?from=${srcCcy}&to=${receivedCcy}&date=${rateDate}`,
    )
      .then(async (r) => (r.ok ? ((await r.json()) as { rate: string }) : null))
      .then((q) => live && q && setRate(Number(q.rate)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [srcCcy, receivedCcy, rateDate]);

  const calc = useMemo(() => {
    if (sold.trim() === "") return null;
    const x = num(sold);
    if (!Number.isFinite(x) || x <= 0) return { invalid: true } as const;
    if (shape === "quantity") {
      // 1e8-scaled integers: 0.3 − 0.1 is 0.2, not 0.19999999999999998.
      const leftE8 = Math.round(held * 1e8) - Math.round(x * 1e8);
      if (leftE8 < 0) return { invalid: true } as const;
      const leftQty = leftE8 / 1e8;
      const unit = held > 0 ? valueCents / held : 0;
      return {
        invalid: false,
        leftQty,
        keep: 0,
        soldValue: x * unit,
        soldCost: buyCents * x,
        rowValue: leftQty * unit,
      } as const;
    }
    const soldCents = Math.round(x * 100);
    if (soldCents > Math.round(valueCents)) return { invalid: true } as const;
    // Selling the whole value (tapped "Current value") keeps nothing.
    const keep =
      soldCents >= Math.round(valueCents)
        ? 0
        : Math.max(0, valueCents - soldCents);
    const soldCost =
      shape === "deposit"
        ? buyCents - keep
        : buyCents - (valueCents > 0 ? (buyCents * keep) / valueCents : 0);
    return {
      invalid: false,
      leftQty: 0,
      keep,
      soldValue: valueCents - keep,
      soldCost,
      rowValue: keep,
    } as const;
  }, [sold, shape, held, valueCents, buyCents]);

  // Prefill "Amount received" with today's value of the sold part, converted.
  useEffect(() => {
    if (receivedTouched || !calc || calc.invalid) return;
    setReceived(String(Math.round(calc.soldValue * rate) / 100));
  }, [calc, rate, receivedTouched]);

  // Destination price (D-09): typed, else Existing = its own, New = the
  // instrument's live price. Nothing ever writes it from qty.
  const existingIsQty = !!existing && holdingShape(existing) === "quantity";
  const newIsQty = !!newHolding && isQtyUiType(newHolding.uiType);
  const qtyDest =
    (mode === "existing" && existingIsQty) || (mode === "new" && newIsQty);
  // Nothing is prefilled (R6, user): quantity × price is what the user says.
  // R6 (user): a filled price has 2 decimals; a typed one is kept as typed.
  const priceText =
    autoPrice === null
      ? destPrice
      : plain(Math.round(autoPrice * rate * 100) / 100);
  const price = num(priceText);
  const soldValue = calc && !calc.invalid ? calc.soldValue / 100 : 0;
  const soldInReceived = soldValue * rate;
  const qtyText = destQty;
  /** sold value ÷ the typed figure — the other field's fill. */
  const counterpart = (v: string) =>
    num(v) > 0 && soldInReceived > 0 ? plain(soldInReceived / num(v)) : "";
  const typeDest = (field: "qty" | "price", v: string) => {
    if (field === "qty") setDestQty(v);
    else {
      setDestPrice(v);
      setAutoPrice(null);
    }
    if (filler === null || filler === field) {
      setFiller(field);
      if (field === "price") setDestQty(counterpart(v));
      else
        setAutoPrice(num(v) > 0 && soldValue > 0 ? soldValue / num(v) : null);
    } else if (filler !== "done") setFiller("done");
  };
  const leaveDest = (field: "qty" | "price") => {
    if (filler === field && (field === "qty" ? destQty : destPrice) !== "")
      setFiller("done");
  };
  const qty = num(qtyText);

  // ponytail: display-only Number math (no-float-money keys on member names).
  const receivedCents = qtyDest
    ? Number.isFinite(qty * price)
      ? Math.round(qty * price * 100)
      : 0
    : toCents(received || "0");
  const soldPart = calc && !calc.invalid ? calc.soldCost : null;
  const realized =
    soldPart === null || !(rate > 0) ? null : receivedCents / rate - soldPart;

  const nameMissing =
    dest === "out" && walletKind === "new" && walletName.trim() === "";
  const destOk =
    dest === "out"
      ? walletKind === "nowhere" ||
        (walletKind === "existing" ? !!wallet : !nameMissing)
      : mode === "existing"
        ? !!existing && (!existingIsQty || qty > 0)
        : newHolding !== null && (!newIsQty || (qty > 0 && price > 0));
  // R6 (user): the ledger only appends — an existing destination's newest
  // entry bounds the date too (the server refuses before it).
  const destDate = useOtherAssetDate(
    budgetId,
    minDate,
    mode === "existing" ? existing : null,
    date,
  );
  const effMin = destDate.min;
  const dateError = destDate.error;
  const valid =
    !!calc &&
    !calc.invalid &&
    receivedCents > 0 &&
    destOk &&
    dateOk(date, effMin);

  const destName =
    mode === "existing"
      ? (existing?.name ?? "")
      : mode === "new"
        ? (newHolding?.name ?? "")
        : walletKind === "existing"
          ? (wallet?.name ?? "")
          : walletName.trim();
  const summary =
    !valid || !calc || calc.invalid
      ? buildSwapSummary(null)
      : buildSwapSummary({
          tab: "sell",
          name: holding.name,
          v0: valueCents,
          v1: calc.rowValue,
          ccy: srcCcy,
          // R6 (user): cash / stablecoin sales realize nothing worth a line.
          realized: isCashLike(holding) ? null : (realized ?? 0),
          realizedCcy: srcCcy,
          dest:
            mode === "new"
              ? {
                  kind: "new",
                  name: destName,
                  amount: receivedCents,
                  ccy: receivedCcy,
                }
              : mode === "existing"
                ? {
                    kind: "existing",
                    name: destName,
                    d0: Number(existing!.valueCents),
                    d1:
                      Number(existing!.valueCents) +
                      (assetRate > 0 ? receivedCents / assetRate : 0),
                    ccy: assetCcy,
                  }
                : walletKind === "existing"
                  ? {
                      kind: "wallet",
                      name: destName,
                      b0: Number(wallet!.currentBalanceCents),
                      b1: Number(wallet!.currentBalanceCents) + receivedCents,
                      ccy: receivedCcy,
                    }
                  : walletKind === "new"
                    ? {
                        kind: "newWallet",
                        name: destName,
                        amount: receivedCents,
                        ccy: receivedCcy,
                      }
                    : { kind: "nowhere" },
        });

  function submit() {
    if (!valid) return;
    setServerError(null);
    const leftBody =
      calc && !calc.invalid
        ? shape === "quantity"
          ? { quantity: qtyString(calc.leftQty) }
          : { valueCents: String(Math.round(calc.keep)) }
        : null;
    if (!leftBody) return;
    const walletBody: WalletTarget =
      walletKind === "existing"
        ? { kind: "existing", walletId }
        : walletKind === "new"
          ? {
              kind: "new",
              name: walletName.trim(),
              walletType,
              currency: receivedCcy,
            }
          : { kind: "nowhere" };
    const destination =
      dest === "out"
        ? ({
            kind: "out",
            wallet: walletBody,
          } as const)
        : mode === "existing"
          ? {
              kind: "existing" as const,
              holdingId: existingId,
              ...(existingIsQty ? { quantityBought: qtyString(qty) } : {}),
              ...(existingIsQty
                ? { priceCents: String(Math.round(price * 100)) }
                : {}),
            }
          : (() => {
              const {
                livePriceCents,
                livePriceCurrency,
                pegCurrency: _peg, // eslint-disable-line @typescript-eslint/no-unused-vars
                ...base
              } = newHolding!;
              // R6: the live price is only the new asset's price in its own
              // currency; otherwise the server falls back to the buy price.
              const live =
                livePriceCurrency === receivedCcy ? livePriceCents : null;
              return {
                kind: "new" as const,
                holding: {
                  ...base,
                  currentPriceCurrency: receivedCcy,
                  ...(newIsQty
                    ? {
                        quantity: qtyString(qty),
                        ...(live ? { currentPriceCents: live } : {}),
                      }
                    : {}),
                },
                ...(newIsQty
                  ? { priceCents: String(Math.round(price * 100)) }
                  : {}),
              };
            })();
    sellMut.mutate(
      {
        holdingId: holding.id,
        body: {
          effectiveDate: date,
          ...noteBody(note),
          left: leftBody,
          destination,
          // A quantity destination's received is quantity × price (server).
          ...(qtyDest ? {} : { receivedCents: String(receivedCents) }),
          receivedCurrency: receivedCcy,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            t(dest === "out" ? "sell.toastWithdraw" : "sell.toastSale"),
          );
          onDone();
        },
        onError: (e) => {
          if (isOfflineWriteError(e)) return;
          const w = e as AssetWriteError;
          setServerError(
            w.code === "fx_unavailable"
              ? t("swap.err.fx", {
                  currency: w.currency ?? "",
                  date: w.date ?? "",
                })
              : w.code === "before_latest_entry"
                ? destDate.beforeMsg
                : t("swap.err.saveFailed"),
          );
        },
      },
    );
  }

  const walletsByType = WALLET_TYPES.map(
    (wt) => [wt, wallets.filter((w) => w.walletType === wt)] as const,
  ).filter(([, ws]) => ws.length > 0);
  const money = (c: number) => centsToBare(String(Math.round(Math.abs(c))));

  /** One quantity + one price; received = quantity × price. */
  // R6 (user): laid out like Buy — quantity, then price + currency; the price is just
  // "Buy price" (the currency is beside it) and never locked.
  const destPair = () => (
    <>
      <Field label={t("swap.buy.quantity")}>
        <NumericInput
          testId="swap-dest-qty"
          value={qtyText}
          onChange={(v) => typeDest("qty", v)}
          onBlur={() => leaveDest("qty")}
        />
      </Field>
      <div data-testid="swap-dest-row" className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t("swap.buy.price")}>
            <NumericInput
              testId="swap-dest-price"
              value={priceText}
              onChange={(v) => typeDest("price", v)}
              onBlur={() => leaveDest("price")}
            />
          </Field>
        </div>
        <div data-testid="swap-dest-ccy" className="w-24 shrink-0">
          <CurrencyPicker
            variant="field"
            value={chosenCcy}
            onSelect={setChosenCcy}
            disabled={!!destPeg}
            aria-label={t("field.currency")}
          />
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="space-y-6">
        {/* 1. How much was sold? */}
        <section className="space-y-2">
          <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
            {t("swap.sell.sold")}
          </h3>
          <Field
            label={
              shape === "quantity" ? t("sell.qtySold") : t("sell.valueSold")
            }
          >
            <NumericInput
              testId="swap-sell-sold"
              value={sold}
              onChange={setSold}
            />
          </Field>
          {/* Round 3: tap what you hold to sell it all (no toggle). */}
          <HeldButton
            testId="swap-sell-held"
            onClick={() =>
              setSold(
                shape === "quantity"
                  ? trimQty(holding.quantity)
                  : String(valueCents / 100),
              )
            }
          >
            {shape === "quantity"
              ? t("sell.qtyHelper", { qty: heldQty(t, holding) })
              : t("sell.valueHelper", {
                  value: `${money(valueCents)} ${srcCcy}`,
                })}
          </HeldButton>
          {calc?.invalid && <ErrorLine>{t("swap.err.soldRange")}</ErrorLine>}
        </section>

        {/* 2. Where did the money go? */}
        <section className="space-y-2">
          <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
            {t("swap.sell.where")}
          </h3>
          <RadioCards
            value={dest}
            onChange={setDest}
            label={t("swap.sell.where")}
            testPrefix="swap-dest-"
            options={DESTS.map((k) => ({
              k,
              title: t(`swap.sell.dest.${k}`),
              desc: t(`swap.sell.dest.${k}Desc`),
            }))}
          />

          {/* 3. Destination detail — R6-3: ONE name field. A picked asset
              (by id, in place) is the destination; a typed name is a new one. */}
          {dest === "invest" && (
            <>
              <HoldingFormFields
                budgetId={budgetId}
                budgetCurrency={budgetCurrency}
                receivedCurrency={receivedCcy}
                initialUiType="cash"
                onChange={setNewHolding}
                selectedId={existingId || null}
                excludeId={holding.id}
                onPickExisting={pickExisting}
                nameHint={
                  mode === "new" &&
                  newHolding && (
                    <p
                      data-testid="swap-dest-new-marker"
                      className={caption}
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {t("swap.sell.dest.willCreate", {
                        name: newHolding.name,
                      })}
                    </p>
                  )
                }
              />
              {qtyDest && destPair()}
            </>
          )}
          {dest === "out" && (
            <section className="space-y-2 pt-2">
              <h4
                className="text-[14px] font-semibold"
                style={{ color: "var(--body-on-dark)" }}
              >
                {t("swap.sell.walletTitle")}
              </h4>
              <RadioCards
                value={walletKind}
                onChange={(k) => {
                  setWalletKind(k);
                  setReceivedTouched(false);
                }}
                label={t("swap.sell.walletTitle")}
                testPrefix="wallet-target-"
                center
                options={WALLET_KINDS.map((k) => ({
                  k,
                  title: t(`swap.sell.wallet.${k}`),
                }))}
              />
              {walletKind === "existing" && (
                <Select
                  value={walletId || undefined}
                  onValueChange={(v) => {
                    setWalletId(v);
                    setReceivedTouched(false);
                  }}
                >
                  <SelectTrigger
                    data-testid="swap-wallet-select"
                    aria-label={t("swap.sell.wallet.existing")}
                    className="min-h-11 w-full"
                  >
                    <SelectValue placeholder={t("swap.sell.wallet.existing")} />
                  </SelectTrigger>
                  <SelectContent position="popper" className={LIST}>
                    {walletsByType.map(([wt, ws]) => (
                      <SelectGroup key={wt}>
                        <SelectLabel>{tw(wt.toLowerCase())}</SelectLabel>
                        {ws.map((w) => (
                          <SelectItem
                            key={w.id}
                            value={w.id}
                            data-testid={`swap-wallet-option-${w.id}`}
                          >
                            {w.name} · {centsToBare(w.currentBalanceCents)}{" "}
                            {w.currency}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {walletKind === "new" && (
                <div className="space-y-2">
                  <Field label={t("swap.sell.wallet.name")}>
                    <Input
                      data-testid="swap-wallet-name"
                      value={walletName}
                      onChange={(e) => setWalletName(e.target.value)}
                      aria-invalid={nameMissing || undefined}
                    />
                  </Field>
                  {nameMissing && (
                    <ErrorLine>{t("swap.err.nameRequired")}</ErrorLine>
                  )}
                  <Field label={t("swap.sell.wallet.type")}>
                    <select
                      data-testid="swap-wallet-type"
                      value={walletType}
                      onChange={(e) =>
                        setWalletType(
                          e.target.value as (typeof WALLET_TYPES)[number],
                        )
                      }
                      className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                      style={selectStyle}
                    >
                      {WALLET_TYPES.map((wt) => (
                        <option key={wt} value={wt}>
                          {tw(wt.toLowerCase())}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p
                    className={caption}
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {t("swap.sell.wallet.newHelp")}
                  </p>
                </div>
              )}
              {walletKind === "existing" && (
                <p
                  className={caption}
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("swap.sell.wallet.help")}
                </p>
              )}
            </section>
          )}
        </section>

        {/* 4. Amount received + currency on ONE line (UAT test 5) — not for
            a quantity destination, whose amount is quantity × price. */}
        {!qtyDest && (
          <section className="space-y-2">
            <span className="text-caption text-[var(--muted-foreground)]">
              {t("swap.sell.received")}
            </span>
            <div
              data-testid="swap-received-row"
              className="flex flex-nowrap items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <NumericInput
                  testId="swap-sell-received"
                  value={received}
                  onChange={(v) => {
                    setReceivedTouched(true);
                    setReceived(v);
                  }}
                />
              </div>
              <div className="w-24 shrink-0">
                {ccyLocked ? (
                  <span
                    data-testid="swap-received-ccy"
                    className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border text-[14px]"
                    style={{
                      borderColor: "var(--hairline-dark)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {receivedCcy}
                  </span>
                ) : (
                  <CurrencyPicker
                    variant="field"
                    value={chosenCcy}
                    // A hand-typed amount stays; an untouched one re-converts.
                    onSelect={setChosenCcy}
                    aria-label={t("swap.sell.received")}
                  />
                )}
              </div>
            </div>
            <p className={caption} style={{ color: "var(--muted-foreground)" }}>
              {t("swap.sell.receivedHelp")}
            </p>
            {received.trim() !== "" && !(receivedCents > 0) && (
              <ErrorLine>{t("swap.err.received")}</ErrorLine>
            )}
          </section>
        )}

        <SwapDateField
          value={date}
          onChange={setDate}
          min={effMin}
          error={dateError}
        />
        <NoteField value={note} onChange={setNote} />
        {serverError && <ErrorLine>{serverError}</ErrorLine>}
      </div>
      <SwapFooter
        summary={summary}
        label={t(dest === "out" ? "swap.cta.sellOut" : "swap.cta.sell")}
        disabled={!valid}
        pending={sellMut.isPending}
        onSubmit={submit}
        onDiscard={onDone}
      />
    </>
  );
}
