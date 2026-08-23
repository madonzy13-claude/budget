"use client";
/**
 * wallet-section.tsx — One section (Spendings / Cushion / Reserve).
 *
 * Droppable wrapper via @dnd-kit/core useDroppable.
 * Renders ordered persisted rows + optional draft row + DashedAddButton.
 * The draft row is owned by the parent WalletsSectionedList via the `draft` prop.
 *
 * D-PH5-W5: Drag-over tint applied via isOver from useDroppable.
 * D-PH5-W9: Draft row renders ABOVE the DashedAddButton when active.
 */
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useLocale, useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { WalletRow } from "./wallet-row";
import { centsToBare } from "@/lib/cents-format";
import type { WalletDto } from "@/hooks/use-wallets";

type WalletType = WalletDto["walletType"];

export interface DraftState {
  pending: boolean;
  error: string | null;
}

interface WalletSectionProps {
  type: WalletType;
  wallets: WalletDto[];
  budgetCurrency: string;
  /** null when no draft is active for this section */
  draft: DraftState | null;
  // UAT-PH5-T3-22: true when a drag is in progress and the pointer is over
  // anywhere in this section (background, an internal row, or the +Add CTA).
  isDropEligible?: boolean;
  /** Amount-column width shared by EVERY section on the tab, so the currency
   *  codes and figures line up down the whole page and not merely inside one
   *  section (user, 260823). Falls back to this section's own longest amount. */
  amountChars?: number;
  /** Every asset on the tab, in budget currency — the denominator for the
   *  header's share. Share BETWEEN sections, not within one (user, 260823). */
  assetsTotalBudgetCents?: number;
  onUpdate: (
    id: string,
    patch: {
      name?: string;
      amount?: string;
      currency?: string;
      // UAT-PH5-T3-1x: presentation customization (null clears).
      color?: string | null;
      icon?: string | null;
    },
  ) => Promise<void>;
  onArchive: (id: string) => void;
  onAdd: () => void;
  onCommitDraft: (
    name: string,
    currency: string,
    amount: string,
  ) => Promise<void>;
  onDiscardDraft: () => void;
}

const SECTION_KEY_MAP = {
  SPENDINGS: "spendings",
  CUSHION: "cushion",
  RESERVE: "reserve",
  // 260803: possessions became a wallet type, and OTHER holds assets that
  // belong to nothing in particular.
  POSSESSION: "possession",
  OTHER: "other",
} as const satisfies Record<WalletType, string>;

