"use client";
/**
 * swap-buy-source.tsx — Buy: where did the money come from? (13.1 round 6,
 * user). "Out of investments" is a plain Buy; "From another asset" sells part
 * of a held asset into the one bought (the Sell endpoint books it). Shared by
 * Swap → Buy on an asset and New transaction → Buy (Add form).
 *
 * A counted source asks how many units leave it; an amount source asks
 * nothing — what arrived (recvCents in recvCcy) left it, converted at the
 * sale date's rate.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import { clientApiFetch } from "@/lib/budget-fetch";
import { centsToBare } from "@/lib/cents-format";
import { UI_TYPE_COLOR, UI_TYPE_ICON } from "@/lib/investment-icons";
import {
  UI_TYPE_ORDER,
  deriveUiType,
  holdingShape,
} from "@/lib/investment-types";
import type { HoldingDto } from "@/hooks/use-investments";
import { Field, NumericInput } from "./holding-sheet";
import {
  ErrorLine,
  HeldButton,
  RadioCards,
  caption,
  ccyOf,
  heading,
  heldQty,
  num,
  qtyString,
  trimQty,
} from "./swap-shared";

export type SourceLeft = { quantity: string } | { valueCents: string };

export function useBuySource({
  holdings,
  excludeId,
  budgetCurrency,
  date,
  recvCents,
  recvCcy,
}: {
  holdings: HoldingDto[];
  excludeId?: string;
  budgetCurrency: string;
  date: string;
  /** What arrives in the bought asset, in recvCcy (0 while unknown). */
  recvCents: number;
  recvCcy: string;
}) {
  const t = useTranslations("budget.investments");
  // R6 (user): where the money came from — outside (today's Buy) or another
  // asset (sold into this one, booked by the Sell endpoint).
  const [from, setFrom] = useState<"out" | "asset">("out");
  const [srcId, setSrcId] = useState("");
  const [taken, setTaken] = useState("");
  const sources = holdings.filter(
    (h) => h.id !== excludeId && Number(h.valueCents) > 0,
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
  const [srcRate, setSrcRate] = useState<{ key: string; rate: string | null }>({
    key: "",
    rate: null,
  });
  const rateKey = `${recvCcy}>${srcCcy}@${date}`;
  const needRate = !!src && !srcQty && recvCcy !== srcCcy;
  useEffect(() => {
    if (!needRate) return;
    let live = true;
    void clientApiFetch(`/fx/rate?from=${recvCcy}&to=${srcCcy}&date=${date}`)
      .then(async (r) =>
        r.ok ? (((await r.json()) as { rate?: string }).rate ?? null) : null,
      )
      .catch(() => null)
      .then((rate) => live && setSrcRate({ key: rateKey, rate }));
    return () => {
      live = false;
    };
  }, [needRate, recvCcy, srcCcy, date, rateKey]);
  const rateToSrc = !needRate
    ? 1
    : srcRate.key === rateKey && srcRate.rate
      ? Number(srcRate.rate)
      : null;
  const rateFailed = needRate && srcRate.key === rateKey && !srcRate.rate;
  const srcValue = src ? Math.round(Number(src.valueCents)) : 0;
  const takenCents =
    rateToSrc === null ? null : Math.round(recvCents * rateToSrc);
  /** What stays in the source — null while invalid (same math as Sell). */
  const left = (() => {
    if (!src) return null;
    if (srcQty) {
      if (!(num(taken) > 0)) return null;
      const e8 =
        Math.round(num(src.quantity) * 1e8) - Math.round(num(taken) * 1e8);
      return e8 < 0 ? null : ({ quantity: qtyString(e8 / 1e8) } as const);
    }
    if (takenCents === null || takenCents <= 0 || takenCents > srcValue)
      return null;
    return { valueCents: String(srcValue - takenCents) } as const;
  })();
  const overTaken =
    !!src &&
    (srcQty
      ? num(taken) > 0 && !left
      : takenCents !== null && takenCents > srcValue);

  const money = (c: number) => centsToBare(String(Math.round(Math.abs(c))));

  /** A source asset: name left; value · currency right, and the held
   *  quantity for counted assets (under it in the list, beside it in the
   *  field so the field stays one line). */
  const srcRow = (h: HoldingDto, inline: boolean) => (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      <span data-src-name className="min-w-0 truncate">
        {h.name}
      </span>
      <span
        className={`flex shrink-0 tabular-nums ${inline ? "items-baseline gap-2" : "flex-col items-end leading-tight"}`}
      >
        {inline && holdingShape(h) === "quantity" && (
          <span
            data-src-qty
            className="text-[11px]"
            style={{ color: "var(--muted-foreground)", opacity: 0.7 }}
          >
            {heldQty(t, h)}
          </span>
        )}
        <span data-src-value>
          {`${money(Number(h.valueCents))} ${ccyOf(h, budgetCurrency)}`}
        </span>
        {!inline && holdingShape(h) === "quantity" && (
          <span
            data-src-qty
            className="text-[11px]"
            style={{ color: "var(--muted-foreground)", opacity: 0.7 }}
          >
            {heldQty(t, h)}
          </span>
        )}
      </span>
    </span>
  );

  const fromAsset = from === "asset";
  const node = (
    <>
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
                // The trigger's span is line-clamped; WebKit line-clamp
                // breaks a nested flex, so force it flex (see memory).
                className="min-h-11 w-full gap-2 [&>span]:!flex [&>span]:!min-w-0 [&>span]:flex-1"
              >
                <SelectValue placeholder={t("swap.buy.srcPlaceholder")}>
                  {src ? srcRow(src, true) : null}
                </SelectValue>
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
                          // The item text wrapper stretches so the value
                          // sits on the right edge.
                          className="py-1 pl-8 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
                        >
                          {srcRow(h, false)}
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
              {srcQty ? (
                <>
                  <Field label={t("sell.qtySold")}>
                    <NumericInput
                      testId="swap-buy-taken"
                      value={taken}
                      onChange={setTaken}
                    />
                  </Field>
                  <HeldButton
                    testId="swap-buy-src-held"
                    onClick={() => setTaken(trimQty(src.quantity))}
                  >
                    {t("sell.qtyHelper", { qty: heldQty(t, src) })}
                  </HeldButton>
                </>
              ) : (
                takenCents !== null &&
                takenCents > 0 && (
                  <p
                    data-testid="swap-buy-takes"
                    className={caption}
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {t("swap.buy.takes", {
                      amount: `${money(takenCents)} ${srcCcy}`,
                      name: src.name,
                    })}
                  </p>
                )
              )}
              {rateFailed && (
                <ErrorLine>
                  {t("swap.err.fx", { currency: srcCcy, date })}
                </ErrorLine>
              )}
              {overTaken && <ErrorLine>{t("swap.err.overHeld")}</ErrorLine>}
            </>
          )}
        </>
      )}
    </>
  );
  return { fromAsset, src, left: left as SourceLeft | null, node };
}
