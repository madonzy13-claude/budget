"use client";
/**
 * reserve-fit-one-offs.tsx — "which of these won't happen again?" (260804).
 *
 * Sizing a reserve from history runs aground on rare spend, and no statistic can
 * sort it out: 5,000 of insurance every September is rare AND certain, 5,000 of
 * parachute jump is rare and not. Only the household knows which is which, so
 * this is where they say so.
 *
 * The first attempt hung an accordion off every chart row, which buried the one
 * decision that mattered under a dozen that did not. Instead: ONE line under the
 * chart, and a dialog with every large spend in one place — biggest first, with
 * its category and date, the ones already set aside in their own section on top,
 * and a category filter for a budget with many.
 *
 * Decisions are STAGED and written only on Save, so the member can see the whole
 * picture before committing and Cancel genuinely does nothing.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OneOffCandidate {
  ledger_id: string;
  category_id: string;
  category_name: string;
  transaction_date: string;
  note: string | null;
  amount_cents: string;
  recurring_cadence: string | null;
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
  const [open, setOpen] = React.useState(false);
  const [staged, setStaged] = React.useState<Record<string, boolean>>({});
  const [category, setCategory] = React.useState("all");

  // Nothing large enough to judge — then there is nothing to offer.
  if (candidates.length === 0) return null;

  const isExcluded = (c: OneOffCandidate) => staged[c.ledger_id] ?? c.excluded;
  const savedExcludedCount = candidates.filter((c) => c.excluded).length;

  const start = () => {
    // Always open on the server's answer: an abandoned staging must not linger.
    setStaged({});
    setCategory("all");
    setOpen(true);
  };

  const save = () => {
    const add: string[] = [];
    const remove: string[] = [];
    for (const c of candidates) {
      const next = isExcluded(c);
      if (next === c.excluded) continue;
      (next ? add : remove).push(c.ledger_id);
    }
    onSave({ add, remove });
    setOpen(false);
  };

  const categories = [
    ...new Map(candidates.map((c) => [c.category_id, c.category_name])),
  ];
  const shown = candidates
    .filter((c) => category === "all" || c.category_id === category)
    .sort((a, b) => Number(b.amount_cents) - Number(a.amount_cents));
  const excluded = shown.filter(isExcluded);
  const counted = shown.filter((c) => !isExcluded(c));

  const Row = ({ c }: { c: OneOffCandidate }) => (
    <li
      data-testid={`reserve-fit-row-${c.ledger_id}`}
      className="flex min-h-[44px] items-center gap-3 border-b border-[var(--hairline-dark)] py-2 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-num-sm">
          {c.note ?? t("reserveFit.untitled")}
        </span>
        <span className="text-caption text-[var(--muted-foreground)]">
          {c.category_name} · {c.transaction_date}
          {c.recurring_cadence && (
            <>
              {" · "}
              <span data-testid={`reserve-fit-recurs-${c.ledger_id}`}>
                {t("reserveFit.recurs", { cadence: c.recurring_cadence })}
              </span>
            </>
          )}
        </span>
      </div>
      <span className="shrink-0 text-num-sm">
        {format(Number(c.amount_cents))}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid={`reserve-fit-toggle-${c.ledger_id}`}
        onClick={() =>
          setStaged((s) => ({ ...s, [c.ledger_id]: !isExcluded(c) }))
        }
      >
        {isExcluded(c) ? t("reserveFit.count") : t("reserveFit.setAside")}
      </Button>
    </li>
  );

  return (
    <>
      <button
        type="button"
        data-testid="reserve-fit-open-one-offs"
        onClick={start}
        className={cn(
          "self-start text-caption underline decoration-dotted underline-offset-4",
          savedExcludedCount > 0
            ? "text-[var(--body-on-dark)]"
            : "text-[var(--muted-foreground)]",
        )}
      >
        {savedExcludedCount > 0
          ? t("reserveFit.excludedCount", { count: savedExcludedCount })
          : t("reserveFit.reviewOneOffs")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="reserve-fit-one-offs-dialog"
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{t("reserveFit.oneOffsTitle")}</DialogTitle>
            <DialogDescription>
              {t("reserveFit.oneOffsExplainer")}
            </DialogDescription>
          </DialogHeader>

          <select
            data-testid="reserve-fit-category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t("reserveFit.filterByCategory")}
            className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-3 text-num-sm"
          >
            <option value="all">{t("reserveFit.allCategories")}</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          {excluded.length > 0 && (
            <section
              data-testid="reserve-fit-excluded"
              className="flex flex-col gap-1"
            >
              <h4 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
                {t("reserveFit.excludedSection")}
              </h4>
              <ul className="flex flex-col">
                {excluded.map((c) => (
                  <Row key={c.ledger_id} c={c} />
                ))}
              </ul>
            </section>
          )}

          <section
            data-testid="reserve-fit-counted"
            className="flex flex-col gap-1"
          >
            <h4 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
              {t("reserveFit.countedSection")}
            </h4>
            <ul className="flex flex-col">
              {counted.map((c) => (
                <Row key={c.ledger_id} c={c} />
              ))}
            </ul>
          </section>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              data-testid="reserve-fit-cancel"
              onClick={() => setOpen(false)}
            >
              {t("reserveFit.cancel")}
            </Button>
            <Button type="button" data-testid="reserve-fit-save" onClick={save}>
              {t("reserveFit.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
