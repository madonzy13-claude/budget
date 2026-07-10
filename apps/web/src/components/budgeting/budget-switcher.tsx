"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useNavRouter } from "@/components/common/nav-pending";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus, User, Users } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";
import { cn } from "@/lib/utils";

export interface BudgetSummary {
  id: string;
  name: string;
  /**
   * kind-removal: `kind` is no longer a stored concept (may be null on new
   * budgets). Private/shared is derived from `memberCount` (1 = private,
   * >1 = shared). Kept optional so legacy payloads still type-check.
   */
  kind?: "PRIVATE" | "SHARED" | null;
  memberCount?: number;
  default_currency: string;
  /** Pending task count for this budget. Sourced from GET /budgets/active. */
  pendingTasksCount: number;
}

/** kind-removal: a budget is "shared" purely by having more than one member. */
function isSharedBudget(b: BudgetSummary): boolean {
  return (b.memberCount ?? 1) > 1;
}

export interface BudgetSwitcherProps {
  budgets: BudgetSummary[];
  activeBudgetId: string | null;
  locale: string;
}

/**
 * BudgetSwitcher — top-nav Popover. Single Popover handles both desktop and
 * mobile breakpoints (D-PH3-08). Active row carries leading `Check` icon —
 * never yellow background (D-PH3-06).
 *
 * Empty state (zero budgets): trigger label = `nav.switcher.empty.trigger`,
 * popover shows the empty hint + "Create budget" CTA → `/${locale}/budgets/new`.
 * No menuitemradio rows in the empty branch.
 *
 * z-index: PopoverContent uses `z-[60]` so it always renders above the sticky
 * top nav (`z-50`) AND any BDP sticky wrapper (`z-40`, Plan 03-06).
 */
export function BudgetSwitcher({
  budgets,
  activeBudgetId: activeBudgetIdProp,
  locale,
}: BudgetSwitcherProps) {
  const t = useTranslations();
  const router = useNavRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Mobile centers the dropdown on the viewport instead of anchoring it under the
  // (left-of-centre) trigger. We render a full-width PopoverAnchor across the
  // header row and switch align→center; desktop keeps the trigger anchor + start.
  // SSR starts false (= desktop layout); the menu only opens on click, long after
  // this mount effect resolves, so there's no hydration flash.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // UAT-PH5-T3-13: "selected" means the user is currently inside that
  // budget's page (URL carries its UUID). On the home page there is no
  // active budget — the trigger collapses to the chevron with no text and
  // no row in the dropdown carries a checkmark.
  //
  // pathname (from usePathname()) is the SOLE source of truth on the
  // client. The SSR `activeBudgetIdProp` is only honoured during the
  // initial server render before usePathname hydrates — we fall back to
  // it only when pathname is null (the early SSR pass), never when
  // pathname exists but lacks a UUID. Previously we did
  // `fromPath ?? activeBudgetIdProp` which silently kept the last
  // budget id stale on the prop when navigating from a budget page back
  // to home: the (app) layout persists across route changes, so the
  // server-passed prop was never refreshed and the trigger kept
  // displaying the previous budget on home. Fix: derive strictly from
  // pathname once the client has it.
  const activeBudgetId = useMemo(() => {
    if (pathname === null) return activeBudgetIdProp;
    return extractActiveBudgetIdFromPath(pathname);
  }, [pathname, activeBudgetIdProp]);
  const active = budgets.find((b) => b.id === activeBudgetId) ?? null;
  const privateB = budgets.filter((b) => !isSharedBudget(b));
  const sharedB = budgets.filter(isSharedBudget);
  const isEmpty = budgets.length === 0;

  // UAT-PH5-T2-03: when the user has no budgets, the header switcher is
  // hidden entirely. The home page renders its own "Create your first
  // budget" empty state, so the header stays clean and the create flow lives
  // there instead of behind a switcher dropdown.
  if (isEmpty) return null;

  const onPick = useCallback(
    (id: string) => {
      setOpen(false);
      if (id === activeBudgetId) return;
      router.push(`/${locale}/budgets/${id}/overview`);
    },
    [router, locale, activeBudgetId],
  );

  // UAT-PH5-T3-13: trigger label only renders when a budget is actually
  // active. No active → chevron-only trigger.
  const triggerLabel = active?.name ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Mobile-only: dim + blur the page behind the open dropdown. Rendered in a
          body portal; the popper wrapper is lifted above it in global.css so the
          menu itself stays sharp. Tapping it dismisses (same as outside-click). */}
      {isMobile &&
        open &&
        createPortal(
          <div
            aria-hidden
            onPointerDown={() => setOpen(false)}
            className="fixed inset-0 z-[55] bg-black/25 backdrop-blur-sm"
          />,
          document.body,
        )}
      {/* Mobile-only: a full-width invisible anchor so `align=center` centres the
          dropdown on the viewport (not under the left-side trigger). Its height
          places the bottom edge at the trigger's bottom so the menu drops from the
          same spot it did before centring. Absent on desktop → anchors to trigger. */}
      {isMobile && (
        <PopoverAnchor asChild>
          <div
            aria-hidden
            // Height = safe-area inset + the trigger's row height, so the anchor's
            // bottom tracks the trigger bottom on notched devices too (the header
            // is pushed down by env(safe-area-inset-top)). ~48px on a plain browser.
            className="pointer-events-none fixed inset-x-0 top-0 h-[calc(env(safe-area-inset-top,0px)+3rem)]"
          />
        </PopoverAnchor>
      )}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.budgetSwitcher.trigger.aria")}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--nav-budget-header)] transition-colors hover:bg-[var(--surface-elevated-dark)]"
        >
          {/* Kind glyph: single User for PRIVATE, Users (couple) for
              SHARED. Both glyphs ride at --muted-foreground so the
              active budget name carries the visual weight — the icon is
              a quick-scan kind cue, not a competing element. */}
          {active &&
            (isSharedBudget(active) ? (
              <Users
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ) : (
              <User
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ))}
          {/* UAT-PH5-T3-13: show up to 20 characters with no truncation. The
              label is omitted entirely when there is no active budget so the
              header collapses to a bare chevron on the home page. */}
          {triggerLabel && (
            <span
              className="text-title-sm inline-block max-w-[20ch] truncate align-middle sm:max-w-[28ch]"
              title={triggerLabel}
            >
              {triggerLabel}
            </span>
          )}
          <ChevronDown
            className="size-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={isMobile ? "center" : "start"}
        // 260618: cap height so a long budget list (many budgets) doesn't
        // overflow past the viewport. The LIST scrolls; the "Create budget" row
        // is pinned outside the scroll region so it's never hidden below the fold.
        // --radix-popover-content-available-height is the space between the
        // trigger and the viewport edge; min() keeps a sensible ceiling.
        className="bs-switcher-content z-[60] flex max-h-[min(70dvh,var(--radix-popover-content-available-height,70dvh))] min-w-[256px] flex-col p-0"
        // UAT-PH5-T3-31: skip auto-focus on open. Radix's default focused
        // the first row, which surfaced a blue focus ring on the first
        // budget item that read as "first item is selected". The
        // dropdown is a navigation menu, not a form — opening it should
        // not preselect any row.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Scrollable budget list — flex-1 + min-h-0 so it takes the remaining
            height and scrolls, leaving the Create row pinned below. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* UAT-PH5-T3-05: suppress section heading when only one kind exists.
              The heading is only useful when both Personal AND Shared groups are
              visible so the user can disambiguate. With one kind, the label is
              noise. */}
          {privateB.length > 0 && (
            <BudgetGroup
              rows={privateB}
              heading={sharedB.length > 0 ? t("nav.switcher.personal") : null}
              onPick={onPick}
              activeId={activeBudgetId}
            />
          )}
          {privateB.length > 0 && sharedB.length > 0 && (
            <div className="h-px bg-[var(--hairline-dark)]" />
          )}
          {sharedB.length > 0 && (
            <BudgetGroup
              rows={sharedB}
              heading={privateB.length > 0 ? t("nav.switcher.shared") : null}
              onPick={onPick}
              activeId={activeBudgetId}
            />
          )}
        </div>
        {/* UAT-PH5-T2-03: trailing "Create budget" item replaces the removed
            header "+" button. PINNED to the bottom (outside the scroll region,
            shrink-0) so it is always reachable no matter how long the list is. */}
        <div className="h-px shrink-0 bg-[var(--hairline-dark)]" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            router.push(`/${locale}/budgets/new`);
          }}
          className={cn(
            "flex h-10 w-full shrink-0 items-center gap-2 px-4 text-left",
            "text-body-md text-[var(--primary)]",
            "hover:bg-[var(--surface-elevated-dark)]",
            // UAT-PH5-T3-19: clickable affordance.
            "cursor-pointer",
          )}
        >
          <Plus className="size-4" aria-hidden="true" />
          <span className="flex-1 truncate">{t("nav.switcher.empty.cta")}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** UAT-PH5-T3-13: extract `<uuid>` from `/<locale>/budgets/<uuid>/...`. */
