"use client";
/**
 * reserve-fit-one-offs.tsx — "which of these won't happen again?" (260804).
 *
 * Sizing a reserve from history runs aground on rare spend, and no statistic can
 * sort it out: 5,000 of insurance every September is rare AND certain, 5,000 of
 * parachute jump is rare and not. Only the household knows which is which, so
 * this is where they say so.
 *
 * Shape, after two passes with the user:
 *   - ONE icon button in the chart's own corner, carrying a badge with how many
 *     spends are currently set aside. Both diverging charts show it, because
 *     both are distorted by the same one-offs.
 *   - Every large spend in one dialog, biggest first, grouped set-aside/counted.
 *   - Each row is a SWITCH that saves on flip. No Save/Cancel: a decision this
 *     small should not need committing, and a Save button is a thing to forget.
 *   - The row leads with the AMOUNT — that is what you judge it by — and carries
 *     note · category · date underneath. The note names WHICH spend it was, so
 *     three rows of the same category and size stay distinguishable; it just
 *     does not get to be the headline the way it was when every imported row
 *     shouted "CSVIMPORT".
 *   - The dialog must NOT autofocus the filter: on iOS that threw the wheel
 *     picker up the instant it opened.
 */
import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format-date";

export interface OneOffCandidate {
  ledger_id: string;
  category_id: string;
  category_name: string;
  transaction_date: string;
  note: string | null;
  amount_cents: string;
  scheduled_cadence: string | null;
  excluded: boolean;
}

