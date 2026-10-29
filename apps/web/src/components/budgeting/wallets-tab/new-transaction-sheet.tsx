"use client";
/**
 * new-transaction-sheet.tsx — "New transaction" (13.1 UAT 7): Buy / Sell /
 * Transfer. Opens on Buy with the name-first Add form (HoldingSheet, embedded)
 * right under the switch, so the switch never disappears (round-2 gap 6).
 * Sell / Transfer → a type (in-DOM list, round 3) and one of its visible
 * assets → that asset's Sell / Transfer form right under them in this same
 * sheet (round 3: type + asset stay visible). A dirty Add form asks before a
 * switch or close; the embedded tabs' Discard closes the sheet, as in the
 * Swap sheet.
 *
 * Round 4: switching kinds carries the type, the picked asset (when the kind
 * can use it), the main amount and the date; a type with exactly one asset
 * picks it at once (Sell / Transfer only); the type list has Buy's icons.
 */
import { useCallback, useEffect, useState } from "react";
import { UI_TYPE_ICON } from "@/lib/investment-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMinEntryDate } from "@/hooks/use-asset-entries";
import { Field, HoldingSheet } from "./holding-sheet";
import { SwapSellTab } from "./swap-sell-tab";
import { SwapTransferTab } from "./swap-transfer-tab";
import { today } from "./swap-shared";
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
  budgetCurrency,
  holdings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  /** Visible assets — the only ones that can be sold or moved. */
  holdings: HoldingDto[];
}) {
  const t = useTranslations("budget.investments");
  const [kind, setKind] = useState<Kind>("buy");
  const [uiType, setUiType] = useState<UiType | "">("");
  const [name, setName] = useState("");
  const [buyDirty, setBuyDirty] = useState(false);
  const [picked, setPicked] = useState<HoldingDto | null>(null);
  const [date, setDate] = useState(today());
  // The main amount / quantity, carried across kinds (round 4).
  const [draft, setDraft] = useState("");
  // Unconditional (hook rules); idle until an asset is picked.
  const minDate = useMinEntryDate(budgetId, picked?.id ?? "", open && !!picked);
  const unpick = () => setPicked(null);
  // A switch / close asked for while the Add form is dirty waits for Discard.
  const [pending, setPending] = useState<(() => void) | null>(null);
  // A Buy on a picked asset carries over, so only an unpicked, edited Add
  // form has something to lose.
  const guard = (run: () => void) =>
    kind === "buy" && buyDirty && !picked ? setPending(() => run) : run();
  const choose = (k: Kind) => {
    setKind(k);
    setBuyDirty(false);
    // D-11: a deposit cannot be transferred — drop it, keep the type.
    if (k === "transfer" && picked && isDeposit(picked)) {
      unpick();
      setName("");
    }
  };
  // The Add form reports its type + pick, so Buy → Sell carries them.
  const onBuyDraft = useCallback(
    (d: { uiType: UiType | ""; pickedId: string | null }) => {
      setUiType(d.uiType);
      const h = d.pickedId
        ? (holdings.find((x) => x.id === d.pickedId) ?? null)
        : null;
      setPicked(h);
      setName(h?.name ?? "");
    },
    [holdings],
  );

  // D-11: a deposit only sells.
  const pickable = holdings.filter((h) => kind !== "transfer" || !isDeposit(h));
  const typeOf = (h: HoldingDto) =>
    deriveUiType(h.uiType, h.holdingType, h.isCustom);
  const types = UI_TYPE_ORDER.filter((ui) =>
    pickable.some((h) => typeOf(h) === ui),
  );
  const ids = new Set(pickable.map((h) => h.id));

  // Round 4 gap 5: a type with exactly one asset to sell / move picks it.
  const only =
    kind !== "buy" && uiType && !picked
      ? pickable.filter((h) => typeOf(h) === uiType)
      : [];
  const single = only.length === 1 ? only[0]! : null;
  useEffect(() => {
    if (!single) return;
    setPicked(single);
    setName(single.name);
  }, [single]);

  const typeLabel = (ui: UiType) => {
    const Icon = UI_TYPE_ICON[ui];
    return (
      <span className="flex items-center gap-2">
        <Icon
          data-type-icon
          className="h-4 w-4 text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
        <span>{t(`uitype.${ui}`)}</span>
      </span>
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) =>
        next ? onOpenChange(true) : guard(() => onOpenChange(false))
      }
    >
      <SheetContent
        side="right"
        data-testid="new-tx-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The Type list and the discard dialogs portal outside this content;
        // a click on them must not count as "outside" (same as HoldingSheet).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
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
              onClick={() => k !== kind && guard(() => choose(k))}
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

        {kind === "buy" ? (
          <HoldingSheet
            embedded
            open
            budgetId={budgetId}
            budgetCurrency={budgetCurrency}
            onOpenChange={onOpenChange}
            onDirtyChange={setBuyDirty}
            initialUiType={uiType || undefined}
            initialPickedId={picked?.id ?? null}
            date={date}
            setDate={setDate}
            draft={draft}
            setDraft={setDraft}
            onDraftChange={onBuyDraft}
          />
        ) : (
          <div className="space-y-4 px-1">
            <Field label={t("field.type")}>
              {/* Controlled always, so the trigger never shows a type the
                  state has dropped (round-4 gap 3). */}
              <Select
                value={uiType}
                onValueChange={(v) => {
                  setUiType(v as UiType);
                  setName("");
                  unpick();
                }}
              >
                <SelectTrigger
                  data-testid="new-tx-type"
                  aria-label={t("field.type")}
                  className="min-h-11 w-full"
                >
                  <SelectValue placeholder={t("field.typePlaceholder")}>
                    {uiType ? typeLabel(uiType) : null}
                  </SelectValue>
                </SelectTrigger>
                {/* Round 3: a native popup got a sliver; this list flips above
                    a low trigger and gets the screen. */}
                <SelectContent
                  position="popper"
                  className="max-h-[min(60dvh,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]"
                >
                  {types.map((ui) => (
                    <SelectItem
                      key={ui}
                      value={ui}
                      data-testid={`new-tx-type-option-${ui}`}
                    >
                      {typeLabel(ui)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {uiType && (
              <Field label={t("newTx.pickAsset")}>
                <AssetNameCombobox
                  budgetId={budgetId}
                  uiType={uiType}
                  value={name}
                  onChange={(v) => {
                    setName(v);
                    if (picked && v !== picked.name) unpick();
                  }}
                  allowCreate={false}
                  include={(a) => ids.has(a.id)}
                  testId="new-tx-asset"
                  ariaLabel={t("newTx.pickAsset")}
                  onPickExisting={(a) => {
                    const h = pickable.find((x) => x.id === a.id);
                    if (!h) return;
                    setName(h.name);
                    setPicked(h);
                  }}
                />
              </Field>
            )}
            {picked &&
              (() => {
                const props = {
                  budgetId,
                  budgetCurrency,
                  holding: picked,
                  holdings,
                  date,
                  setDate,
                  minDate,
                  onDone: () => onOpenChange(false),
                  draft,
                  setDraft,
                };
                return kind === "sell" ? (
                  <SwapSellTab key={picked.id} {...props} />
                ) : (
                  <SwapTransferTab key={picked.id} {...props} />
                );
              })()}
          </div>
        )}
      </SheetContent>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.discard.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.discard.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pending?.();
                setPending(null);
              }}
            >
              {t("confirm.discard.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
