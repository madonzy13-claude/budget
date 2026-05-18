"use client";
/**
 * wallets-sectioned-list.tsx — Client island for the Wallets tab.
 *
 * Owns the DndContext wrapping all three sections + per-section draft state.
 * Hosts useWallets + useUpdateWallet + useCreateWallet + useArchiveWallet.
 *
 * W-4 acceptance (D-PH5-W9 staged-optimistic):
 *   - Clicking +Add only modifies local state (adds draft to section).
 *   - POST fires only inside handleCommitDraft on non-empty Name blur.
 *   - There is NO codepath where +Add click triggers a POST.
 *
 * D-PH5-E1: cross-invalidation of ['budget', id, 'reserves'] handled inside
 *   useUpdateWallet and useCreateWallet (RESERVE-touching mutations only).
 *
 * D-PH5-W8: Drag-end → PATCH walletType; onError rollback + toast.
 */
import {
  DndContext,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useWallets, type WalletDto } from "@/hooks/use-wallets";
import { useUpdateWallet } from "@/hooks/use-update-wallet";
import { useCreateWallet } from "@/hooks/use-create-wallet";
import { useArchiveWallet } from "@/hooks/use-archive-wallet";
import { useReorderWallets } from "@/hooks/use-reorder-wallets";
import { WalletSection, type DraftState } from "./wallet-section";

type WalletType = WalletDto["walletType"];

interface WalletsSectionedListProps {
  budgetId: string;
  budgetCurrency: string;
  initial: WalletDto[];
}

