"use client";
/**
 * swap-transfer-tab.tsx — Swap → Transfer (13.1 D-10). Moves quantity (or
 * value) to another asset of the SAME type — for crypto and stocks also the
 * same instrument — or to a new label. Not a sale: no realized gain, no
 * contribution change; cost moves proportionally (server-side).
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
import { Field, NumericInput } from "./holding-sheet";
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
  holdings,
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
  const [to, setTo] = useState<"existing" | "new" | null>(null);
  const [targetId, setTargetId] = useState("");
  const [newName, setNewName] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const targets = holdings.filter(
    (h) =>
      h.id !== holding.id &&
      deriveUiType(h.uiType, h.holdingType, h.isCustom) === ui &&
      (!sameInstrument || h.instrumentId === holding.instrumentId),
  );
  const target = targets.find((h) => h.id === targetId);
  const taken =
    to === "new" &&
    newName.trim() !== "" &&
    names.some((n) => norm(n.name) === norm(newName));

  const m = num(move);
  const cap = byQty ? held : valueCents / 100;
  const badMove = move.trim() !== "" && !(m > 0 && m <= cap);
  const movedValue = byQty
    ? held > 0
      ? (m / held) * valueCents
      : 0
    : toCents(move);
  const targetOk =
    to === "existing"
      ? !!target
      : to === "new" && newName.trim() !== "" && !taken;
  const valid =
    move.trim() !== "" && !badMove && targetOk && dateOk(date, minDate);
  const targetName = to === "existing" ? (target?.name ?? "") : newName.trim();

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
                t0: Number(target!.valueCents),
                t1: Number(target!.valueCents) + movedValue,
                ccy: ccyOf(target!, budgetCurrency),
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
          to:
            to === "existing"
              ? { kind: "existing", holdingId: targetId }
              : { kind: "new", name: newName.trim() },
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

  const radio = (k: "existing" | "new") => (
    <button
      key={k}
      type="button"
      role="radio"
      aria-checked={to === k}
      data-testid={`swap-transfer-to-${k}`}
      onClick={() => setTo(k)}
      className="flex min-h-11 w-full items-center rounded-[var(--radius-md)] border px-4 py-2 text-left text-[14px] font-semibold"
      style={{
        background: "var(--surface-card-dark)",
        color: "var(--body-on-dark)",
        borderColor: to === k ? "var(--primary)" : "var(--hairline-dark)",
      }}
    >
      {t(k === "existing" ? "swap.transfer.existing" : "swap.transfer.new")}
    </button>
  );

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
            onChange={setMove}
            readOnly={all}
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
          <div
            role="radiogroup"
            aria-label={t("swap.transfer.to")}
            className="space-y-2"
          >
            {radio("existing")}
            {radio("new")}
          </div>
          {to === "existing" &&
            (targets.length === 0 ? (
              <p
                className={caption}
                style={{ color: "var(--muted-foreground)" }}
              >
                {t("swap.transfer.none")}
              </p>
            ) : (
              <>
                <select
                  data-testid="swap-transfer-existing"
                  aria-label={t("swap.transfer.existing")}
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                  style={{
                    background: "var(--surface-card-dark)",
                    borderColor: "var(--hairline-dark)",
                    color: "var(--body-on-dark)",
                  }}
                >
                  <option value="" disabled>
                    {t("swap.transfer.existing")}
                  </option>
                  {targets.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {sameInstrument && (
                  <p
                    className={caption}
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {t("swap.transfer.sameInstrument")}
                  </p>
                )}
              </>
            ))}
          {to === "new" && (
            <Field label={t("swap.transfer.newName")}>
              <AssetNameCombobox
                budgetId={budgetId}
                uiType={ui}
                value={newName}
                onChange={setNewName}
                excludeId={holding.id}
                testId="swap-transfer-name"
                invalid={taken}
              />
            </Field>
          )}
          {taken && <ErrorLine>{t("asset.name.taken")}</ErrorLine>}
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
