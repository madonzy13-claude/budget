"use client";
/**
 * bdp-ui-state.tsx — per-budget UI state that survives tab-pill navigation but
 * resets when you leave the Budget Detail Page (UAT round 16 item 4).
 *
 * WHY a store: the BDP carousel gives every tab switch a fresh AnimatePresence
 * key, so each pane fully UNMOUNTS on switch (see budget-detail.tsx) — local
 * useState (Overview range, which sections are open, scroll position) would be
 * lost. This store lives in a `useRef` inside BudgetDetail, which persists across
 * every pane unmount and dies only when BudgetDetail itself unmounts (navigating
 * away from the budget). So state carries between pills and resets exactly on
 * leave — which is the spec. (Spendings' viewed month rides the ?month URL param,
 * preserved separately by BudgetDetail's pushState.)
 *
 * It's a mutable object read/written imperatively (not React state) — persisting
 * a value must never trigger a re-render, and readers only need it at mount.
 */
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { OverviewRange } from "@/lib/overview-range";

export interface BdpUiStore {
  overview: {
    range?: OverviewRange;
    /** open-state per collapsible section: planned/overspent/reserves/wealth. */
    sections: Record<string, boolean>;
    scrollTop?: number;
    /** Financial-Wealth chart view (capitalization vs investments) — persists
     *  across pill navigation so leaving + returning keeps the chosen view. */
    wealthView?: "capitalization" | "investments";
    /** Planned section's category selector — persists across pill navigation so
     *  a chosen category isn't reset to "All categories" on return. */
    plannedCategoryId?: string;
  };
  spendings: { scrollTop?: number; scrollLeft?: number };
  /** Investment rows tapped open (mobile P/L expand), keyed by holding id. */
  wallets: { expandedRows: Record<string, boolean> };
  /** Settings accordion — the currently-open section ids (null = untouched, use
   *  the accordion's own default). */
  settings: { openSections?: string[] };
}

const Ctx = createContext<BdpUiStore | null>(null);

export function BdpUiStateProvider({ children }: { children: ReactNode }) {
  const ref = useRef<BdpUiStore | null>(null);
  if (ref.current === null) {
    ref.current = {
      overview: { sections: {} },
      spendings: {},
      wallets: { expandedRows: {} },
      settings: {},
    };
  }
  return <Ctx.Provider value={ref.current}>{children}</Ctx.Provider>;
}

/** The mutable per-budget UI store; null outside a provider (isolated tests). */
export function useBdpUiStore(): BdpUiStore | null {
  return useContext(Ctx);
}

/**
 * Collapsible open-state that persists across pill navigation (item 4). Seeds
 * from the store on mount (default closed), writes back on every toggle. Outside
 * a provider it's plain local state, so sections still work in isolated tests.
 */
export function usePersistedSectionOpen(key: string): [boolean, () => void] {
  const store = useBdpUiStore();
  const [open, setOpen] = useState(
    () => store?.overview.sections[key] ?? false,
  );
  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      if (store) store.overview.sections[key] = next;
      return next;
    });
  return [open, toggle];
}
