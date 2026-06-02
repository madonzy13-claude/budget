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
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { useWallets, type WalletDto } from "@/hooks/use-wallets";
import { useUpdateWallet } from "@/hooks/use-update-wallet";
import { useCreateWallet } from "@/hooks/use-create-wallet";
import { useArchiveWallet } from "@/hooks/use-archive-wallet";
import { useReorderWallets } from "@/hooks/use-reorder-wallets";
import { WalletSection, type DraftState } from "./wallet-section";
// UAT-PH5-T3-28: import the ghost preview's helpers statically. Inline
// `require()` worked on dev but blew up on iOS Safari with a
// client-side exception when the row's DragOverlay first rendered.
import { iconByName } from "./wallet-customizer";
import { centsToBare } from "@/lib/cents-format";
import { GripVertical, Circle } from "lucide-react";

type WalletType = WalletDto["walletType"];

interface WalletsSectionedListProps {
  budgetId: string;
  budgetCurrency: string;
  initial: WalletDto[];
  /**
   * D-PH5-R11 cascading-hide surface 4: when false, the Reserve wallet
   * section is omitted from the Wallets tab (mirrors the Reserves pill
   * + Spendings column-header row hide). Defaults to true so existing
   * callers keep their behaviour.
   */
  reservesEnabled?: boolean;
  /**
   * Phase 6 onboarding rewrite parallel: when false, the Cushion wallet
   * section is omitted entirely. Same cascading-hide pattern as
   * reservesEnabled. Defaults true to preserve existing UX.
   */
  cushionEnabled?: boolean;
}

