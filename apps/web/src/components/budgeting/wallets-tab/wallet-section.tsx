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
import { useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { WalletRow } from "./wallet-row";
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
  onCommitDraft: (name: string) => Promise<void>;
  onDiscardDraft: () => void;
}

const SECTION_KEY_MAP = {
  SPENDINGS: "spendings",
  CUSHION: "cushion",
  RESERVE: "reserve",
} as const satisfies Record<WalletType, "spendings" | "cushion" | "reserve">;

export function WalletSection({
  type,
  wallets,
  budgetCurrency,
  draft,
  isDropEligible,
  onUpdate,
  onArchive,
  onAdd,
  onCommitDraft,
  onDiscardDraft,
}: WalletSectionProps) {
  const t = useTranslations("bdp.tab.wallets");
  const { setNodeRef, isOver } = useDroppable({ id: `section-${type}` });
  const sectionKey = SECTION_KEY_MAP[type];
  // UAT-PH5-T3-22: highlight the section when the pointer is over either
  // the section background OR any row inside it (parent passes the latter
  // as `isDropEligible`). Without this the highlight only kicked in over
  // the +Add CTA area, which is jarring during the drop hover.
  const highlight = isOver || !!isDropEligible;

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
      <h3 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        {t(`section.${sectionKey}`)}
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
      {(() => {
        const sectionTotalCents = wallets.reduce(
          (acc, w) => acc + Number(w.currentBalanceCents),
          0,
        );
        return (
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
                sectionTotalCents={sectionTotalCents}
                onUpdate={(patch) => onUpdate(w.id, patch)}
                onArchive={() => onArchive(w.id)}
                isReserveSection={type === "RESERVE"}
              />
            ))}
          </SortableContext>
        );
      })()}

      {draft && (
        <WalletRow
          key="__draft__"
          mode="draft"
          sectionType={type}
          budgetCurrency={budgetCurrency}
          pending={draft.pending}
          error={draft.error}
          onCommit={onCommitDraft}
          onDiscard={onDiscardDraft}
        />
      )}

      <DashedAddButton
        onClick={onAdd}
        label={t(`add.${sectionKey}`)}
        testId={`add-wallet-${sectionKey}`}
      />
    </section>
  );
}
