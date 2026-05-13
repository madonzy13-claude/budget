"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Lock, Plus, Users } from "lucide-react";
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
  activeBudgetId,
  locale,
}: BudgetSwitcherProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // The "active" budget is what the trigger advertises. Priority:
  //   1. Budget whose UUID is in the URL (middleware-injected x-pathname → layout).
  //   2. First budget in the list (used on the home page where no UUID is in URL).
  // Without (2) the trigger on `/` would always render the empty-state label
  // ("No budgets yet") even when the user has budgets — which contradicts the
  // NAV-01 contract (trigger displays the current budget) and the
  // nav-switcher.feature scenario.
  const explicitActive = budgets.find((b) => b.id === activeBudgetId) ?? null;
  const active = explicitActive ?? budgets[0] ?? null;
  const privateB = budgets.filter((b) => b.kind === "PRIVATE");
  const sharedB = budgets.filter((b) => b.kind === "SHARED");
  const isEmpty = budgets.length === 0;

  const onPick = useCallback(
    (id: string) => {
      setOpen(false);
      if (id === activeBudgetId) return;
      router.push(`/${locale}/budgets/${id}/spendings`);
    },
    [router, locale, activeBudgetId],
  );

  const triggerLabel = isEmpty
    ? t("nav.switcher.empty.trigger")
    : (active?.name ?? t("nav.switcher.empty.trigger"));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.budgetSwitcher.trigger.aria")}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--on-dark)] transition-colors hover:bg-[var(--surface-elevated-dark)]"
        >
          {!isEmpty &&
            active &&
            (active.kind === "PRIVATE" ? (
              <Lock
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ) : (
              <Users
                className="size-4 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
            ))}
          <span className="text-title-sm max-w-[24ch] truncate sm:max-w-[12ch]">
            {triggerLabel}
          </span>
          <ChevronDown
            className="size-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] min-w-[256px] p-0">
        {isEmpty ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("nav.switcher.empty.body")}
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`/${locale}/budgets/new`);
              }}
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("nav.switcher.empty.cta")}
            </button>
          </div>
        ) : (
          <>
            {privateB.length > 0 && (
              <BudgetGroup
                rows={privateB}
                heading={t("nav.switcher.personal")}
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
                heading={t("nav.switcher.shared")}
                onPick={onPick}
                activeId={activeBudgetId}
              />
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BudgetGroup({
  rows,
  heading,
  onPick,
  activeId,
}: {
  rows: BudgetSummary[];
  heading: string;
  onPick: (id: string) => void;
  activeId: string | null;
}) {
  return (
    <div className="py-2">
      <div className="px-4 pb-1 text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
        {heading}
      </div>
      {rows.map((b) => {
        const isActive = b.id === activeId;
        const Icon = b.kind === "PRIVATE" ? Lock : Users;
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
            <span className="inline-flex size-4 items-center justify-center">
              {isActive && (
                <Check
                  className="size-4 text-[var(--on-dark)]"
                  aria-hidden="true"
                />
              )}
            </span>
            <Icon
              className="size-4 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
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