export function WalletsSectionedList({
  budgetId,
  budgetCurrency,
  initial,
}: WalletsSectionedListProps) {
  const t = useTranslations("bdp.tab.wallets.toast");
  const { data: wallets = initial } = useWallets(budgetId, initial);
  const updateMut = useUpdateWallet(budgetId);
  const createMut = useCreateWallet(budgetId);
  const archiveMut = useArchiveWallet(budgetId);
  const reorderMut = useReorderWallets(budgetId);

  // W-4 staged-add state: per-section draft tracker
  // Only one draft per section at a time (idempotent set in handleAdd).
  const [drafts, setDrafts] = useState<Partial<Record<WalletType, DraftState>>>(
    {},
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const droppedId = String(over.id);
    const dragged = wallets.find((x) => x.id === activeId);
    if (!dragged) return;

    // UAT-PH5-T3-1x: intra-section reorder when the drop target is another
    // row in the same section. Cross-section moves continue to drop on the
    // section background (id = "section-<TYPE>").
    if (droppedId.startsWith("row-")) {
      const targetId = droppedId.slice("row-".length);
      if (targetId === activeId) return;
      const target = wallets.find((x) => x.id === targetId);
      if (!target) return;
      if (target.walletType !== dragged.walletType) {
        // Cross-section: treat as section change to the target's section.
        return handleCrossSectionDrop(dragged, target.walletType);
      }
      // Build new section order: remove active from its position, insert at
      // target's position so dropping ON a row places the dragged row in
      // front of that target (standard list-reorder semantics).
      const sectionIds = wallets
        .filter((w) => w.walletType === dragged.walletType)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((w) => w.id);
      const fromIdx = sectionIds.indexOf(activeId);
      const toIdx = sectionIds.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      sectionIds.splice(fromIdx, 1);
      sectionIds.splice(toIdx, 0, activeId);
      reorderMut.mutate({
        walletType: dragged.walletType,
        orderedIds: sectionIds,
      });
      return;
    }

    if (!droppedId.startsWith("section-")) return;
    const newType = droppedId.slice("section-".length) as WalletType;
    if (dragged.walletType === newType) return;
    return handleCrossSectionDrop(dragged, newType);
  }

  function handleCrossSectionDrop(w: WalletDto, newType: WalletType) {
    if (w.walletType === newType) return;
    // Capture wallet name before mutation for toast message
    const walletName = w.name;
    const originalType = w.walletType;

    // D-PH5-W8: use mutateAsync + try/catch so the per-call error branch
    // runs in the same microtask as the drag handler (avoids per-call
    // callback lifecycle issues with fire-and-forget mutate()).
    updateMut.mutateAsync({ walletId: w.id, walletType: newType }).then(() => {
      toast.success(t("moved", { name: walletName, sectionLabel: newType }), {
        description: undefined,
      });
    }).catch((err: Error & { code?: string | null }) => {
      if (err?.code === "reserve_currency_mismatch") {
        // D-PH5-W8: show translated toast with budget currency (not raw i18n key).
        toast.error(
          t("reserveCurrencyRejected", {
            budgetCcy: budgetCurrency,
            name: walletName,
            originalSectionLabel: originalType,
          }),
        );
      }
      // Non-mismatch errors: useUpdateWallet.onError already handled the toast.
    });
  }

  // UAT-PH5-T3-1x: render each section in sortOrder so intra-section reorder
  // is reflected visually. The API already sorts, but list mutations may
  // return wallets in cached order — sort defensively here too.
  const bySort = (a: WalletDto, b: WalletDto) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const grouped: Record<WalletType, WalletDto[]> = {
    SPENDINGS: wallets.filter((w) => w.walletType === "SPENDINGS").sort(bySort),
    CUSHION: wallets.filter((w) => w.walletType === "CUSHION").sort(bySort),
    RESERVE: wallets.filter((w) => w.walletType === "RESERVE").sort(bySort),
  };

  // ── W-4 staged-add handlers ───────────────────────────────────────────────

  /**
   * handleAdd — spawns a draft row for the given section.
   * If a draft already exists for this section, this is a no-op (idempotent).
   * NO network call is made here.
   */
  const handleAdd = useCallback(
    (type: WalletType) => () => {
      setDrafts((d) =>
        d[type] ? d : { ...d, [type]: { pending: false, error: null } },
      );
    },
    [],
  );

  /**
   * handleCommitDraft — fires POST /wallets on non-empty Name blur.
   * This is the ONLY place createMut.mutateAsync is called.
   * W-4: Clicking +Add does NOT call this — only WalletRow's onBlur does.
   */
  const handleCommitDraft = useCallback(
    (type: WalletType) => async (name: string) => {
      setDrafts((d) => ({ ...d, [type]: { pending: true, error: null } }));
      try {
        await createMut.mutateAsync({
          name,
          currency: budgetCurrency,
          amount: "0",
          walletType: type,
        });
        // Success: clear draft — next render shows persisted row from cache
        setDrafts((d) => {
          const next = { ...d };
          delete next[type];
          return next;
        });
      } catch (e: unknown) {
        // Keep draft visible with error state; WalletRow's useEffect refocuses
        const code =
          (e as Error & { code?: string | null })?.code ?? "create_failed";
        setDrafts((d) => ({ ...d, [type]: { pending: false, error: code } }));
      }
    },
    [createMut, budgetCurrency],
  );

  /**
   * handleDiscardDraft — removes draft from state silently.
   * Fired on empty blur or Escape key.
   */
  const handleDiscardDraft = useCallback(
    (type: WalletType) => () => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[type];
        return next;
      });
    },
    [],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {(["SPENDINGS", "CUSHION", "RESERVE"] as const).map((type) => (
          <WalletSection
            key={type}
            type={type}
            budgetCurrency={budgetCurrency}
            wallets={grouped[type]}
            draft={drafts[type] ?? null}
            onUpdate={async (id, patch) => {
              await updateMut.mutateAsync({ walletId: id, ...patch });
            }}
            onArchive={(id) => archiveMut.mutate(id)}
            onAdd={handleAdd(type)}
            onCommitDraft={handleCommitDraft(type)}
            onDiscardDraft={handleDiscardDraft(type)}
          />
        ))}
      </div>
    </DndContext>
  );
}
