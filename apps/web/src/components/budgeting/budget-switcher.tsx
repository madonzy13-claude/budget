"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface BudgetSummary {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
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
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // UAT-PH5-T3-13: "selected" means the user is currently inside that
  // budget's page (URL carries its UUID). On the home page there is no
  // active budget — the trigger collapses to the chevron with no text and
  // no row in the dropdown carries a checkmark.
  //
  // The SSR layout tries to pass activeBudgetId via the middleware-injected
  // x-pathname header, but that header doesn't survive the merge with the
  // next-intl middleware in our setup. We derive the active id client-side
  // from `usePathname()` as the source of truth — it's a "use client" island
  // so this is cheap and always reflects the current route.
  const activeBudgetId = useMemo(() => {
    const fromPath = extractActiveBudgetIdFromPath(pathname);
    return fromPath ?? activeBudgetIdProp;
  }, [pathname, activeBudgetIdProp]);
  const active = budgets.find((b) => b.id === activeBudgetId) ?? null;
  const privateB = budgets.filter((b) => b.kind === "PRIVATE");
  const sharedB = budgets.filter((b) => b.kind === "SHARED");
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
      router.push(`/${locale}/budgets/${id}/wallets`);
    },
    [router, locale, activeBudgetId],
  );

  // UAT-PH5-T3-13: trigger label only renders when a budget is actually
  // active. No active → chevron-only trigger.
  const triggerLabel = active?.name ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.budgetSwitcher.trigger.aria")}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--on-dark)] transition-colors hover:bg-[var(--surface-elevated-dark)]"
        >
          {/* UAT-PH5-T3-06: drop the Lock glyph for PRIVATE — Users still
              marks SHARED so the social affordance reads at a glance. */}
          {active && active.kind === "SHARED" && (
            <Users
              className="size-4 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
          )}
          {/* UAT-PH5-T3-13: show up to 20 characters with no truncation. The
              label is omitted entirely when there is no active budget so the
              header collapses to a bare chevron on the home page. */}
          {triggerLabel && (
            <span className="text-title-sm max-w-[20ch]">{triggerLabel}</span>
          )}
          <ChevronDown
            className="size-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] min-w-[256px] p-0">
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
        {/* UAT-PH5-T2-03: trailing "Create budget" item replaces the removed
            header "+" button. Styled like an empty-state CTA: muted icon, full-
            width row inside the popover. */}
        <div className="h-px bg-[var(--hairline-dark)]" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            router.push(`/${locale}/budgets/new`);
          }}
          className={cn(
            "flex h-10 w-full items-center gap-2 px-4 text-left",
            "text-body-md text-[var(--primary)]",
            "hover:bg-[var(--surface-elevated-dark)]",
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
            )}
          >
            {/* UAT-PH5-T3-13: no leading spacer column. The active row gets
                a Check directly before its name; inactive rows start with
                the kind icon (SHARED only) or the name itself. */}
            {isActive && (
              <Check
                className="size-4 text-[var(--on-dark)]"
                aria-hidden="true"
              />
            )}
            {/* UAT-PH5-T3-06: only render Users glyph for SHARED. PRIVATE
                rows have no kind icon — the row's name alone is enough and
                the dropdown is grouped (when relevant) by Personal heading. */}
            {b.kind === "SHARED" && (
              <Users
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            )}
            <span className="flex-1 truncate text-body-md text-[var(--on-dark)]">
              {b.name}
            </span>
            <Badge variant="outline" className="num text-[11px]">
              {b.default_currency}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
