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
import { useWallets, type WalletDto } from "@/hooks/use-wallets";
import { useUpdateWallet } from "@/hooks/use-update-wallet";
import { useCreateWallet } from "@/hooks/use-create-wallet";
import { useArchiveWallet } from "@/hooks/use-archive-wallet";
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
  const { data: wallets = initial } = useWallets(budgetId, initial);
  const updateMut = useUpdateWallet(budgetId);
  const createMut = useCreateWallet(budgetId);
  const archiveMut = useArchiveWallet(budgetId);

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
    const droppedId = String(over.id);
    if (!droppedId.startsWith("section-")) return;
    const newType = droppedId.slice("section-".length) as WalletType;
    const w = wallets.find((x) => x.id === String(active.id));
    if (!w || w.walletType === newType) return;

    updateMut.mutate(
      { walletId: w.id, walletType: newType },
      {
        onSuccess: () =>
          toast.success("bdp.tab.wallets.toast.moved", {
            description: undefined,
          }),
        onError: (err: Error & { code?: string | null }) => {
          if (err?.code === "reserve_currency_mismatch") {
            // useUpdateWallet already toasts reserveCurrencyOnEdit
          }
          // useUpdateWallet.onError already handles rollback + toast
        },
      },
    );
  }

  const grouped: Record<WalletType, WalletDto[]> = {
    SPENDINGS: wallets.filter((w) => w.walletType === "SPENDINGS"),
    CUSHION: wallets.filter((w) => w.walletType === "CUSHION"),
    RESERVE: wallets.filter((w) => w.walletType === "RESERVE"),
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
