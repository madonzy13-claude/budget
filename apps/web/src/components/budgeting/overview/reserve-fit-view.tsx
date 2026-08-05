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
import type * as React from "react";
import { useTranslations } from "next-intl";
import {
  OverviewDivergingBarChart,
  reserveFitColor,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { reserveFitRows } from "@/lib/reserve-fit-rows";
import { reserveTotals } from "@/lib/reserve-totals";
import { ReserveLevelBar } from "./reserve-level-bar";
import type { ReserveFitDTO } from "@/hooks/use-reserve-fit";
import {
  ReserveFitOneOffs,
  type OneOffCandidate,
} from "./reserve-fit-one-offs";
import { ReserveRebalance } from "./reserve-rebalance";

/** Wraps a money formatter so a signed gap reads as one. Uses the same U+2212
 *  minus the percent labels use. */
export function signedMoney(format: (cents: number) => string) {
  return (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${format(Math.abs(n))}`;
}

export function ReserveFitView({
  data,
  onSave,
  onRebalance,
  format,
  scale = "pct",
  scaleSwitch,
}: {
  data: ReserveFitDTO;
  /** One save of the one-off dialog: what to set aside, what to count again. */
  onSave: (delta: { add: string[]; remove: string[] }) => void;
  /** Sets one category's reserve to `targetCents`; resolves with what the
   *  server settled on. Drives the rebalance dialog (260805). */
  onRebalance: (categoryId: string, targetCents: number) => Promise<number>;
  format: (cents: number) => string;
  /** Percent of what the history asked for, or the money itself (260804). */
  scale?: "pct" | "amount";
  /** The switch, rendered by the section so it sits in the chart's own header. */
  scaleSwitch?: React.ReactNode;
}) {
  const t = useTranslations("bdp.tab.overview");
  const { sized } = reserveFitRows(data.rows ?? [], scale);
  const totals = reserveTotals(data.rows ?? []);

  if (sized.length === 0) {
    return (
      <p
        data-testid="reserve-fit-empty"
        className="text-num-sm text-[var(--muted-foreground)]"
      >
        {t("empty.reserveFit")}
      </p>
    );
  }

  // The dialog reads across every category at once, so the per-row candidates
  // are flattened and carry their category with them.
  const candidates: OneOffCandidate[] = sized.flatMap((r) =>
    r.candidates.map((c) => ({
      ...c,
      category_id: r.categoryId,
      category_name: r.name,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* How big the problem is, before the chart says which categories carry
          it — as a shape rather than three figures (user, 260804). Held against
          needed: the piece past the line is what can come out, the missing piece
          is what has to go in. The caption names whichever you point at. */}
      <ReserveLevelBar
        heldCents={totals.heldCents}
        neededCents={totals.neededCents}
        format={format}
        testId="reserve-bar"
      />

      {/* The switch stays centred on its own line; the two dialogs float in the
          chart's top corners so appearing or disappearing never shoves the
          switch off-centre (user, 260804). Rebalance on the LEFT of the switch,
          one-offs on the right where it has always been (user, 260805). */}
      <div className="relative flex items-center justify-center">
        {scaleSwitch}
        <div data-testid="reserve-fit-corner-left" className="absolute left-0 top-0">
          <ReserveRebalance
            rows={sized.map((r) => ({
              categoryId: r.categoryId,
              name: r.name,
              heldCents: r.heldCents,
              neededCents: r.neededCents,
            }))}
            onRebalance={onRebalance}
            format={format}
          />
        </div>
        <div
          data-testid="reserve-fit-corner"
          className="absolute right-0 top-0"
        >
          <ReserveFitOneOffs
            candidates={candidates}
            onSave={onSave}
            format={format}
          />
        </div>
      </div>
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
          valueKey={scale === "amount" ? "gapCents" : "pct"}
          // Signed, like the percent labels: the bar is a GAP, so "+4,600" reads
          // as slack and "−320" as a shortfall (user, 260804).
          formatValue={scale === "amount" ? signedMoney(format) : undefined}
          formatTooltip={format}
          // Short is red at any size, fat is amber — the same amber the meter
          // above uses for "Can withdraw" — and exactly right is grey.
          colorForPct={reserveFitColor}
          // No corridor to shade: this chart has no tolerance band — a buffer is
          // short, fat, or exactly right (user, 260805).
          onPlanBand={false}
          // …and always from the PERCENT, even when the axis is drawn in zł:
          // cents fed to a band function painted every row red.
          colorKey="pct"
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

      {(data.unassigned_recurring ?? []).length > 0 && (
        <p
          data-testid="reserve-fit-unassigned"
          className="text-caption text-center text-[var(--muted-foreground)]"
        >
          {t("reserveFit.unassigned", {
            list: (data.unassigned_recurring ?? [])
              .map((r) => `${r.name} ${format(Number(r.amount_cents))}`)
              .join(", "),
          })}
        </p>
      )}
      <p
        data-testid="reserve-fit-ongoing-note"
        className="-mt-1 text-center text-[10px] leading-tight text-[var(--muted-foreground)]/70"
      >
        {t("planned.ongoingExcluded")}
      </p>
    </div>
  );
}
