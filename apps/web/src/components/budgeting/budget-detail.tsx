"use client";
/**
 * budget-detail.tsx — the Budget Detail Page as a SINGLE client-rendered unit.
 *
 * Replaces the old route-per-tab model (`/budgets/[id]/{wallets,spendings,
 * reserves,settings}` each a Next route + a FrozenRouter route-carousel). Tab
 * switching is now PURE CLIENT STATE: clicking a pill changes `activeTab` and
 * pushes the URL with `history.pushState` — NO Next navigation, so there is no
 * per-tab RSC round-trip to wait on. The carousel slide therefore plays instantly
 * from the moment the page is interactive; each pane renders its data from the
 * React Query cache (instant when warm) or a skeleton (cold), and revalidates in
 * the background (SWR). Offline is the SAME path — React Query's networkMode just
 * pauses the background fetch, so the cached pane renders with no special casing.
 *
 * URL stays the source of truth for deep-links / bookmarks / back-forward: the
 * server (catch-all `[[...tab]]/page.tsx`) seeds `initialTab` from the path,
 * pushState keeps the address bar in sync on every switch, and a popstate
 * listener mirrors browser back/forward back into `activeTab`.
 *
 * The directional slide (Wallets→Spendings→Reserves→Settings = forward) and the
 * monotonic per-switch key are ported from the old page-transition.tsx — a fresh
 * key per switch makes every visit a distinct AnimatePresence pane that exits +
 * unmounts cleanly (no same-key collision when cycling back to a tab). No
 * FrozenRouter is needed: panes are plain client components with no router
 * context to freeze; an exiting pane just keeps its last render while it slides.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BdpTabs } from "@/components/budgeting/bdp-tabs";
import { BdpUiStateProvider } from "@/components/budgeting/bdp-ui-state";
import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";
import { usePrefetchBudgetTabs } from "@/hooks/use-prefetch-budget-tabs";
import { rememberLastBudget } from "@/lib/last-budget";
import { useBudget } from "@/hooks/use-budget-data";
import { OverviewTab } from "@/components/budgeting/overview/overview-tab";
import { WalletsSectionedList } from "@/components/budgeting/wallets-tab/wallets-sectioned-list";
import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";
import { ReservesTableClient } from "@/components/budgeting/reserves-tab/reserves-table-client";
import { SettingsTabClient } from "@/components/settings/settings-tab-client";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
import { TAB_ORDER, isBdpTab, type BdpTab } from "@/lib/bdp-tabs";

/** The per-tab pane content — the exact wrappers the old tab page.tsx files used
 * (so geometry / bottom-clearance behaviour is unchanged): spendings keeps
 * data-no-page-clearance (its inner scroller owns the scroll); the rest sit in a
 * centered 1280px column. */
function TabPane({
  tab,
  budgetId,
  reservesEnabled,
  investmentsEnabled,
}: {
  tab: BdpTab;
  budgetId: string;
  reservesEnabled: boolean;
  investmentsEnabled: boolean;
}) {
  switch (tab) {
    case "overview":
      // data-no-page-clearance: Overview owns an inner scroll surface (OverviewTab),
      // so the shell zeroes the page-level bottom pad (mirrors spendings).
      return (
        // Full-width wrapper (item 9): OverviewTab owns a full-width inner
        // scroller so wheeling over the desktop side-margins still scrolls; the
        // content centers itself at max-w-[1280px] inside it.
        <div data-no-page-clearance className="w-full">
          <OverviewTab
            budgetId={budgetId}
            reservesEnabled={reservesEnabled}
            investmentsEnabled={investmentsEnabled}
          />
        </div>
      );
    case "wallets":
      return (
        <div className="mx-auto w-full max-w-[1280px]">
          <WalletsSectionedList budgetId={budgetId} />
        </div>
      );
    case "spendings":
      return (
        <div data-no-page-clearance>
          <SpendingsGridClient budgetId={budgetId} />
        </div>
      );
    case "reserves":
      return (
        <div className="mx-auto w-full max-w-[1280px]">
          <ReservesTableClient budgetId={budgetId} />
        </div>
      );
    case "settings":
      return (
        <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
          <SettingsTabClient budgetId={budgetId} />
        </main>
      );
  }
}

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (dir: number) => ({ x: dir >= 0 ? "-100%" : "100%" }),
};

