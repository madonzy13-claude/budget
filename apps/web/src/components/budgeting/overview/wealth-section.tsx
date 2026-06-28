"use client";
/**
 * wealth-section.tsx — Overview "Financial Wealth" section (11-09, SC7, D-18).
 *
 * Collapsible; capitalization(default)/investments toggle switches the ?view param
 * (new RQ key → new fetch). Renders the grow/loss stat (amount + signed % with an
 * up-green/down-red arrow), the monthly-avg grow %, the value time-series (area,
 * range-scoped), the month-over-month dynamics bar (per-bar green/red), and — only
 * in the investments view — a per-holding-type pie colored by the Phase-9
 * UI_TYPE_COLOR map. null % → "—"; empty history → calm copy. Charts via the 11-02
 * wrappers; string cents → Number here.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewSection } from "./overview-section";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import {
  useOverviewWealth,
  type WealthView,
} from "@/hooks/use-overview-wealth";
import { centsToDisplay, centsToDisplayCompact } from "@/lib/cents-format";
import { UI_TYPE_COLOR } from "@/lib/investment-icons";
import { deriveUiType } from "@/lib/investment-types";
import type { OverviewRange } from "@/lib/overview-range";

const UP = "var(--trading-up)";
const DOWN = "var(--trading-down)";
const NEUTRAL = "var(--muted-foreground)";

function PctStat({ label, pct }: { label: string; pct: number | null }) {
  const up = pct !== null && pct >= 0;
  const down = pct !== null && pct < 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span
        className={cn(
          "num inline-flex items-center gap-1 text-num-md",
          up && "text-[var(--trading-up)]",
          down && "text-[var(--trading-down)]",
          pct === null && "text-[var(--muted-foreground)]",
        )}
      >
        {pct === null ? (
          "—"
        ) : (
          <>
            <Arrow className="size-3.5" aria-hidden="true" />
            {`${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`}
          </>
        )}
      </span>
    </div>
  );
}

export function WealthSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<WealthView>("capitalization");

  const { data, isPending, isError } = useOverviewWealth(budgetId, {
    from: range.from,
    to: range.to,
    view,
    enabled: open,
  });

  const ccy = data?.currency ?? "USD";
  const fmtY = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, locale);

  const toggle = (v: WealthView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "border-b-2 px-3 py-1.5 text-num-sm min-h-[44px] sm:min-h-0",
        view === v
          ? "border-[var(--primary)] text-[var(--body-on-dark)]"
          : "border-transparent text-[var(--muted-foreground)]",
      )}
    >
      {label}
    </button>
  );

  return (
    <OverviewSection
      testId="overview-section-wealth"
      title={t("sections.wealth")}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div role="group" className="flex items-center gap-1">
        {toggle("capitalization", t("wealth.capitalization"))}
        {toggle("investments", t("wealth.investments"))}
      </div>

      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data || data.series.length === 0 ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.wealth")}
        </p>
      ) : (
        <>
          {/* Stat row: grow/loss + monthly-avg grow */}
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-0.5">
              <p className="text-caption text-[var(--muted-foreground)]">
                {Number(data.grow.delta_cents) >= 0
                  ? t("wealth.grow")
                  : t("wealth.loss")}
              </p>
              <span
                className={cn(
                  "num text-display-sm",
                  Number(data.grow.delta_cents) >= 0
                    ? "text-[var(--trading-up)]"
                    : "text-[var(--trading-down)]",
                )}
              >
                {centsToDisplay(data.grow.delta_cents, ccy, locale)}
              </span>
            </div>
            <PctStat label={t("wealth.grow")} pct={data.grow.delta_pct} />
            <PctStat
              label={t("wealth.monthlyAvg")}
              pct={data.monthly_avg_grow_pct}
            />
          </div>

          {/* Value time-series */}
          <OverviewAreaChart
            data={data.series.map((p) => ({
              label: p.label,
              value: Number(p.value_cents),
            }))}
            xKey="label"
            series={[
              {
                key: "value",
                label:
                  view === "investments"
                    ? t("wealth.investments")
                    : t("wealth.capitalization"),
              },
            ]}
            formatY={fmtY}
          />

          {/* Month-over-month dynamics (per-bar green/red) */}
          {data.dynamics.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("wealth.dynamics")}
              </p>
              <OverviewBarChart
                data={data.dynamics.map((d) => ({
                  label: d.label,
                  pct: d.pct ?? 0,
                  raw: d.pct,
                }))}
                xKey="label"
                series={[{ key: "pct", label: t("wealth.dynamics") }]}
                colorByPoint={(row) =>
                  row.raw === null
                    ? NEUTRAL
                    : Number(row.pct) >= 0
                      ? UP
                      : DOWN
                }
                formatValue={(n) => `${n.toFixed(1)}%`}
              />
            </div>
          )}

          {/* Investments view: per-type pie (UI_TYPE_COLOR) */}
          {view === "investments" &&
            (data.pie && data.pie.length > 0 ? (
              <OverviewPieChart
                data={data.pie.map((p) => ({
                  holding_type: p.holding_type,
                  value: Number(p.value_cents),
                }))}
                nameKey="holding_type"
                valueKey="value"
                colorFor={(ht) => UI_TYPE_COLOR[deriveUiType(null, ht, false)]}
              />
            ) : (
              <p className="text-num-sm text-[var(--muted-foreground)]">
                {t("empty.pie")}
              </p>
            ))}
        </>
      )}
    </OverviewSection>
  );
}