function extractActiveBudgetIdFromPath(p: string | null): string | null {
  if (!p) return null;
  const m = p.match(
    /\/budgets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i,
  );
  return m ? (m[1] ?? null) : null;
}

function BudgetGroup({
  rows,
  heading,
  onPick,
  activeId,
}: {
  rows: BudgetSummary[];
  // UAT-PH5-T3-05: heading is optional — suppressed when only one kind exists.
  heading: string | null;
  onPick: (id: string) => void;
  activeId: string | null;
}) {
  return (
    <div className="py-2">
      {heading && (
        <div className="px-4 pb-1 text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
          {heading}
        </div>
      )}
      {rows.map((b) => {
        const isActive = b.id === activeId;
        return (
          <button
            key={b.id}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            onClick={() => onPick(b.id)}
            className={cn(
              "flex h-10 w-full items-center gap-2 px-4 text-left",
              "hover:bg-[var(--surface-elevated-dark)]",
              // UAT-PH5-T3-19: clickable affordance on every dropdown row.
              "cursor-pointer",
            )}
          >
            {/* UAT-PH5-T3-13 / T3-31: active row carries a small yellow dot
                instead of a check glyph — same role as a radio "selected"
                indicator but quieter visually. Inactive rows have no
                leading marker (no spacer column either). */}
            {isActive && (
              <span
                className="size-2 shrink-0 rounded-full bg-[var(--primary)]"
                aria-hidden="true"
              />
            )}
            {/* Per-row glyph: single User for private (1 member), Users
                (couple) for shared (>1 member). Both glyphs are 16px and
                muted so they read as metadata, not a competing icon row. */}
            {isSharedBudget(b) ? (
              <Users
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ) : (
              <User
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            )}
            <span className="flex-1 truncate text-body-md text-[var(--on-dark)]">
              {b.name}
            </span>
            {/* r35: pending-task count badge (red) instead of the currency —
                hidden when 0 (PillBadge returns null for count ≤ 0). */}
            <PillBadge count={b.pendingTasksCount} />
          </button>
        );
      })}
    </div>
  );
}
