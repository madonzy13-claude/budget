"use client";
/**
 * swap-transfer-tab.tsx — Swap → Transfer (13.1 D-10). Moves quantity (or
 * value) to another asset of the SAME type — for crypto and stocks also the
 * same instrument — or to a new label. Not a sale: no realized gain, no
 * contribution change; cost moves proportionally (server-side).
 *
 * The target is ONE name field (13.1 UAT 11): a PICKED asset is the target,
 * by id (an archived one is revived, D-17); any typed name — even one that
 * exists — is a new asset (round 5: names are not unique).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import { deriveUiType, holdingShape } from "@/lib/investment-types";
import { isOfflineWriteError } from "@/lib/offline-write";
import { buildSwapSummary } from "@/lib/swap-summary";
import { useAssetNames } from "@/hooks/use-asset-names";
import { useTransferAsset } from "@/hooks/use-transfer-asset";
import { NumericInput } from "./holding-sheet";
import { AssetNameCombobox } from "./asset-name-combobox";
import type { SwapTabProps } from "./swap-buy-tab";
import {
  caption,
  ccyOf,
  dateOk,
  ErrorLine,
  HeldButton,
  heldQty,
  num,
  qtyString,
  SwapDateField,
  useOtherAssetDate,
  SwapFooter,
  toCents,
  trimQty,
} from "./swap-shared";

export function SwapTransferTab({
  budgetId,
  budgetCurrency,
  holding,
  date,
  setDate,
  minDate,
  onDone,
  draft = "",
  setDraft,
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

  const [move, setMoveState] = useState(draft);
  const setMove = (v: string) => {
    setMoveState(v);
    setDraft?.(v);
  };
  const [label, setLabelState] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const setLabel = (v: string) => {
    setLabelState(v);
    setTargetId(null);
  };
  const [serverError, setServerError] = useState<string | null>(null);

  const target =
    label.trim() === ""
      ? null
      : (names.find((n) => n.id === targetId && n.id !== holding.id) ?? null);
  const to = label.trim() === "" ? null : target ? "existing" : "new";
  const wrongInstrument =
    !!target && sameInstrument && target.instrumentId !== holding.instrumentId;

  const m = num(move);
  const cap = byQty ? held : valueCents / 100;
  const badMove = move.trim() !== "" && !(m > 0 && m <= cap);
  // R5-4: above holdings says so; "greater than 0" only for ≤ 0.
  const overHeld = badMove && m > cap;
  const heldLabel = byQty
    ? heldQty(t, holding)
    : `${centsToBare(String(valueCents))} ${ccy}`;
  const movedValue = byQty
    ? held > 0
      ? (m / held) * valueCents
      : 0
    : toCents(move);
  const targetOk = to !== null && !wrongInstrument;
  const targetDate = useOtherAssetDate(budgetId, minDate, target, date);
  const valid =
    move.trim() !== "" && !badMove && targetOk && dateOk(date, targetDate.min);
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
          setServerError(
            (e as { code?: string }).code === "before_latest_entry"
              ? targetDate.beforeMsg
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
          <span className="block text-caption text-[var(--muted-foreground)]">
            {t(byQty ? "swap.transfer.moveQty" : "swap.transfer.moveAmount")}
          </span>
          <NumericInput
            testId="swap-transfer-qty"
            value={move}
            onChange={setMove}
          />
          {/* Round 3: tap what you hold to move it all (no toggle). */}
          <HeldButton
            testId="swap-transfer-held"
            onClick={() =>
              setMove(
                byQty ? trimQty(holding.quantity) : String(valueCents / 100),
              )
            }
          >
            {t("sell.qtyHelper", { qty: heldLabel })}
          </HeldButton>
          {badMove && (
            <ErrorLine>
              {overHeld
                ? t("swap.err.overHeld", { held: heldLabel })
                : t("swap.err.positive")}
            </ErrorLine>
          )}
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
            selectedId={targetId}
            onPickExisting={(a) => setTargetId(a.id)}
            testId="swap-transfer-name"
            ariaLabel={t("swap.transfer.to")}
            invalid={wrongInstrument}
          />
          {wrongInstrument && (
            <ErrorLine>{t("swap.transfer.sameInstrument")}</ErrorLine>
          )}
        </section>

        <SwapDateField
          value={date}
          onChange={setDate}
          min={targetDate.min}
          error={targetDate.error}
        />
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
