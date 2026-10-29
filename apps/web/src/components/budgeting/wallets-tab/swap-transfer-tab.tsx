"use client";
/**
 * swap-transfer-tab.tsx — Swap → Transfer (13.1 D-10). Moves quantity (or
 * value) to another asset of the SAME type — for crypto and stocks also the
 * same instrument — or to a new label. Not a sale: no realized gain, no
 * contribution change; cost moves proportionally (server-side).
 *
 * The target is ONE name field (13.1 UAT 11): a name equal (trimmed, case-
 * insensitive) to an asset of the type is that asset — hidden ones too, which
 * the transfer revives (D-07, D-17); any other name is a new label.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToBare } from "@/lib/cents-format";
import { deriveUiType, holdingShape } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import type { AssetWriteError } from "@/lib/investment-invalidate";
import { buildSwapSummary } from "@/lib/swap-summary";
import { useAssetNames } from "@/hooks/use-asset-names";
import { useTransferAsset } from "@/hooks/use-transfer-asset";
import { NumericInput } from "./holding-sheet";
import { AssetNameCombobox } from "./asset-name-combobox";
import type { SwapTabProps } from "./swap-buy-tab";
import {
  ErrorLine,
  SwapDateField,
  SwapFooter,
  caption,
  ccyOf,
  dateOk,
  num,
  qtyString,
  toCents,
  trimQty,
} from "./swap-shared";

const norm = (s: string) => s.trim().toLowerCase();

export function SwapTransferTab({
  budgetId,
  budgetCurrency,
  holding,
  date,
  setDate,
  minDate,
  onDone,
}: SwapTabProps) {
  const t = useTranslations("budget.investments");
  const transferMut = useTransferAsset(budgetId);
  const ui = deriveUiType(
    holding.uiType,
    holding.holdingType,
    holding.isCustom,
  );
  const byQty = holdingShape(holding) === "quantity";
  const sameInstrument = ui === "crypto" || ui === "stocks";
  const held = num(holding.quantity);
  const valueCents = Number(holding.valueCents);
  const ccy = ccyOf(holding, budgetCurrency);
  const names = useAssetNames(budgetId, ui).data ?? [];

  const [move, setMove] = useState("");
  const [all, setAll] = useState(false);
  const [label, setLabel] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const target =
    label.trim() === ""
      ? null
      : (names.find(
          (n) => n.id !== holding.id && norm(n.name) === norm(label),
        ) ?? null);
  const to = label.trim() === "" ? null : target ? "existing" : "new";
  const wrongInstrument =
    !!target && sameInstrument && target.instrumentId !== holding.instrumentId;

  const m = num(move);
  const cap = byQty ? held : valueCents / 100;
  const badMove = move.trim() !== "" && !(m > 0 && m <= cap);
  const movedValue = byQty
    ? held > 0
      ? (m / held) * valueCents
      : 0
    : toCents(move);
  const targetOk = to !== null && !wrongInstrument;
  const valid =
    move.trim() !== "" && !badMove && targetOk && dateOk(date, minDate);
  const targetName = target ? target.name : label.trim();

  const summary = !valid
    ? buildSwapSummary(null)
    : buildSwapSummary({
        tab: "transfer",
        name: holding.name,
        v0: valueCents,
        v1: valueCents - movedValue,
        ccy,
        dest:
          to === "existing"
            ? {
                kind: "existing",
                name: targetName,
                t0: Number(target!.valueCents ?? 0),
                t1: Number(target!.valueCents ?? 0) + movedValue,
                ccy: target!.valueCurrency ?? ccy,
              }
            : { kind: "new", name: targetName, amount: movedValue, ccy },
      });

  function submit() {
    if (!valid) return;
    setServerError(null);
    transferMut.mutate(
      {
        holdingId: holding.id,
        body: {
          effectiveDate: date,
          move: byQty
            ? { quantity: qtyString(m) }
            : { valueCents: String(toCents(move)) },
          to: target
            ? { kind: "existing", holdingId: target.id }
            : { kind: "new", name: label.trim() },
        },
      },
      {
        onSuccess: () => {
          toast.success(t("swap.cta.transfer", { target: targetName }));
          onDone();
        },
        onError: (e) => {
          if (isOfflineWriteError(e)) return;
          const code = (e as AssetWriteError).code;
          setServerError(
            code === "label_taken"
              ? t("asset.name.taken")
              : t("swap.err.saveFailed"),
          );
        },
      },
    );
  }

  return (
    <>
      <div className="space-y-4">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-[var(--muted-foreground)]">
              {t(byQty ? "swap.transfer.moveQty" : "swap.transfer.moveAmount")}
            </span>
            <Button
              type="button"
              variant="outline"
              aria-pressed={all}
              data-testid="swap-transfer-all"
              className="min-h-11"
              style={{ borderColor: all ? "var(--primary)" : undefined }}
              onClick={() => {
                const next = !all;
                setAll(next);
                setMove(
                  next
                    ? byQty
                      ? trimQty(holding.quantity)
                      : String(valueCents / 100)
                    : "",
                );
              }}
            >
              {t("swap.transfer.everything")}
            </Button>
          </div>
          <NumericInput
            testId="swap-transfer-qty"
            value={move}
            onChange={(v) => {
              setMove(v);
              setAll(false);
            }}
          />
          <p className={caption} style={{ color: "var(--muted-foreground)" }}>
            {t("sell.qtyHelper", {
              qty: byQty
                ? trimQty(holding.quantity)
                : `${centsToBare(String(valueCents))} ${ccy}`,
            })}
          </p>
          {badMove && <ErrorLine>{t("swap.err.positive")}</ErrorLine>}
        </section>

        <section className="space-y-2">
          <span className="text-caption text-[var(--muted-foreground)]">
            {t("swap.transfer.to")}
          </span>
          <AssetNameCombobox
            budgetId={budgetId}
            uiType={ui}
            value={label}
            onChange={setLabel}
            excludeId={holding.id}
            testId="swap-transfer-name"
            ariaLabel={t("swap.transfer.to")}
            invalid={wrongInstrument}
          />
          {wrongInstrument && (
            <ErrorLine>{t("swap.transfer.sameInstrument")}</ErrorLine>
          )}
        </section>

        <SwapDateField value={date} onChange={setDate} min={minDate} />
        <p
          className={`${caption} flex items-start gap-1`}
          style={{ color: "var(--muted-foreground)" }}
        >
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {t("swap.transfer.note")}
        </p>
        {serverError && <ErrorLine>{serverError}</ErrorLine>}
      </div>
      <SwapFooter
        summary={summary}
        label={
          targetName
            ? t("swap.cta.transfer", { target: targetName })
            : t("swap.cta.transferNoTarget")
        }
        disabled={!valid}
        pending={transferMut.isPending}
        onSubmit={submit}
        onDiscard={onDone}
      />
    </>
  );
}
