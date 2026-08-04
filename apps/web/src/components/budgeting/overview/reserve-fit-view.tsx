"use client";
/**
 * reserve-fit-view.tsx — "is each reserve the right size?" (260804).
 *
 * Presentational half of the reserve-fit block: it is handed the DTO and a
 * toggle, so the sizing maths (lib/reserve-fit-rows.ts) and the data plumbing
 * (hooks/use-reserve-fit.ts) stay testable on their own.
 *
 * Two halves, and the second is the point:
 *   - the BAR says how far each buffer is from what the history asked for;
 *   - the LIST under it is where the member overrules that history. Every large
 *     spend is counted by default, so an untouched chart can only ask you to
 *     hold too much; unticking one says "that won't happen again". A spend that
 *     came from a recurring rule carries its cadence, because rare-and-certain
 *     (September insurance) is exactly what must NOT be unticked.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import {
  OverviewDivergingBarChart,
  varianceColorForRange,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { reserveFitRows, type SizedReserveRow } from "@/lib/reserve-fit-rows";
import type { ReserveFitDTO } from "@/hooks/use-reserve-fit";
import { cn } from "@/lib/utils";

export function ReserveFitView({
  data,
  onToggle,
  format,
}: {
  data: ReserveFitDTO;
  /** (ledgerId, excluded) — excluded=true means "this was a one-off". */
  onToggle: (ledgerId: string, excluded: boolean) => void;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const [open, setOpen] = React.useState<string | null>(null);
  const { sized, thin } = reserveFitRows(data.rows ?? []);

  if (sized.length === 0 && thin.length === 0) {
    return (
      <p
        data-testid="reserve-fit-empty"
        className="text-num-sm text-[var(--muted-foreground)]"
      >
        {t("empty.reserveFit")}
      </p>
    );
  }

  const withCandidates = sized.filter((r) => r.candidates.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {sized.length > 0 && (
        <OverviewDivergingBarChart
          data={sized.map((r) => ({
            name: r.name,
            pct: r.pct,
            heldCents: r.heldCents,
            neededCents: r.neededCents,
            gapCents: r.gapCents,
          }))}
          categoryKey="name"
          valueKey="pct"
          formatTooltip={format}
          // Sign flip on purpose: on THIS chart "under" is the dangerous side
          // (the buffer ran out), while over-holding is only wasteful — so the
          // shared variance bands are read from the other end.
          colorForPct={(pct) =>
            varianceColorForRange(-pct, { runningMonthOnly: false })
          }
          tooltipExtra={(row) => {
            const gap = Number(row.gapCents);
            return [
              {
                label: t("reserveFit.held"),
                value: format(Number(row.heldCents)),
              },
              {
                label: t("reserveFit.needed"),
                value: format(Number(row.neededCents)),
              },
              {
                label: gap < 0 ? t("reserveFit.short") : t("reserveFit.trim"),
                value: format(Math.abs(gap)),
                section: true,
              },
            ];
          }}
        />
      )}

      {withCandidates.map((r) => (
        <OneOffList
          key={r.categoryId}
          row={r}
          open={open === r.categoryId}
          onOpen={() => setOpen(open === r.categoryId ? null : r.categoryId)}
          onToggle={onToggle}
          format={format}
        />
      ))}

      {thin.length > 0 && (
        <p
          data-testid="reserve-fit-thin"
          className="text-caption text-[var(--muted-foreground)]"
        >
          {t("reserveFit.thinHistory", {
            names: thin.map((r) => r.name).join(", "),
          })}
        </p>
      )}
    </div>
  );
}

function OneOffList({
  row,
  open,
  onOpen,
  onToggle,
  format,
}: {
  row: SizedReserveRow;
  open: boolean;
  onOpen: () => void;
  onToggle: (ledgerId: string, excluded: boolean) => void;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface-card-dark)]">
      <button
        type="button"
        data-testid={`reserve-fit-oneoffs-${row.categoryId}`}
        onClick={onOpen}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left"
      >
        <span className="text-num-sm">
          {t("reserveFit.oneOffsFor", { name: row.name })}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 px-3 pb-3">
          {row.candidates.map((tx) => (
            <li key={tx.ledger_id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`fit-${tx.ledger_id}`}
                data-testid={`reserve-fit-tx-${tx.ledger_id}`}
                // Checked = counted. Unticking is the member saying "one-off".
                checked={!tx.excluded}
                onChange={(e) => onToggle(tx.ledger_id, !e.target.checked)}
                className="size-4 shrink-0 accent-[var(--primary)]"
              />
              <label
                htmlFor={`fit-${tx.ledger_id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-num-sm"
              >
                <span className="truncate">
                  {tx.note ?? t("reserveFit.untitled")} ·{" "}
                  {format(Number(tx.amount_cents))}
                </span>
                {tx.recurring_cadence && (
                  <span
                    data-testid={`reserve-fit-recurs-${tx.ledger_id}`}
                    className="text-caption shrink-0 text-[var(--muted-foreground)]"
                  >
                    {t("reserveFit.recurs", { cadence: tx.recurring_cadence })}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
