"use client";
/**
 * swap-sheet.tsx — one action surface per asset (13.1 D-08..D-11, D-31):
 * Buy · Sell · Transfer. Deposits only sell (D-11). The date is shared across
 * tabs and may not go before the asset's latest entry (D-15); everything else
 * resets on a tab switch. Each tab owns its fields and its sum-up footer.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { HoldingDto } from "@/hooks/use-investments";
import { useMinEntryDate } from "@/hooks/use-asset-entries";
import { SwapBuyTab } from "./swap-buy-tab";
import { SwapSellTab } from "./swap-sell-tab";
import { SwapTransferTab } from "./swap-transfer-tab";
import { today } from "./swap-shared";
import { keepSheetOnListEscape } from "./asset-name-combobox";

type Tab = "buy" | "sell" | "transfer";
const TABS: Tab[] = ["buy", "sell", "transfer"];

export function SwapSheet({
  open,
  onOpenChange,
  budgetId,
  budgetCurrency,
  holding,
  holdings,
  initialTab = "buy",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
  holdings: HoldingDto[];
  initialTab?: Tab;
}) {
  const t = useTranslations("budget.investments");
  const isDeposit =
    holding.holdingType === "deposit" || holding.uiType === "deposit";
  const [tab, setTab] = useState<Tab>(isDeposit ? "sell" : initialTab);
  const [date, setDate] = useState(today());
  // Round 4: the main amount/quantity follows the tab switch.
  const [draft, setDraft] = useState("");
  const minDate = useMinEntryDate(budgetId, holding.id, open);

  const props = {
    budgetId,
    budgetCurrency,
    holding,
    holdings,
    date,
    setDate,
    minDate,
    onDone: () => onOpenChange(false),
    draft,
    setDraft,
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      setTab(TABS[(i + 1) % 3]!);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      setTab(TABS[(i + 2) % 3]!);
    else return;
    e.preventDefault();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="swap-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={keepSheetOnListEscape}
      >
        <SheetHeader className="mb-2">
          <SheetTitle
            className="break-words"
            style={{ color: "var(--body-on-dark)" }}
          >
            {isDeposit
              ? t("swap.sellTitle", { name: holding.name })
              : t("swap.title", { name: holding.name })}
          </SheetTitle>
        </SheetHeader>

        {!isDeposit && (
          <div
            role="radiogroup"
            aria-label={t("swap.title", { name: holding.name })}
            onKeyDown={onKey}
            className="mb-4 flex rounded-full p-1"
            style={{ background: "var(--surface-sunken-dark)" }}
          >
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tab === k}
                tabIndex={tab === k ? 0 : -1}
                data-testid={`swap-tab-${k}`}
                onClick={() => setTab(k)}
                className="min-h-11 flex-1 rounded-full px-3 text-[14px]"
                style={{
                  background:
                    tab === k ? "var(--surface-elevated-dark)" : undefined,
                  color:
                    tab === k
                      ? "var(--body-on-dark)"
                      : "var(--muted-foreground)",
                }}
              >
                {t(`swap.tab.${k}`)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-1 flex-col gap-6 px-1">
          {tab === "buy" && <SwapBuyTab key="buy" {...props} />}
          {tab === "sell" && <SwapSellTab key="sell" {...props} />}
          {tab === "transfer" && <SwapTransferTab key="transfer" {...props} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
