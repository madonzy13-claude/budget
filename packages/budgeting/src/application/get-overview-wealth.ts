/**
 * get-overview-wealth.ts — Financial-Wealth section service (11-06).
 *
 * A value time-series from the 3h budget_wealth_snapshots, aggregated to the range
 * bucket (last-in-bucket = end-of-period sample, matching a value series), with a
 * live current point appended via computeBudgetWealthNow (11-03) so the rightmost
 * bucket always reflects the last few hours live (D-04). The view toggle picks the
 * field: capitalization_cents (default) vs investment_value_cents (D-18).
 *
 * Stats:
 *   - grow/loss (D-15): end − start over the series; % = delta ÷ start (null if start 0).
 *   - month-over-month dynamics (D-16): pct[i] = (v[i]−v[i-1]) ÷ v[i-1] (null when v[i-1]=0).
 *   - monthly_avg_grow (D-16): simple mean of the non-null dynamics %.
 *   - investments view: per-holding-type pie (Σ value per type, default_ccy) (D-18).
 *
 * Value-only series — no purchase-price / contributions metric anywhere (D-17).
 * No FX in this service: snapshots
 * are stored in the budget currency, the live point + the pie are already
 * default_ccy. Cents are bigint internally; the DTO stringifies at the boundary.
 */
import { ok, err, type Result } from "@budget/shared-kernel";

export type WealthView = "capitalization" | "investments";

export interface WealthSnapshotRow {
  captured_at: Date;
  capitalization_cents: bigint;
  investment_value_cents: bigint;
}

export interface GetOverviewWealthDeps {
  snapshotRepo: {
    seriesForRange(
      budgetId: string,
      from: string,
      to: string,
    ): Promise<WealthSnapshotRow[]>;
  };
  /** 11-03 live "wealth right now" — identical numbers to the cron + cards. */
  computeWealthNow: (input: {
    budgetId: string;
    tenantId: string;
    defaultCurrency: string;
    now: Date;
  }) => Promise<{
    capitalization_cents: bigint;
    investment_value_cents: bigint;
    currency: string;
  }>;
  /** Per-holding-type valuation for the investments pie (already default_ccy). */
  holdingsByType: {
    valueByType(input: {
      tenantId: string;
      budgetId: string;
      defaultCurrency: string;
    }): Promise<{ holding_type: string; value_cents: bigint }[]>;
  };
  metaReader: {
    getBudgetMeta(
      budgetId: string,
    ): Promise<{ default_currency: string } | null>;
  };
}

export interface GetOverviewWealthInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  view: WealthView;
  now?: () => Date;
}

export interface OverviewWealthDTO {
  currency: string;
  view: WealthView;
  bucket: "monthly" | "daily";
  series: { label: string; value_cents: string }[];
  grow: { delta_cents: string; delta_pct: number | null };
  monthly_avg_grow_pct: number | null;
  dynamics: { label: string; pct: number | null }[];
  pie: { holding_type: string; value_cents: string }[] | null;
}

const MS_PER_DAY = 86_400_000;
/** Daily bucket when the range is within one calendar month or ≤ 62 days (D-20). */
const DAILY_SPAN_DAYS = 62;

function chooseBucket(from: string, to: string): "monthly" | "daily" {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    MS_PER_DAY;
  return sameMonth || days <= DAILY_SPAN_DAYS ? "daily" : "monthly";
}

/** UTC bucket label for a timestamp (matches the snapshot UTC-hour index choice). */
function labelOf(d: Date, bucket: "monthly" | "daily"): string {
  const iso = d.toISOString();
  return bucket === "monthly" ? iso.slice(0, 7) : iso.slice(0, 10);
}

/** % change a→b as a JS number, or null when the base is 0. */
function pctChange(prev: bigint, cur: bigint): number | null {
  if (prev === 0n) return null;
  return (Number(cur - prev) * 100) / Number(prev);
}

export function getOverviewWealth(deps: GetOverviewWealthDeps) {
  return async (
    input: GetOverviewWealthInput,
  ): Promise<Result<OverviewWealthDTO, Error>> => {
    try {
      const meta = await deps.metaReader.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));
      const ccy = meta.default_currency;
      const view = input.view;
      const bucket = chooseBucket(input.from, input.to);
      const now = input.now ? input.now() : new Date();

      const pick = (r: {
        capitalization_cents: bigint;
        investment_value_cents: bigint;
      }) =>
        view === "investments"
          ? r.investment_value_cents
          : r.capitalization_cents;

      const rows = await deps.snapshotRepo.seriesForRange(
        input.budgetId,
        input.from,
        input.to,
      );

      // Aggregate to the bucket: last-in-bucket wins (rows are captured_at-asc, so
      // a later write overwrites). value = the chosen field for that sample.
      const byBucket = new Map<string, bigint>();
      const order: string[] = [];
      for (const r of rows) {
        const label = labelOf(r.captured_at, bucket);
        if (!byBucket.has(label)) order.push(label);
        byBucket.set(label, pick(r));
      }

      // Live current point (D-04): override/extend the current bucket so the
      // rightmost point reflects the last few hours. Only when `now` falls within
      // the requested range (a past range keeps its last snapshot).
      const live = await deps.computeWealthNow({
        budgetId: input.budgetId,
        tenantId: input.tenantId,
        defaultCurrency: ccy,
        now,
      });
      const liveLabel = labelOf(now, bucket);
      const fromLabel = labelOf(new Date(`${input.from}T00:00:00Z`), bucket);
      const toLabel = labelOf(new Date(`${input.to}T00:00:00Z`), bucket);
      if (liveLabel >= fromLabel && liveLabel <= toLabel) {
        if (!byBucket.has(liveLabel)) order.push(liveLabel);
        byBucket.set(liveLabel, pick(live));
      }

      const labels = [...order].sort((a, b) => a.localeCompare(b));
      const series = labels.map((label) => ({
        label,
        value_cents: byBucket.get(label)!.toString(),
      }));

      // grow/loss (D-15): first vs last series value.
      const values = labels.map((l) => byBucket.get(l)!);
      const start = values[0] ?? 0n;
      const end = values[values.length - 1] ?? 0n;
      const delta = end - start;
      const grow = {
        delta_cents: delta.toString(),
        delta_pct: start === 0n ? null : (Number(delta) * 100) / Number(start),
      };

      // month-over-month dynamics (D-16): step per consecutive pair, labelled by
      // the later point. monthly_avg = mean of the non-null steps.
      const dynamics = labels.slice(1).map((label, i) => ({
        label,
        pct: pctChange(values[i]!, values[i + 1]!),
      }));
      const nonNull = dynamics
        .map((d) => d.pct)
        .filter((p): p is number => p !== null);
      const monthly_avg_grow_pct =
        nonNull.length === 0
          ? null
          : nonNull.reduce((a, b) => a + b, 0) / nonNull.length;

      // per-type pie — investments view only (D-18); null otherwise.
      let pie: OverviewWealthDTO["pie"] = null;
      if (view === "investments") {
        const byType = await deps.holdingsByType.valueByType({
          tenantId: input.tenantId,
          budgetId: input.budgetId,
          defaultCurrency: ccy,
        });
        pie = byType.map((t) => ({
          holding_type: t.holding_type,
          value_cents: t.value_cents.toString(),
        }));
      }

      return ok({
        currency: ccy,
        view,
        bucket,
        series,
        grow,
        monthly_avg_grow_pct,
        dynamics,
        pie,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
