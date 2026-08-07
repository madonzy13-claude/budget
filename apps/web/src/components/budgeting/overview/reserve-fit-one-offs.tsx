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
  onSave,
  format,
}: {
  candidates: OneOffCandidate[];
  onSave: (delta: { add: string[]; remove: string[] }) => void;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState("all");
  // Flips are written immediately; this only keeps the row in place until the
  // refetched payload catches up, so it never flickers back under the finger.
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  if (candidates.length === 0) return null;

  const isExcluded = (c: OneOffCandidate) => pending[c.ledger_id] ?? c.excluded;
  const excludedCount = candidates.filter(isExcluded).length;

  const flip = (c: OneOffCandidate) => {
    const next = !isExcluded(c);
    setPending((p) => ({ ...p, [c.ledger_id]: next }));
    onSave(
      next
        ? { add: [c.ledger_id], remove: [] }
        : { add: [], remove: [c.ledger_id] },
    );
  };

  const categories = [
    ...new Map(candidates.map((c) => [c.category_id, c.category_name])),
  ];
  const shown = candidates
    .filter((c) => category === "all" || c.category_id === category)
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
          <span className={off ? "text-num-sm opacity-50" : "text-num-sm"}>
            {format(Number(c.amount_cents))}
          </span>
          <span className="truncate text-caption text-[var(--muted-foreground)]">
            {c.note ? `${c.note} · ` : ""}
            {c.category_name} · {formatShortDate(c.transaction_date, locale)}
            {c.scheduled_cadence && (
              <>
                {" · "}
                <span
                  data-testid={`reserve-fit-recurs-${c.ledger_id}`}
                  className="text-[var(--primary)]"
                >
                  {t("reserveFit.recurs", { cadence: c.scheduled_cadence })}
                </span>
              </>
            )}
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

      <Dialog open={open} onOpenChange={setOpen}>
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
              {t("reserveFit.oneOffsExplainer")}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
