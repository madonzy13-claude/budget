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
  varianceColorForRange,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { reserveFitRows } from "@/lib/reserve-fit-rows";
import { reserveTotals } from "@/lib/reserve-totals";
import { ShareBar } from "./share-bar";
import type { ReserveFitDTO } from "@/hooks/use-reserve-fit";
import {
  ReserveFitOneOffs,
  type OneOffCandidate,
} from "./reserve-fit-one-offs";

/** Wraps a money formatter so a signed gap reads as one. Uses the same U+2212
 *  minus the percent labels use. */
export function signedMoney(format: (cents: number) => string) {
  return (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${format(Math.abs(n))}`;
}

export function ReserveFitView({
  data,
  onSave,
  format,
  scale = "pct",
  scaleSwitch,
}: {
  data: ReserveFitDTO;
  /** One save of the one-off dialog: what to set aside, what to count again. */
  onSave: (delta: { add: string[]; remove: string[] }) => void;
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
      <ShareBar
        testId="reserve-bar"
        segments={[
          {
            key: "needed",
            label: t("reserveFit.neededTotal"),
            // What the history asked for, capped at what is actually there —
            // the rest of it shows as the "short" piece.
            value: Math.min(totals.heldCents, totals.neededCents),
            color: "var(--chart-bar-1)",
          },
          {
            key: "slack",
            label: t("reserveFit.canWithdraw"),
            value: Math.max(0, totals.slackCents),
            color: "var(--muted-foreground)",
          },
          {
            key: "short",
            label: t("reserveFit.topUp"),
            value: Math.max(0, -totals.slackCents),
            color: "var(--trading-down)",
          },
        ]}
        total={{
          label: t("reserveFit.heldTotal"),
          value: totals.heldCents,
        }}
        format={format}
      />

      {/* The switch stays centred on its own line; the one-offs button floats in
          the chart's top-right corner so appearing or disappearing never shoves
          the switch off-centre (user, 260804). */}
      <div className="relative flex items-center justify-center">
        {scaleSwitch}
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
