"use client";
/**
 * new-transaction-sheet.tsx — "New transaction" (13.1 UAT 7): pick Buy / Sell
 * / Transfer first. Only a chooser — it hands off to the forms that exist:
 * Buy → the name-first Add form (HoldingSheet), Sell / Transfer → a type and
 * one of its visible assets → that asset's Swap sheet on the chosen tab.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deriveUiType,
  UI_TYPE_ORDER,
  type UiType,
} from "@/lib/investment-types";
import type { HoldingDto } from "@/hooks/use-investments";
import { Field } from "./holding-sheet";
import {
  AssetNameCombobox,
  keepSheetOnListEscape,
} from "./asset-name-combobox";

type Kind = "buy" | "sell" | "transfer";
const KINDS: Kind[] = ["buy", "sell", "transfer"];
const isDeposit = (h: HoldingDto) =>
  h.holdingType === "deposit" || h.uiType === "deposit";

export function NewTransactionSheet({
  open,
  onOpenChange,
  budgetId,
  holdings,
  onBuy,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  /** Visible assets — the only ones that can be sold or moved. */
  holdings: HoldingDto[];
  onBuy: () => void;
  onPick: (h: HoldingDto, tab: "sell" | "transfer") => void;
}) {
  const t = useTranslations("budget.investments");
  const [kind, setKind] = useState<Exclude<Kind, "buy"> | null>(null);
  const [uiType, setUiType] = useState<UiType | "">("");
  const [name, setName] = useState("");

  // D-11: a deposit only sells.
  const pickable = holdings.filter((h) => kind !== "transfer" || !isDeposit(h));
  const typeOf = (h: HoldingDto) =>
    deriveUiType(h.uiType, h.holdingType, h.isCustom);
  const types = UI_TYPE_ORDER.filter((ui) =>
    pickable.some((h) => typeOf(h) === ui),
  );
  const ids = new Set(pickable.map((h) => h.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="new-tx-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={keepSheetOnListEscape}
      >
        <SheetHeader className="mb-2">
          <SheetTitle style={{ color: "var(--body-on-dark)" }}>
            {t("newTx.title")}
          </SheetTitle>
        </SheetHeader>

        <div
          role="radiogroup"
          aria-label={t("newTx.title")}
          className="mb-4 flex rounded-full p-1"
          style={{ background: "var(--surface-sunken-dark)" }}
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              data-testid={`new-tx-kind-${k}`}
              onClick={() => {
                if (k === "buy") return onBuy();
                setKind(k);
                setUiType("");
                setName("");
              }}
              className="min-h-11 flex-1 rounded-full px-3 text-[14px]"
              style={{
                background:
                  kind === k ? "var(--surface-elevated-dark)" : undefined,
                color:
                  kind === k
                    ? "var(--body-on-dark)"
                    : "var(--muted-foreground)",
              }}
            >
              {t(`swap.tab.${k}`)}
            </button>
          ))}
        </div>

        {kind && (
          <div className="space-y-4 px-1">
            <Field label={t("field.type")}>
              <select
                data-testid="new-tx-type"
                aria-label={t("field.type")}
                value={uiType}
                onChange={(e) => {
                  setUiType(e.target.value as UiType);
                  setName("");
                }}
                className="min-h-11 w-full rounded-[var(--radius-md)] border px-3 text-[14px]"
                style={{
                  background: "var(--surface-card-dark)",
                  borderColor: "var(--hairline-dark)",
                  color: "var(--body-on-dark)",
                }}
              >
                <option value="" disabled>
                  {t("field.typePlaceholder")}
                </option>
                {types.map((ui) => (
                  <option key={ui} value={ui}>
                    {t(`uitype.${ui}`)}
                  </option>
                ))}
              </select>
            </Field>
            {uiType && (
              <Field label={t("newTx.pickAsset")}>
                <AssetNameCombobox
                  budgetId={budgetId}
                  uiType={uiType}
                  value={name}
                  onChange={setName}
                  allowCreate={false}
                  include={(a) => ids.has(a.id)}
                  testId="new-tx-asset"
                  ariaLabel={t("newTx.pickAsset")}
                  onPickExisting={(a) => {
                    const h = pickable.find((x) => x.id === a.id);
                    if (h) onPick(h, kind);
                  }}
                />
              </Field>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
