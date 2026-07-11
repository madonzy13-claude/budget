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
  useCallback,
  useContext,
  useEffect,
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
  };
  spendings: { scrollTop?: number; scrollLeft?: number };
  /** Investment rows tapped open (mobile P/L expand), keyed by holding id. */
  wallets: { expandedRows: Record<string, boolean> };
  /** Settings accordion — the currently-open section ids (null = untouched, use
   *  the accordion's own default). */
  settings: { openSections?: string[] };
}

const Ctx = createContext<BdpUiStore | null>(null);

/** Amount privacy: whether the sensitive figures are currently revealed. */
interface PrivacyState {
  revealed: boolean;
  toggle: () => void;
}
const PrivacyCtx = createContext<PrivacyState | null>(null);

/** Auto-hide amounts after this long with no user interaction. */
const PRIVACY_INACTIVITY_MS = 30 * 60 * 1000;

/**
 * Reveal state for the Overview amounts. Defaults HIDDEN, so a fresh app visit
 * always starts blurred (state lives in memory only — never persisted). Once
 * revealed, a 30-minute inactivity timer re-hides it; any user interaction
 * (pointer / key / touch / scroll) restarts the countdown. Mounted at
 * BudgetDetail level so the timer spans pill navigation and the state dies only
 * when the user leaves the budget.
 */
function usePrivacyState(): PrivacyState {
  const [revealed, setRevealed] = useState(false);
  const toggle = useCallback(() => setRevealed((r) => !r), []);
  useEffect(() => {
    if (!revealed) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevealed(false), PRIVACY_INACTIVITY_MS);
    };
    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "pointermove",
    ];
    arm();
    for (const e of events)
      window.addEventListener(e, arm, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [revealed]);
  return { revealed, toggle };
}

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
  const privacy = usePrivacyState();
  return (
    <Ctx.Provider value={ref.current}>
      <PrivacyCtx.Provider value={privacy}>{children}</PrivacyCtx.Provider>
    </Ctx.Provider>
  );
}

/**
 * Amount-reveal state for the Overview cards. Uses the provider's shared state
 * when present (survives pill navigation); falls back to isolated local state
 * outside a provider so component tests still toggle.
 */
export function usePrivacyReveal(): PrivacyState {
  const ctx = useContext(PrivacyCtx);
  const local = usePrivacyState();
  return ctx ?? local;
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