export function WalletsSectionedList({
  budgetId,
  budgetCurrency,
  initial,
  reservesEnabled = true,
  cushionEnabled = true,
}: WalletsSectionedListProps) {
  const t = useTranslations("bdp.tab.wallets.toast");
  // UAT-PH5-T3-33: separate translator for the full section labels
  // ("Spendings wallets", "Cushion wallets", "Reserve wallets") so the
  // move toast reads "Moved Savings to Cushion wallets" instead of the
  // raw enum "CUSHION".
  const tSection = useTranslations("bdp.tab.wallets.section");
  const sectionLabelFor = (kind: WalletDto["walletType"]) =>
    tSection(
      kind === "SPENDINGS"
        ? "spendings"
        : kind === "CUSHION"
          ? "cushion"
          : "reserve",
    );
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

  // UAT-PH5-T3-18: active drag id drives the <DragOverlay> preview. With
  // multiple SortableContexts (one per section) cross-section drags would
  // otherwise visually drop the row from its source section the moment the
  // pointer crosses a section boundary. DragOverlay keeps a copy pinned to
  // the pointer regardless of which context is currently the drop target.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragged =
    activeDragId != null ? wallets.find((w) => w.id === activeDragId) : null;
  // UAT-PH5-T3-22: section currently under the pointer during a drag. Used
  // by WalletSection to apply the blue drop-eligible highlight even when
  // the pointer is over an internal row (and not the section background or
  // the +Add CTA). Resolved from the live `over.id` in onDragOver below.
  const [overSection, setOverSection] = useState<WalletType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  // UAT-PH5-T3-22: resolve any drop target id to its parent section so the
  // section can render the drop-eligible highlight regardless of whether
  // the pointer is over the background, a sibling row, or the +Add row.
  function resolveSection(id: string | null | undefined): WalletType | null {
    if (!id) return null;
    if (id.startsWith("section-"))
      return id.slice("section-".length) as WalletType;
    const w = wallets.find((x) => x.id === id);
    return w ? w.walletType : null;
  }

  function handleDragOver(e: DragOverEvent) {
    setOverSection(resolveSection(e.over ? String(e.over.id) : null));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    setOverSection(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const droppedId = String(over.id);
    const dragged = wallets.find((x) => x.id === activeId);
    if (!dragged) return;

    // Section background drop (cross-section move).
    if (droppedId.startsWith("section-")) {
      const newType = droppedId.slice("section-".length) as WalletType;
      if (dragged.walletType === newType) return;
      return handleCrossSectionDrop(dragged, newType);
    }

    // UAT-PH5-T3-17: with useSortable the drop target id IS the target
    // wallet's id (bare). Same section → intra reorder. Different section →
    // treat as cross-section move into the target's section.
    if (droppedId === activeId) return;
    const target = wallets.find((x) => x.id === droppedId);
    if (!target) return;
    if (target.walletType !== dragged.walletType) {
      return handleCrossSectionDrop(dragged, target.walletType);
    }
    const sectionIds = wallets
      .filter((w) => w.walletType === dragged.walletType)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((w) => w.id);
    const fromIdx = sectionIds.indexOf(activeId);
    const toIdx = sectionIds.indexOf(droppedId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    sectionIds.splice(fromIdx, 1);
    sectionIds.splice(toIdx, 0, activeId);
    reorderMut.mutate({
      walletType: dragged.walletType,
      orderedIds: sectionIds,
    });
  }

  function handleCrossSectionDrop(w: WalletDto, newType: WalletType) {
    if (w.walletType === newType) return;
    // Capture wallet name before mutation for toast message
    const walletName = w.name;
    const originalType = w.walletType;

    // D-PH5-W8: use mutateAsync + try/catch so the per-call error branch
    // runs in the same microtask as the drag handler (avoids per-call
    // callback lifecycle issues with fire-and-forget mutate()).
    updateMut
      .mutateAsync({ walletId: w.id, walletType: newType })
      .then(() => {
        toast.success(
          t("moved", {
            name: walletName,
            sectionLabel: sectionLabelFor(newType),
          }),
          { description: undefined },
        );
      })
      .catch((err: Error & { code?: string | null }) => {
        if (err?.code === "reserve_currency_mismatch") {
          // D-PH5-W8: show translated toast with budget currency (not raw i18n key).
          toast.error(
            t("reserveCurrencyRejected", {
              budgetCcy: budgetCurrency,
              name: walletName,
              originalSectionLabel: sectionLabelFor(originalType),
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDragId(null);
        setOverSection(null);
      }}
    >
      <div
        // No bounded inner scroll container any more — the layout's
        // `<main overflow-y-auto>` handles overflow naturally, same as
        // the home and spendings pages. The prior bounded-container
        // pattern reserved a fixed viewport area and revealed dark
        // canvas below the content when the list was short (UAT
        // retest: "footer block, just dark"). dnd-kit's auto-scroll
        // can target the document scroll surface; overscroll-contain
        // is dropped along with the inner overflow.
        className="flex flex-col gap-4 p-4 sm:p-6"
      >
        {(
          [
            "SPENDINGS",
            ...(cushionEnabled ? (["CUSHION"] as const) : []),
            ...(reservesEnabled ? (["RESERVE"] as const) : []),
          ] as const
        ).map((type) => (
          <WalletSection
            key={type}
            type={type}
            budgetCurrency={budgetCurrency}
            wallets={grouped[type]}
            draft={drafts[type] ?? null}
            // UAT-PH5-T3-22 / T3-23: highlight only on cross-section drags.
            // Within the same section reordering is shown by neighbour rows
            // sliding aside — the blue ring would be visual noise.
            isDropEligible={
              overSection === type &&
              activeDragId !== null &&
              activeDragged != null &&
              activeDragged.walletType !== type
            }
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
      {/* UAT-PH5-T3-18: pointer-pinned preview so a cross-section drag never
          loses the dragged row visually as the pointer crosses a context
          boundary. The source row still renders at 0.5 opacity in its section
          so the user sees where it'll snap back if they cancel. */}
      {/* UAT-PH5-T3-21: disable dropAnimation. Otherwise the overlay
          animates back to the SOURCE row's live position on drop — but the
          source row has already moved (optimistic reorder fires in
          onDragEnd before the overlay animation), so the ghost first jumps
          back to the old position and then the row jumps forward to the
          new one. Killing the drop animation makes the handoff invisible:
          ghost disappears, the reordered row is already where it should
          be. */}
      <DragOverlay dropAnimation={null}>
        {activeDragged ? (
          <WalletDragGhost
            name={activeDragged.name}
            currency={activeDragged.currency}
            currentBalanceCents={activeDragged.currentBalanceCents}
            color={activeDragged.color ?? null}
            icon={activeDragged.icon ?? null}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * UAT-PH5-T3-18 — lightweight preview rendered inside DragOverlay. We can't
 * reuse <WalletRow> directly because it calls useSortable which only works
 * inside a SortableContext. The ghost mirrors the row's visual signature
 * (icon + name + currency + amount) so the user sees what they're moving.
 */
function WalletDragGhost({
  name,
  currency,
  currentBalanceCents,
  color,
  icon,
}: {
  name: string;
  currency: string;
  currentBalanceCents: string;
  color: string | null;
  icon: string | null;
}) {
  const tRow = useTranslations("bdp.tab.wallets.row");
  const locale = useLocale();
  const Icon = iconByName(icon);
  return (
    <div
      data-testid="wallet-drag-ghost"
      // `!cursor-grabbing` keeps the grab affordance while the row is in flight;
      // the DragOverlay sits under the pointer, so without this the cursor
      // reverts to the default arrow during the drag.
      className="flex min-h-[48px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-3 shadow-lg ring-1 ring-[var(--hairline-dark)] !cursor-grabbing"
    >
      {/* Grip — static mirror of RowDragHandle so the dragged preview keeps the
          ⠿ handle the row shows at rest. */}
      <span
        className="shrink-0 text-[var(--muted-foreground)]"
        aria-hidden="true"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      {/* Icon — mirrors WalletCustomizer: the chosen icon, or the dashed-circle
          placeholder when none is set. Previously rendered nothing here, so a
          wallet without a custom icon looked empty mid-drag. */}
      <span
        className={
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full " +
          (icon || color
            ? "border border-transparent"
            : "border border-dashed border-[var(--muted-foreground)]/60")
        }
        style={{ color: color ?? "var(--muted-foreground)" }}
        aria-hidden="true"
      >
        {Icon ? (
          <Icon className="size-4" />
        ) : (
          <Circle className="size-3 text-[var(--muted-foreground)]/60" />
        )}
      </span>
      <span className="flex-1 truncate text-body-md text-[var(--body-on-dark)]">
        {name || tRow("untitled")}
      </span>
      <span className="w-[72px] sm:w-[96px] text-num-md text-[var(--muted-foreground)]">
        {currency}
      </span>
      <span className="w-[120px] text-right text-num-md text-[var(--body-on-dark)] sm:w-[160px]">
        {centsToBare(currentBalanceCents, locale)}
      </span>
    </div>
  );
}
