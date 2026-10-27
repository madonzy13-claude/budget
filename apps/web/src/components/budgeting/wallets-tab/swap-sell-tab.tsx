"use client";
/**
 * swap-sell-tab.tsx — Swap → Sell (13.1 D-09, D-20..D-23, D-31; Phase 13 UAT
 * tests 4–5). How much is left → where the money went → destination detail →
 * amount received + currency on ONE line → date.
 *
 *   New / Existing   a linked leg in the destination asset; a quantity
 *                    destination shows its buy price (Existing: its price,
 *                    read-only, quantity derived; New: quantity × price linked
 *                    to the amount).
 *   Out              optionally lands in a wallet (existing: its currency,
 *                    locked; new: name · type · currency) or Nowhere (D-20).
 *
 * Preview mirrors the server booking with display-only Number math:
 *   quantity: sold cost = buy × sold qty
 *   amount:   kept cost = buy × left ÷ value
 *   deposit:  sold cost = principal − left (all interest realized)
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { clientApiFetch } from "@/lib/budget-fetch";
import { centsToBare } from "@/lib/cents-format";
import {
  deriveUiType,
  holdingShape,
  type UiType,
} from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import type { AssetWriteError } from "@/lib/investment-invalidate";
import { buildSwapSummary } from "@/lib/swap-summary";
import type { HoldingDto } from "@/hooks/use-investments";
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
  ErrorLine,
  SwapDateField,
  SwapFooter,
  caption,
  ccyOf,
  dateOk,
  heading,
  num,
  qtyString,
  toCents,
  today,
  trimQty,
} from "./swap-shared";

type Dest = "new" | "existing" | "out";
type WalletKind = WalletTarget["kind"];
const DESTS: Dest[] = ["new", "existing", "out"];
const WALLET_KINDS: WalletKind[] = ["existing", "new", "nowhere"];
const WALLET_TYPES = [
  "SPENDINGS",
  "CUSHION",
  "RESERVE",
  "POSSESSION",
  "OTHER",
] as const;
const isQtyType = (ui: UiType | string) =>
  ui === "stocks" || ui === "crypto" || ui === "precious_metals";

/** A plain decimal string for a derived figure (no float noise). */
const plain = (n: number) => (Number.isFinite(n) ? trimQty(n.toFixed(8)) : "");