/**
 * Page-scroll persistence across pill navigation (round 18 item 10). The
 * wallets/reserves/settings panes page-scroll (browser: window/documentElement;
 * standalone: main[data-shell-scroll]) — overview/spendings own inner scrollers
 * and stay at page-scroll 0. We SAVE the outgoing tab's page scroll and RESTORE
 * the incoming tab's (0 → reset to top, as before).
 */
function readPageScroll(): number {
  const main = document.querySelector<HTMLElement>("main[data-shell-scroll]");
  if (main && main.scrollTop > 0) return main.scrollTop;
  return window.scrollY || (document.scrollingElement?.scrollTop ?? 0);
}
function applyPageScroll(top: number) {
  if (typeof window.scrollTo === "function") window.scrollTo(0, top);
  const se = document.scrollingElement as HTMLElement | null;
  if (se && se.scrollTop !== top) se.scrollTop = top;
  const main = document.querySelector<HTMLElement>("main[data-shell-scroll]");
  if (main && main.scrollTop !== top) main.scrollTop = top;
}
/** Restore once the incoming pane is tall enough (it mounts before its data lays
 *  out, so a one-shot set clamps); reset-to-0 is a single rAF. */
function restorePageScroll(top: number) {
  if (top <= 0) {
    requestAnimationFrame(() => applyPageScroll(0));
    return;
  }
  const start = performance.now();
  const tick = () => {
    applyPageScroll(top);
    if (readPageScroll() >= top - 2 || performance.now() - start > 2000) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

interface BudgetDetailProps {
  locale: string;
  budgetId: string;
  initialTab: BdpTab;
  reservesEnabled: boolean;
  initialTasks: TaskSummary[];
  /** ?task= deep-link — auto-expands that task in the initial tab's slider. */
  focusTaskId?: string;
}

export function BudgetDetail({
  locale,
  budgetId,
  initialTab,
  reservesEnabled,
  initialTasks,
  focusTaskId,
}: BudgetDetailProps) {
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState<BdpTab>(initialTab);

  // Warm every tab's data on budget open (tiered prefetch). With client tabs
  // there is no RSC to prefetch, so the whole connection serves the data.
  usePrefetchBudgetTabs(budgetId);

  // r35: remember this budget so a plain home landing (app reopen) reopens it.
  useEffect(() => {
    rememberLastBudget(budgetId);
  }, [budgetId]);

  // reservesEnabled arrives as a server prop (initial paint). The Settings →
  // Reserves toggle PATCHes the flag + invalidates ["budget", id, "detail"], so
  // read the live value from that query and prefer it — this hides/shows the
  // Reserves pill + the Overview reserves card/section WITHOUT a full reload.
  const liveBudget = useBudget(budgetId).data as
    | {
        reservesEnabled?: boolean;
        reserves_enabled?: boolean;
        investmentsEnabled?: boolean;
        investments_enabled?: boolean;
        overviewEnabled?: boolean;
        overview_enabled?: boolean;
      }
    | undefined;
  const reservesOn =
    liveBudget?.reservesEnabled ??
    liveBudget?.reserves_enabled ??
    reservesEnabled;
  // r36: Overview page flag (live from useBudget the Settings → General toggle
  // invalidates) → hides the Overview pill + falls back off a direct /overview.
  const overviewOn =
    liveBudget?.overviewEnabled ?? liveBudget?.overview_enabled ?? true;
  // No server prop for investments (Overview-only) — read live from the same
  // useBudget query the Settings → Investments toggle invalidates, so the
  // "incl. investments" sub-line + the wealth view toggle react without a reload.
  const investmentsOn =
    liveBudget?.investmentsEnabled ?? liveBudget?.investments_enabled ?? true;

  // Direction + monotonic per-switch key (ported from page-transition.tsx). Runs
  // in render against refs so a re-render keeps the same pane while every real
  // tab change advances the key and the slide direction.
  const prevIdx = useRef(TAB_ORDER.indexOf(initialTab));
  const lastTab = useRef<BdpTab>(initialTab);
  const navKey = useRef(0);
  const curIdx = TAB_ORDER.indexOf(activeTab);
  let dir = curIdx >= prevIdx.current ? 1 : -1;
  if (activeTab !== lastTab.current) {
    navKey.current += 1;
    lastTab.current = activeTab;
    prevIdx.current = curIdx;
  }

  // Per-tab page-scroll (wallets/reserves/settings) — survives pill switches for
  // the BDP's lifetime (item 10); overview/spendings inner scroll lives in the
  // BdpUiStore instead.
  const pageScrollByTab = useRef<Record<string, number>>({});

  const select = useCallback(
    (tab: BdpTab) => {
      setActiveTab((prev) => {
        if (prev === tab) return prev;
        pageScrollByTab.current[prev] = readPageScroll(); // save outgoing
        // URL sync for bookmark/back — NOT a Next navigation, so no RSC fetch.
        // Preserve the search string (?month=…) so Spendings returns to the same
        // month after visiting another pill (round 16 item 4) — the month lives
        // in the URL (useMonthParam), and dropping it here reset it to "current".
        window.history.pushState(
          null,
          "",
          `/${locale}/budgets/${budgetId}/${tab}${window.location.search}`,
        );
        restorePageScroll(pageScrollByTab.current[tab] ?? 0); // restore incoming
        return tab;
      });
    },
    [locale, budgetId],
  );

  // Browser back/forward → mirror the URL's tab back into state.
  useEffect(() => {
    function onPop() {
      const m = window.location.pathname.match(
        /\/budgets\/[^/]+\/(overview|wallets|spendings|reserves|settings)/,
      );
      const tab = isBdpTab(m?.[1]) ? (m![1] as BdpTab) : "wallets";
      pageScrollByTab.current[lastTab.current] = readPageScroll();
      setActiveTab(tab);
      restorePageScroll(pageScrollByTab.current[tab] ?? 0);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // r36: Overview disabled while it's the active tab (direct /overview URL, or the
  // user just turned it off in Settings) → fall back to Wallets so no hidden pill
  // is left selected.
  useEffect(() => {
    if (!overviewOn && activeTab === "overview") select("wallets");
  }, [overviewOn, activeTab, select]);

  return (
    <BdpUiStateProvider>
      {/* Sticky pills band — same wrapper/testid/attrs as the old BudgetShellData
          band so the @tasks-geometry proofs and z-stack are unchanged. */}
      <div
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
        data-testid="bdp-sticky-wrapper"
        data-bdp-tabs
      >
        <BdpTabs
          locale={locale}
          budgetId={budgetId}
          activeTab={activeTab}
          onSelect={select}
          reservesEnabled={reservesOn}
          overviewEnabled={overviewOn}
          initialTasks={initialTasks}
        />
      </div>

      <div className="pb-shell-safe">
        {/* CSS-grid STACK: outgoing + incoming panes share one cell so they
            overlap + top-align (never push each other vertically); overflow-x-clip
            hides the horizontal slide. */}
        <div className="grid grid-cols-[minmax(0,1fr)] overflow-x-clip">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={navKey.current}
              className="min-w-0 [grid-area:1/1]"
              custom={dir}
              variants={reduce ? undefined : variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.7, ease: [0.32, 0.72, 0, 1] }
              }
            >
              {/* Tasks strip slides WITH the page (first child, as before). Keyed
                  per tab so the always-start-collapsed + deep-link auto-expand
                  mount semantics hold on every switch. */}
              {/* Overview has no task strip (no task kind maps to it); the guard
                  also narrows BdpTab → Pill for the slider's `pill` prop. */}
              {activeTab !== "overview" && (
                <PillTaskSlider
                  key={activeTab}
                  budgetId={budgetId}
                  locale={locale}
                  pill={activeTab}
                  initialTasks={initialTasks}
                  focusTaskId={
                    activeTab === initialTab ? focusTaskId : undefined
                  }
                />
              )}
              <TabPane
                tab={activeTab}
                budgetId={budgetId}
                reservesEnabled={reservesOn}
                investmentsEnabled={investmentsOn}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </BdpUiStateProvider>
  );
}
