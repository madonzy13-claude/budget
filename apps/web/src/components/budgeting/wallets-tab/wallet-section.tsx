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
  onUpdate: (
    id: string,
    patch: { name?: string; amount?: string; currency?: string },
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
  onUpdate,
  onArchive,
  onAdd,
  onCommitDraft,
  onDiscardDraft,
}: WalletSectionProps) {
  const t = useTranslations("bdp.tab.wallets");
  const { setNodeRef, isOver } = useDroppable({ id: `section-${type}` });
  const sectionKey = SECTION_KEY_MAP[type];

  return (
    <section
      ref={setNodeRef}
      data-testid={`wallet-section-${type}`}
      className={[
        "flex flex-col gap-2 rounded-[var(--radius-lg)] p-2",
        isOver
          ? "bg-[var(--surface-elevated-dark)]/60 ring-2 ring-dashed ring-[var(--info-ring)]"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h3 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        {t(`section.${sectionKey}`)}
      </h3>

      {wallets.map((w) => (
        <WalletRow
          key={w.id}
          mode="persisted"
          wallet={w}
          budgetCurrency={budgetCurrency}
          onUpdate={(patch) => onUpdate(w.id, patch)}
          onArchive={() => onArchive(w.id)}
          isReserveSection={type === "RESERVE"}
        />
      ))}

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