function RadioCards<K extends string>({
  value,
  options,
  onChange,
  label,
  testPrefix,
}: {
  value: K | null;
  options: { k: K; title: string; desc?: string }[];
  onChange: (k: K) => void;
  label: string;
  testPrefix: string;
}) {
  const keys = options.map((o) => o.k);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="space-y-2"
      onKeyDown={(e) => {
        const i = value ? keys.indexOf(value) : -1;
        if (e.key === "ArrowDown" || e.key === "ArrowRight")
          onChange(keys[(i + 1) % keys.length]!);
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
          onChange(keys[(i + keys.length - 1) % keys.length]!);
        else return;
        e.preventDefault();
      }}
    >
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={value === o.k}
          tabIndex={value === o.k || (!value && o.k === keys[0]) ? 0 : -1}
          data-testid={`${testPrefix}${o.k}`}
          onClick={() => onChange(o.k)}
          className="flex min-h-11 w-full flex-col items-start rounded-[var(--radius-md)] border px-4 py-2 text-left"
          style={{
            background: "var(--surface-card-dark)",
            borderColor:
              value === o.k ? "var(--primary)" : "var(--hairline-dark)",
          }}
        >
          <span
            className="text-[14px] font-semibold"
            style={{ color: "var(--body-on-dark)" }}
          >
            {o.title}
          </span>
          {o.desc && (
            <span
              className={caption}
              style={{ color: "var(--muted-foreground)" }}
            >
              {o.desc}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

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

  const [left, setLeft] = useState("");
  const [sellAll, setSellAll] = useState(false);
  const [dest, setDest] = useState<Dest>("new");
  const [newHolding, setNewHolding] = useState<DestinationHolding | null>(null);
  const [destQty, setDestQty] = useState("");
  const [destPrice, setDestPrice] = useState("");
  const [lastEdited, setLastEdited] = useState<"qty" | "price">("qty");
  const [existingId, setExistingId] = useState("");
  const [walletKind, setWalletKind] = useState<WalletKind>("nowhere");
  const [walletId, setWalletId] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] =
    useState<(typeof WALLET_TYPES)[number]>("SPENDINGS");
  const [newWalletCcy, setNewWalletCcy] = useState(srcCcy);
  const [chosenCcy, setChosenCcy] = useState(srcCcy);
  const [received, setReceived] = useState("");
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const existing = holdings.find((h) => h.id === existingId);
  const wallet: WalletDto | undefined = wallets.find((w) => w.id === walletId);
  const receivedCcy =
    dest === "existing" && existing
      ? ccyOf(existing, budgetCurrency)
      : dest === "out" && walletKind === "existing" && wallet
        ? wallet.currency
        : dest === "out" && walletKind === "new"
          ? newWalletCcy
          : chosenCcy;
  const ccyLocked =
    dest === "existing" || (dest === "out" && walletKind !== "nowhere");

  // Today's rate source currency → received currency (prefill + preview only).
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

  const calc = useMemo(() => {
    if (left.trim() === "") return null;
    const l = num(left);
    if (!Number.isFinite(l) || l < 0) return { tooHigh: true } as const;
    if (shape === "quantity") {
      if (l >= held) return { tooHigh: true } as const;
      const unit = held > 0 ? valueCents / held : 0;
      return {
        tooHigh: false,
        soldValue: (held - l) * unit,
        soldCost: buyCents * (held - l),
        rowValue: l * unit,
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
    } as const;
  }, [left, shape, held, valueCents, buyCents]);

  // Prefill "Amount received" with today's value of the sold part, converted.
  useEffect(() => {
    if (receivedTouched || !calc || calc.tooHigh) return;
    setReceived(String(Math.round(calc.soldValue * rate) / 100));
  }, [calc, rate, receivedTouched]);

  const receivedCents = toCents(received || "0");
  // ponytail: display-only Number math (no-float-money keys on member names).
  const soldPart = calc && !calc.tooHigh ? calc.soldCost : null;
  const realized = soldPart === null ? null : receivedCents - soldPart * rate;

  // Destination buy price (D-09).
  const existingIsQty = !!existing && holdingShape(existing) === "quantity";
  const existingPrice = existing
    ? Number(existing.currentPriceCents ?? 0) / 100
    : 0;
  const existingQty =
    existingIsQty && existingPrice > 0
      ? receivedCents / 100 / existingPrice
      : 0;
  const newIsQty = !!newHolding && isQtyType(newHolding.uiType);
  const derivedQty =
    lastEdited === "price" && num(destPrice) > 0
      ? receivedCents / 100 / num(destPrice)
      : num(destQty);
  const derivedPrice =
    lastEdited === "qty" && num(destQty) > 0
      ? receivedCents / 100 / num(destQty)
      : num(destPrice);

  const nameMissing =
    dest === "out" && walletKind === "new" && walletName.trim() === "";
  const destOk =
    dest === "out"
      ? walletKind === "nowhere" ||
        (walletKind === "existing" ? !!wallet : !nameMissing)
      : dest === "existing"
        ? !!existing && (!existingIsQty || existingQty > 0)
        : newHolding !== null &&
          (!newIsQty || (derivedQty > 0 && derivedPrice > 0));
  const valid =
    !!calc &&
    !calc.tooHigh &&
    receivedCents > 0 &&
    destOk &&
    dateOk(date, minDate);

  const destName =
    dest === "existing"
      ? (existing?.name ?? "")
      : dest === "new"
        ? (newHolding?.name ?? "")
        : walletKind === "existing"
          ? (wallet?.name ?? "")
          : walletName.trim();
  const summary =
    !valid || !calc || calc.tooHigh
      ? buildSwapSummary(null)
      : buildSwapSummary({
          tab: "sell",
          name: holding.name,
          v0: valueCents,
          v1: calc.rowValue,
          ccy: srcCcy,
          realized: realized ?? 0,
          realizedCcy: receivedCcy,
          dest:
            dest === "new"
              ? {
                  kind: "new",
                  name: destName,
                  amount: receivedCents,
                  ccy: receivedCcy,
                }
              : dest === "existing"
                ? {
                    kind: "existing",
                    name: destName,
                    d0: Number(existing!.valueCents),
                    d1: Number(existing!.valueCents) + receivedCents,
                    ccy: receivedCcy,
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
      shape === "quantity"
        ? { quantity: qtyString(num(left)) }
        : { valueCents: String(toCents(left)) };
    const walletBody: WalletTarget =
      walletKind === "existing"
        ? { kind: "existing", walletId }
        : walletKind === "new"
          ? {
              kind: "new",
              name: walletName.trim(),
              walletType,
              currency: newWalletCcy,
            }
          : { kind: "nowhere" };
    const destination =
      dest === "out"
        ? ({ kind: "out", wallet: walletBody } as const)
        : dest === "existing"
          ? {
              kind: "existing" as const,
              holdingId: existingId,
              ...(existingIsQty
                ? { quantityBought: qtyString(existingQty) }
                : {}),
            }
          : {
              kind: "new" as const,
              holding: {
                ...newHolding!,
                currentPriceCurrency: receivedCcy,
                ...(newIsQty ? { quantity: qtyString(derivedQty) } : {}),
              },
              ...(newIsQty
                ? { priceCents: String(Math.round(derivedPrice * 100)) }
                : {}),
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
                ? t("swap.err.beforeLatest", { date: minDate ?? "" })
                : w.code === "label_taken"
                  ? t("asset.name.taken")
                  : t("swap.err.saveFailed"),
          );
        },
      },
    );
  }

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
  const walletsByType = WALLET_TYPES.map(
    (wt) => [wt, wallets.filter((w) => w.walletType === wt)] as const,
  ).filter(([, ws]) => ws.length > 0);
  const money = (c: number) => centsToBare(String(Math.round(Math.abs(c))));

  return (
    <>
      <div className="space-y-6">
        {/* 1. How much is left? */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
              {t("swap.sell.left")}
            </h3>
            <Button
              type="button"
              variant="outline"
              aria-pressed={sellAll}
              data-testid="swap-sell-all"
              className="min-h-11"
              style={{ borderColor: sellAll ? "var(--primary)" : undefined }}
              onClick={() => {
                const next = !sellAll;
                setSellAll(next);
                setLeft(next ? "0" : "");
              }}
            >
              {sellAll && <Check className="h-4 w-4" aria-hidden="true" />}
              {t("swap.sell.everything")}
            </Button>
          </div>
          <Field
            label={
              shape === "quantity" ? t("sell.qtyLeft") : t("sell.valueLeft")
            }
          >
            <NumericInput
              testId="swap-sell-left"
              value={left}
              onChange={setLeft}
              readOnly={sellAll}
            />
          </Field>
          <p className={caption} style={{ color: "var(--muted-foreground)" }}>
            {shape === "quantity"
              ? t("sell.qtyHelper", { qty: trimQty(holding.quantity) })
              : t("sell.valueHelper", {
                  value: `${money(valueCents)} ${srcCcy}`,
                })}
          </p>
          {calc?.tooHigh && <ErrorLine>{t("swap.err.leftTooHigh")}</ErrorLine>}
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

          {/* 3. Destination detail */}
          {dest === "new" && (
            <>
              <HoldingFormFields
                budgetId={budgetId}
                budgetCurrency={budgetCurrency}
                receivedCurrency={receivedCcy}
                initialUiType="cash"
                onChange={setNewHolding}
              />
              {newIsQty && (
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  <Field label={t("swap.buy.quantity")}>
                    <NumericInput
                      testId="swap-dest-qty"
                      value={
                        lastEdited === "price" ? plain(derivedQty) : destQty
                      }
                      onChange={(v) => {
                        setLastEdited("qty");
                        setDestQty(v);
                      }}
                    />
                  </Field>
                  <Field label={`${t("swap.buy.price")} (${receivedCcy})`}>
                    <NumericInput
                      testId="swap-dest-price"
                      value={
                        lastEdited === "qty" ? plain(derivedPrice) : destPrice
                      }
                      onChange={(v) => {
                        setLastEdited("price");
                        setDestPrice(v);
                      }}
                    />
                  </Field>
                  <p
                    className={`${caption} col-span-full`}
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {t("swap.sell.linked")}
                  </p>
                </div>
              )}
            </>
          )}
          {dest === "existing" && (
            <>
              <select
                data-testid="swap-sell-existing"
                aria-label={t("swap.sell.dest.existing")}
                value={existingId}
                onChange={(e) => setExistingId(e.target.value)}
                className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                style={selectStyle}
              >
                <option value="" disabled>
                  {t("swap.sell.dest.existingDesc")}
                </option>
                {[...byType].map(([ui, hs]) => (
                  <optgroup key={ui} label={t(`uitype.${ui}`)}>
                    {hs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} · {ccyOf(h, budgetCurrency)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {existingIsQty && (
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  <Field
                    label={`${t("swap.buy.price")} (${receivedCcy}) · ${t("swap.locked")}`}
                  >
                    <NumericInput
                      testId="swap-dest-price"
                      value={plain(existingPrice)}
                      onChange={() => {}}
                      readOnly
                    />
                  </Field>
                  <Field label={t("swap.buy.quantity")}>
                    <NumericInput
                      testId="swap-dest-qty"
                      value={plain(existingQty)}
                      onChange={() => {}}
                      readOnly
                    />
                  </Field>
                </div>
              )}
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
                options={WALLET_KINDS.map((k) => ({
                  k,
                  title: t(`swap.sell.wallet.${k}`),
                }))}
              />
              {walletKind === "existing" && (
                <select
                  data-testid="swap-wallet-select"
                  aria-label={t("swap.sell.wallet.existing")}
                  value={walletId}
                  onChange={(e) => {
                    setWalletId(e.target.value);
                    setReceivedTouched(false);
                  }}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                  style={selectStyle}
                >
                  <option value="" disabled>
                    {t("swap.sell.wallet.existing")}
                  </option>
                  {walletsByType.map(([wt, ws]) => (
                    <optgroup key={wt} label={tw(wt.toLowerCase())}>
                      {ws.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} · {centsToBare(w.currentBalanceCents)}{" "}
                          {w.currency}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
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
                  <Field label={t("field.currency")}>
                    <CurrencyPicker
                      variant="field"
                      value={newWalletCcy}
                      onSelect={(v) => {
                        setNewWalletCcy(v);
                        setReceivedTouched(false);
                      }}
                      aria-label={t("swap.sell.wallet.type")}
                    />
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

        {/* 4. Amount received + currency on ONE line (UAT test 5). */}
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
                  onSelect={(v) => {
                    setChosenCcy(v);
                    setReceivedTouched(false);
                  }}
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

        <SwapDateField value={date} onChange={setDate} min={minDate} />
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
