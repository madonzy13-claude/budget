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
import { useTranslations } from "next-intl";
import {
  OverviewDivergingBarChart,
  varianceColorForRange,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { reserveFitRows } from "@/lib/reserve-fit-rows";
import type { ReserveFitDTO } from "@/hooks/use-reserve-fit";
import {
  ReserveFitOneOffs,
  type OneOffCandidate,
} from "./reserve-fit-one-offs";

export function ReserveFitView({
  data,
  onSave,
  format,
}: {
  data: ReserveFitDTO;
  /** One save of the one-off dialog: what to set aside, what to count again. */
  onSave: (delta: { add: string[]; remove: string[] }) => void;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
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

  // The dialog reads across every category at once, so the per-row candidates
  // are flattened and carry their category with them.
  const candidates: OneOffCandidate[] = [...sized, ...thin].flatMap((r) =>
    r.candidates.map((c) => ({
      ...c,
      category_id: r.categoryId,
      category_name: r.name,
    })),
  );

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

      <ReserveFitOneOffs
        candidates={candidates}
        onSave={onSave}
        format={format}
      />

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
