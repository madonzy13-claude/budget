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
 * Realized previews the server's single deal rate (13.1 UAT 14): proceeds in
 * the source currency = received ÷ rate(source → received), minus sold cost.
 *
 * Preview mirrors the server booking with display-only Number math:
 *   quantity: sold cost = buy × sold qty
 *   amount:   kept cost = buy × kept ÷ value
 *   deposit:  sold cost = principal − kept (all interest realized)
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  center,
}: {
  value: K | null;
  options: { k: K; title: string; desc?: string }[];
  onChange: (k: K) => void;
  label: string;
  testPrefix: string;
  /** Title-only cards: centre the label (13.1 UAT 9). */
  center?: boolean;
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
          className={[
            "flex min-h-11 w-full flex-col rounded-[var(--radius-md)] border px-4 py-2",
            center
              ? "items-center justify-center text-center"
              : "items-start text-left",
          ].join(" ")}
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

  const [sold, setSold] = useState("");
  const [sellAll, setSellAll] = useState(false);
  const [dest, setDest] = useState<Dest>("new");
  const [newHolding, setNewHolding] = useState<DestinationHolding | null>(null);
  const [destQty, setDestQty] = useState("");
  const [qtyTouched, setQtyTouched] = useState(false);
  const [destPrice, setDestPrice] = useState("");
  const [existingId, setExistingId] = useState("");
  const [walletKind, setWalletKind] = useState<WalletKind>("nowhere");
  const [walletId, setWalletId] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] =
    useState<(typeof WALLET_TYPES)[number]>("SPENDINGS");
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
        : chosenCcy;
  // A new wallet takes the amount's currency (13.1 UAT 9) — only an existing
  // wallet or asset locks it (D-22).
  const ccyLocked =
    dest === "existing" || (dest === "out" && walletKind === "existing");

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
    const keep = sellAll ? 0 : Math.max(0, valueCents - soldCents);
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
  }, [sold, sellAll, shape, held, valueCents, buyCents]);

  // Prefill "Amount received" with today's value of the sold part, converted.
  useEffect(() => {
    if (receivedTouched || !calc || calc.invalid) return;
    setReceived(String(Math.round(calc.soldValue * rate) / 100));
  }, [calc, rate, receivedTouched]);

  // Destination price (D-09): Existing = its own, read-only; New = typed,
  // else the instrument's live price. Nothing ever writes it from qty.
  const existingIsQty = !!existing && holdingShape(existing) === "quantity";
  const newIsQty = !!newHolding && isQtyType(newHolding.uiType);
  const qtyDest =
    (dest === "existing" && existingIsQty) || (dest === "new" && newIsQty);
  const livePrice = newHolding?.livePriceCents
    ? plain(Number(newHolding.livePriceCents) / 100)
    : "";
  const priceText =
    dest === "existing"
      ? existing
        ? plain(Number(existing.currentPriceCents ?? 0) / 100)
        : ""
      : destPrice !== ""
        ? destPrice
        : livePrice;
  const price = num(priceText);
  // Quantity follows sold value ÷ price until the user types it.
  const soldInReceived =
    calc && !calc.invalid ? (calc.soldValue * rate) / 100 : 0;
  const qtyText = qtyTouched
    ? destQty
    : price > 0 && soldInReceived > 0
      ? plain(soldInReceived / price)
      : "";
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
      : dest === "existing"
        ? !!existing && (!existingIsQty || qty > 0)
        : newHolding !== null && (!newIsQty || (qty > 0 && price > 0));
  const valid =
    !!calc &&
    !calc.invalid &&
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
    !valid || !calc || calc.invalid
      ? buildSwapSummary(null)
      : buildSwapSummary({
          tab: "sell",
          name: holding.name,
          v0: valueCents,
          v1: calc.rowValue,
          ccy: srcCcy,
          realized: realized ?? 0,
          realizedCcy: srcCcy,
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
        ? ({ kind: "out", wallet: walletBody } as const)
        : dest === "existing"
          ? {
              kind: "existing" as const,
              holdingId: existingId,
              ...(existingIsQty ? { quantityBought: qtyString(qty) } : {}),
            }
          : (() => {
              const { livePriceCents, ...base } = newHolding!;
              return {
                kind: "new" as const,
                holding: {
                  ...base,
                  currentPriceCurrency: receivedCcy,
                  ...(newIsQty
                    ? {
                        quantity: qtyString(qty),
                        ...(livePriceCents
                          ? { currentPriceCents: livePriceCents }
                          : {}),
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

  /** One quantity + one price; received = quantity × price. */
  const destPair = (locked: boolean) => (
    <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
      <Field label={t("swap.buy.quantity")}>
        <NumericInput
          testId="swap-dest-qty"
          value={qtyText}
          onChange={(v) => {
            setQtyTouched(true);
            setDestQty(v);
          }}
        />
      </Field>
      <Field
        label={`${t("swap.buy.price")} (${receivedCcy})${locked ? ` · ${t("swap.locked")}` : ""}`}
      >
        <NumericInput
          testId="swap-dest-price"
          value={priceText}
          onChange={locked ? () => {} : setDestPrice}
          readOnly={locked}
        />
      </Field>
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        {/* 1. How much was sold? */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={heading} style={{ color: "var(--body-on-dark)" }}>
              {t("swap.sell.sold")}
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
                setSold(
                  next
                    ? shape === "quantity"
                      ? trimQty(holding.quantity)
                      : String(valueCents / 100)
                    : "",
                );
              }}
            >
              {sellAll && <Check className="h-4 w-4" aria-hidden="true" />}
              {t("swap.sell.everything")}
            </Button>
          </div>
          <Field
            label={
              shape === "quantity" ? t("sell.qtySold") : t("sell.valueSold")
            }
          >
            <NumericInput
              testId="swap-sell-sold"
              value={sold}
              onChange={(v) => {
                setSold(v);
                setSellAll(false);
              }}
            />
          </Field>
          <p className={caption} style={{ color: "var(--muted-foreground)" }}>
            {shape === "quantity"
              ? t("sell.qtyHelper", { qty: trimQty(holding.quantity) })
              : t("sell.valueHelper", {
                  value: `${money(valueCents)} ${srcCcy}`,
                })}
          </p>
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
              {newIsQty && destPair(false)}
            </>
          )}
          {dest === "existing" && (
            <>
              <Select
                value={existingId || undefined}
                onValueChange={setExistingId}
              >
                <SelectTrigger
                  data-testid="swap-sell-existing"
                  aria-label={t("swap.sell.dest.existing")}
                  className="min-h-11 w-full"
                >
                  <SelectValue placeholder={t("swap.sell.dest.existingDesc")} />
                </SelectTrigger>
                <SelectContent position="popper" className={LIST}>
                  {[...byType].map(([ui, hs]) => (
                    <SelectGroup key={ui}>
                      <SelectLabel>{t(`uitype.${ui}`)}</SelectLabel>
                      {hs.map((h) => (
                        <SelectItem
                          key={h.id}
                          value={h.id}
                          data-testid={`swap-sell-existing-option-${h.id}`}
                        >
                          {h.name} · {ccyOf(h, budgetCurrency)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {existingIsQty && destPair(true)}
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