export function WalletSection({
  type,
  wallets,
  budgetCurrency,
  draft,
  isDropEligible,
  amountChars,
  assetsTotalBudgetCents,
  onUpdate,
  onArchive,
  onAdd,
  onCommitDraft,
  onDiscardDraft,
}: WalletSectionProps) {
  const t = useTranslations("bdp.tab.wallets");
  const locale = useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: `section-${type}` });
  const sectionKey = SECTION_KEY_MAP[type];
  // UAT-PH5-T3-22: highlight the section when the pointer is over either
  // the section background OR any row inside it (parent passes the latter
  // as `isDropEligible`). Without this the highlight only kicked in over
  // the +Add CTA area, which is jarring during the drop hover.
  const highlight = isOver || !!isDropEligible;

  // UAT-PH5-T3-46: single denominator in budget currency. The server enriches
  // each wallet with `currentBalanceInBudgetCurrencyCents` (Frankfurter FX,
  // daily cache), so a section holding four currencies still sums to one
  // figure. Falls back to `currentBalanceCents` for callers that bypass the
  // route layer (legacy tests, fixtures). Hoisted out of the row loop because
  // the HEADER reports this total too now (user, 260822) — it was already
  // being computed here to drive each row's Share column.
  const inBudgetCcyCents = (w: WalletDto) =>
    Number(w.currentBalanceInBudgetCurrencyCents ?? w.currentBalanceCents);
  const sectionTotalBudgetCents = wallets.reduce(
    (acc, w) => acc + inBudgetCcyCents(w),
    0,
  );
  // UAT-PH5-T3-30: dynamic amount-column width. Size every amount cell to the
  // longest formatted amount in the section, so short values like "0" leave no
  // gap between the currency code and the right-aligned number.
  //
  // The section TOTAL is measured alongside the wallets: it is usually the
  // longest string of the lot (a cushion total in złoty against wallets in
  // dollars), and if the column were sized without it the header's number would
  // widen past the rows' and the two would stop lining up — which is the whole
  // point of putting it on this column (user, 260822).
  const maxAmountChars =
    amountChars ??
    Math.max(
      4,
      centsToBare(String(sectionTotalBudgetCents)).length,
      ...wallets.map((w) => centsToBare(w.currentBalanceCents).length),
    );
  // Share of EVERY asset on the tab, not of this section — a section's share of
  // itself is always 100% and says nothing (user, 260823). Desktop only, in the
  // column the rows already keep for their own within-section share.
  const sectionSharePct =
    assetsTotalBudgetCents && assetsTotalBudgetCents > 0
      ? Math.round((sectionTotalBudgetCents / assetsTotalBudgetCents) * 100)
      : null;

  return (
    <section
      ref={setNodeRef}
      data-testid={`wallet-section-${type}`}
      className={[
        "flex flex-col gap-2 rounded-[var(--radius-lg)] p-2",
        highlight
          ? "bg-[var(--surface-elevated-dark)]/60 ring-2 ring-dashed ring-[var(--info-ring)]"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* The header carries the section's total, on the SAME columns the rows
          use — currency under currency, amount under amount (user, 260822).
          That means matching WalletRow's `gap-2` and `px-3` and every trailing
          cell width exactly; miss one and the two numbers sit a few pixels
          apart, which reads worse than not aligning at all.
          `tracking-normal` on the figures: the header's `tracking-wider` is for
          the uppercase label and looks wrong stretched across digits. */}
      <h3 className="flex items-center gap-2 px-3 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        <span className="min-w-0 flex-1 truncate">
          {t(`section.${sectionKey}`)}
        </span>
        {/* Always LEFT, in every section — the headers are read as a column of
            their own down the page, so they have to agree with each other first.
            Reserve rows are the exception that proves it: they have no currency
            picker and right-align their code tight to the amount, and following
            that put Reserve's EUR 200px off every other section's (user,
            260823). Its own row now sits right of its header; the tab-wide
            column is worth more than that one pairing. */}
        <span
          data-testid={`section-total-currency-${type}`}
          // Left in both, with a 13px inset from md up.
          //
          // From md the row's picker is a bordered SelectTrigger
          // ("PLN  Polish Zloty  zł") whose code starts 1px border + px-3 into
          // the cell, so the header needs the same inset to put three letters
          // under three letters. Below md a TOUCH device renders the picker as
          // a bare `<select>` with `p-0 border-0` — plain left-aligned text —
          // so the header sits flush and they line up exactly.
          //
          // Careful when verifying this: a non-touch browser at 390px renders
          // the bordered trigger instead, so a desktop-Chrome screenshot at a
          // phone width shows a control no phone ever displays. Centring the
          // header on that box looked right in Playwright and was plainly
          // wrong on the device (user, 260823). Emulate touch.
          className="w-[44px] shrink-0 text-left text-num-sm tracking-normal sm:w-[96px] md:w-[224px] md:pl-[13px]"
        >
          {budgetCurrency}
        </span>
        <span
          data-testid={`section-total-${type}`}
          className="shrink-0 text-right text-num-md tabular-nums tracking-normal"
          style={{ minWidth: `${maxAmountChars + 1}ch` }}
        >
          {centsToBare(
            String(Math.round(sectionTotalBudgetCents / 100) * 100),
            locale,
          )}
        </span>
        {/* The rows keep a share column on sm+; the header fills it with this
            section's share of ALL assets. Reserving it is also what keeps the
            columns to its left lined up with the rows. */}
        <span
          data-testid={`section-share-${type}`}
          className="hidden w-[64px] shrink-0 text-right text-num-sm tabular-nums tracking-normal sm:block sm:w-[80px]"
        >
          {sectionSharePct === null ? "" : `${sectionSharePct}%`}
        </span>
        <span className="hidden w-7 shrink-0 sm:block" aria-hidden="true" />
      </h3>

      {/* UAT-PH5-T3-14: section total drives the Share column on each row.
          Sum is taken across raw cents — mixed-currency sections still
          compute a share ratio (the user explicitly asked for "share within
          wallet group" with no qualifier). When the total is 0 every row
          renders an em-dash share.

          UAT-PH5-T3-17: wrap rows in a SortableContext per section so
          siblings animate out of the way while a wallet is dragged inside
          its own section. Cross-section moves still drop on the section
          background (useDroppable id="section-<TYPE>") wired below. */}
      <>
        <SortableContext
          items={wallets.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          {wallets.map((w) => (
            <WalletRow
              key={w.id}
              mode="persisted"
              wallet={w}
              budgetCurrency={budgetCurrency}
              sectionTotalBudgetCents={sectionTotalBudgetCents}
              maxAmountChars={maxAmountChars}
              onUpdate={(patch) => onUpdate(w.id, patch)}
              onArchive={() => onArchive(w.id)}
              isReserveSection={type === "RESERVE"}
            />
          ))}
        </SortableContext>
        {draft && (
          <WalletRow
            key="__draft__"
            mode="draft"
            sectionType={type}
            budgetCurrency={budgetCurrency}
            maxAmountChars={maxAmountChars}
            pending={draft.pending}
            error={draft.error}
            onCommit={onCommitDraft}
            onDiscard={onDiscardDraft}
          />
        )}
      </>

      <DashedAddButton
        onClick={onAdd}
        label={t(`add.${sectionKey}`)}
        testId={`add-wallet-${sectionKey}`}
        navKey={`add-wallet-${sectionKey}`}
      />
    </section>
  );
}