export function ReserveFitOneOffs({
  candidates,
  excludedTotal,
  categories: allCategories,
  categoryOrder = [],
  category: categoryProp,
  onCategoryChange,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  onSave,
  format,
}: {
  /** The spends loaded so far — every one in the range, ten at a time. */
  candidates: OneOffCandidate[];
  /**
   * How many spends the RANGE holds set aside, counted by the server. The
   * badge counted the loaded rows, so it fell to "1" as soon as the list paged
   * past the ticked ones (user, 260813). Absent = count what is loaded, which
   * is right only for an unpaged list.
   */
  excludedTotal?: number;
  /**
   * Every category, for the filter. Derived from the loaded rows when absent,
   * which is only right for a list that is complete: with paging, a category
   * whose spends sit on an unloaded page would simply be missing (user,
   * 260813).
   */
  categories?: { id: string; name: string }[];
  /**
   * Category ids in the order the household arranged them on the spendings
   * tab. The filter used to list them in whatever order the reserve rows
   * arrived in, which matched nothing on screen (user, 260812). Ids the list
   * has never heard of keep their place at the end rather than disappearing.
   */
  categoryOrder?: string[];
  /** Controlled when the caller pages server-side; uncontrolled otherwise. */
  category?: string;
  onCategoryChange?: (categoryId: string) => void;
  /** There are more pages behind this one. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onSave: (delta: { add: string[]; remove: string[] }) => void;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [ownCategory, setOwnCategory] = React.useState("all");
  const category = categoryProp ?? ownCategory;
  const setCategory = (next: string) => {
    setOwnCategory(next);
    onCategoryChange?.(next);
  };
  // Flips are written immediately; this only keeps the row in place until the
  // refetched payload catches up, so it never flickers back under the finger.
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  if (candidates.length === 0) return null;

  const isExcluded = (c: OneOffCandidate) => pending[c.ledger_id] ?? c.excluded;
  const excludedCount = excludedTotal ?? candidates.filter(isExcluded).length;

  const flip = (c: OneOffCandidate) => {
    const next = !isExcluded(c);
    setPending((p) => ({ ...p, [c.ledger_id]: next }));
    onSave(
      next
        ? { add: [c.ledger_id], remove: [] }
        : { add: [], remove: [c.ledger_id] },
    );
  };

  const rank = new Map(categoryOrder.map((id, i) => [id, i]));
  const categories = (
    allCategories
      ? allCategories.map((c) => [c.id, c.name] as [string, string])
      : [...new Map(candidates.map((c) => [c.category_id, c.category_name]))]
  ).sort(([a], [b]) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
  const shown = candidates
    .filter(
      (c) =>
        // Controlled = the caller asked the server for this category already.
        categoryProp !== undefined ||
        category === "all" ||
        c.category_id === category,
    )
    .sort((a, b) => Number(b.amount_cents) - Number(a.amount_cents));
  const setAside = shown.filter(isExcluded);
  const counted = shown.filter((c) => !isExcluded(c));

  const Row = ({ c }: { c: OneOffCandidate }) => {
    const off = isExcluded(c);
    return (
      <li
        data-testid={`reserve-fit-row-${c.ledger_id}`}
        className="flex items-center gap-3 border-b border-[var(--hairline-dark)] py-2.5 last:border-b-0"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The repeat note rides with the AMOUNT. It is the one thing on this
              row that must not be missed — a rare-and-certain charge is exactly
              what must NOT be ticked off as a one-off — and at the end of the
              details line below it was the first thing a phone cropped: "repe…"
              (user, 260810). `shrink-0` keeps it whole; the figure beside it is
              short enough that neither has to give. */}
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={off ? "text-num-sm opacity-50" : "text-num-sm"}>
              {format(Number(c.amount_cents))}
            </span>
            {/* A repeating charge is no longer offered here at all — it is
                not a one-off. What can still carry a cadence is a ONCE
                payment, and "repeats once" says nothing (user, 260813). */}
            {c.scheduled_cadence && c.scheduled_cadence !== "ONCE" && (
              <span
                data-testid={`reserve-fit-recurs-${c.ledger_id}`}
                className="shrink-0 text-caption text-[var(--primary)]"
              >
                {t("reserveFit.recurs", { cadence: c.scheduled_cadence })}
              </span>
            )}
          </span>
          <span className="truncate text-caption text-[var(--muted-foreground)]">
            {c.note ? `${c.note} · ` : ""}
            {c.category_name} · {formatShortDate(c.transaction_date, locale)}
          </span>
        </div>
        <Switch
          data-testid={`reserve-fit-toggle-${c.ledger_id}`}
          // ON = counted. Flipping it off is the member saying "one-off".
          checked={!off}
          onCheckedChange={() => flip(c)}
          aria-label={t("reserveFit.countedAria", {
            amount: format(Number(c.amount_cents)),
          })}
        />
      </li>
    );
  };

  const Section = ({
    testId,
    title,
    rows,
  }: {
    testId: string;
    title: string;
    rows: OneOffCandidate[];
  }) =>
    rows.length === 0 ? null : (
      <section data-testid={testId} className="flex flex-col gap-1">
        <h4 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {title}
        </h4>
        <ul className="flex flex-col rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3">
          {rows.map((c) => (
            <Row key={c.ledger_id} c={c} />
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="reserve-fit-open-one-offs"
        aria-label={
          excludedCount > 0
            ? t("reserveFit.excludedCount", { count: excludedCount })
            : t("reserveFit.reviewOneOffs")
        }
        onClick={() => {
          setCategory("all");
          setOpen(true);
        }}
        className="relative"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {excludedCount > 0 && (
          <span
            data-testid="reserve-fit-one-offs-badge"
            className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--primary)] px-1 text-center text-[10px] font-semibold leading-4 text-[var(--on-primary)]"
          >
            {excludedCount}
          </span>
        )}
      </Button>

      {/* Closing drops the filter: the badge counts whatever the loaded query
          counts, and leaving it narrowed to one category would leave the chart
          reporting that category's ticks as the whole budget's. */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCategory("all");
        }}
      >
        <DialogContent
          data-testid="reserve-fit-one-offs-dialog"
          // Radix focuses the first control otherwise, which IS the filter —
          // and a focused select opens the wheel picker on iOS (260804).
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{t("reserveFit.oneOffsTitle")}</DialogTitle>
            <DialogDescription>
              {t("reserveFit.oneOffsDescription")}
            </DialogDescription>
          </DialogHeader>

          {categories.length > 1 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                data-testid="reserve-fit-category-filter"
                aria-label={t("reserveFit.filterByCategory")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="reserve-fit-filter-all">
                  {t("reserveFit.allCategories")}
                </SelectItem>
                {categories.map(([id, name]) => (
                  <SelectItem
                    key={id}
                    value={id}
                    data-testid={`reserve-fit-filter-${id}`}
                  >
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Section
            testId="reserve-fit-excluded"
            title={t("reserveFit.excludedSection")}
            rows={setAside}
          />
          <Section
            testId="reserve-fit-counted"
            title={t("reserveFit.countedSection")}
            rows={counted}
          />
          {/* The end of the loaded list: press for the next ten. An
              intersection observer was tried and dropped — the ref never
              attached through the dialog's portal, and a button the member can
              see and reach by keyboard beats a gesture that silently does
              nothing (user, 260813). */}
          {hasMore && (
            <button
              type="button"
              data-testid="reserve-fit-load-more"
              onClick={() => onLoadMore?.()}
              disabled={loadingMore}
              className="mt-2 w-full rounded-[var(--radius-md)] py-2 text-caption text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)] disabled:opacity-60"
            >
              {loadingMore
                ? t("reserveFit.loadingMore")
                : t("reserveFit.loadMore")}
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
