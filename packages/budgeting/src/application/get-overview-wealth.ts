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
    /** Last snapshot strictly BEFORE `from` — seeds the carry-forward + dynamics
     *  baseline so a range that opens before its first in-range tick shows the
     *  prior value instead of 0 (round 24 items 2/3). */
    openingBefore(
      budgetId: string,
      from: string,
    ): Promise<WealthSnapshotRow | null>;
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
  /** Cost basis of the tracked investments = each holding's buy cost (buy_price ×
   *  quantity, FX→budget ccy), keyed by the holding's creation DATE ('YYYY-MM-DD')
   *  so it enters exactly when the holding starts appearing in the value series.
   *  Powers the "invested" metric (Σ cost) and — when net=true — is subtracted
   *  from every value point so the series/grow/dynamics show real P/L (value −
   *  cost). null when the budget has NO holdings. Investments view only. */
  investmentCostBasis?: (input: {
    tenantId: string;
    budgetId: string;
    defaultCurrency: string;
  }) => Promise<Map<string, bigint> | null>;
}

export interface GetOverviewWealthInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  view: WealthView;
  /** Investments view: subtract contributions (money paid in) from every value
   *  point so the series/growth/dynamics show real market movement. */
  net?: boolean;
  now?: () => Date;
}

export interface OverviewWealthDTO {
  currency: string;
  view: WealthView;
  bucket: "1h" | "12h" | "24h";
  /** Granularity of the % CHANGE (dynamics) chart — coarser than the value bucket. */
  dynamicsBucket: "daily" | "monthly" | "yearly";
  series: { label: string; value_cents: string }[];
  /** Day P/L for the hero card — measured from the first REAL in-range snapshot. */
  grow: { delta_cents: string; delta_pct: number | null };
  /** Financial-Wealth section growth — anchored on the OPENING value (the chart's
   *  leftmost point / value entering the range), so the % agrees with the chart
   *  instead of the first real snapshot (r30 item 2). Falls back to `grow` when
   *  there is no prior snapshot. */
  grow_from_open: { delta_cents: string; delta_pct: number | null };
  monthly_avg_grow_pct: number | null;
  /** Per-bucket change: % and the signed money delta (for the tooltip amount). */
  dynamics: { label: string; pct: number | null; delta_cents: string }[];
  pie: { holding_type: string; value_cents: string }[] | null;
  /** Σ contributions to investing over the range (Investments-category spend);
   *  null when the budget has no Investments category. Investments view only.
   *  When net=true, `series`/`grow`/`dynamics` are already reduced by contributions. */
  invested_cents: string | null;
}

const MS_PER_DAY = 86_400_000;
const HOUR_MS = 3_600_000;

/** Snapshot bucket size by range span (user spec): 1h for ≤1 month, 12h for ~3
 *  months, 24h for 6 months+. So the capitalization/investment series shows
 *  intraday points on short ranges and thins on long ones. */
function bucketHours(from: string, to: string): 1 | 12 | 24 {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    MS_PER_DAY;
  if (days <= 31) return 1;
  if (days <= 93) return 12;
  return 24;
}

/** Floor a timestamp to its UTC bucket boundary → a lexicographically-ordered label
 *  (order == chronological). 24h → "YYYY-MM-DD" (a date); 1h/12h → "YYYY-MM-DDTHH"
 *  (the bucket's start hour — 00 or 12 for the 12h buckets). */
function bucketLabel(d: Date, hours: number): string {
  const step = hours * HOUR_MS;
  const iso = new Date(Math.floor(d.getTime() / step) * step).toISOString();
  return hours >= 24 ? iso.slice(0, 10) : iso.slice(0, 13);
}

/** Enumerate EVERY value-bucket label across [from,to] at `hours` — so the value
 *  chart spans the whole range, zero-filled where there is no snapshot (item 5). */
function valueGrid(from: string, to: string, hours: number): string[] {
  const step = hours * HOUR_MS;
  const start = Math.floor(Date.parse(`${from}T00:00:00Z`) / step) * step;
  const end = Date.parse(`${to}T23:59:59Z`);
  const out: string[] = [];
  for (let t = start; t <= end; t += step) {
    out.push(bucketLabel(new Date(t), hours));
  }
  return out;
}

type DynBucket = "daily" | "monthly" | "yearly";
/** The % CHANGE chart uses a COARSER, calendar bucket than the value series (item
 *  1): 1M → day-over-day, 3M…1Y → month-over-month, >1Y → year-over-year. */
function dynamicsBucketOf(from: string, to: string): DynBucket {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    MS_PER_DAY;
  if (days <= 31) return "daily";
  if (days <= 366) return "monthly";
  return "yearly";
}
function dynLabelOf(d: Date, b: DynBucket): string {
  const iso = d.toISOString();
  return b === "yearly"
    ? iso.slice(0, 4)
    : b === "monthly"
      ? iso.slice(0, 7)
      : iso.slice(0, 10);
}
/** The calendar bucket immediately BEFORE `label` — used to test whether the
 *  opening snapshot is the first in-range bucket's contiguous predecessor. */
function prevDynLabel(label: string, b: DynBucket): string {
  if (b === "yearly") return String(Number(label) - 1);
  if (b === "monthly") {
    const [y, m] = label.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  return new Date(Date.parse(`${label}T00:00:00Z`) - MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
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
      const hours = bucketHours(input.from, input.to);
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
      // Opening value = the last snapshot BEFORE the range. Seeds the carry-forward
      // (chart starts at last month's value, not 0 — item 2) and the dynamics
      // baseline (the first in-range bucket gets a % change — item 3).
      const opening = await deps.snapshotRepo.openingBefore(
        input.budgetId,
        input.from,
      );
      // Cost basis of the holdings (buy cost, FX→budget ccy) keyed by creation
      // DATE: powers the "invested" metric (Σ cost) and — when net=true — is
      // subtracted from each value point so the series/grow/dynamics show real P/L
      // (value − cost), not book value inflated by the money paid in. Each
      // holding's cost enters on its creation day, exactly when its value starts
      // appearing in the snapshots. null (⇒ no adjustment) when no holdings.
      const costMap =
        view === "investments" && deps.investmentCostBasis
          ? await deps.investmentCostBasis({
              tenantId: input.tenantId,
              budgetId: input.budgetId,
              defaultCurrency: ccy,
            })
          : null;
      const invested_cents = costMap
        ? [...costMap.values()].reduce((a, b) => a + b, 0n).toString()
        : null;
      const costDates = costMap
        ? [...costMap.keys()].sort((a, b) => a.localeCompare(b))
        : [];
      // Cumulative cost of holdings created on/before a date (0 unless net=true).
      const costUpTo = (d: Date): bigint => {
        if (!costMap || !input.net) return 0n;
        const day = d.toISOString().slice(0, 10);
        let s = 0n;
        for (const dd of costDates) {
          if (dd <= day) s += costMap.get(dd)!;
          else break;
        }
        return s;
      };
      const pickAdj = (
        r: { capitalization_cents: bigint; investment_value_cents: bigint },
        d: Date,
      ) => pick(r) - costUpTo(d);

      const openingVal = opening ? pickAdj(opening, opening.captured_at) : null;

      // VALUE series aggregated at the value bucket (last-in-bucket wins).
      const byValue = new Map<string, bigint>();
      for (const r of rows)
        byValue.set(
          bucketLabel(r.captured_at, hours),
          pickAdj(r, r.captured_at),
        );

      // Live current point (D-04): overrides the current value bucket so the
      // rightmost point reflects the last few hours. Only when `now` is in range.
      const live = await deps.computeWealthNow({
        budgetId: input.budgetId,
        tenantId: input.tenantId,
        defaultCurrency: ccy,
        now,
      });
      const liveLabel = bucketLabel(now, hours);
      const fromLabel = bucketLabel(new Date(`${input.from}T00:00:00Z`), hours);
      // to is an inclusive day → compare against the LAST bucket of that day.
      const toLabel = bucketLabel(new Date(`${input.to}T23:59:59Z`), hours);
      const liveInRange = liveLabel >= fromLabel && liveLabel <= toLabel;
      if (liveInRange) byValue.set(liveLabel, pickAdj(live, now));

      // grow/loss (D-15) from the DATA points only (first vs last real value) — not
      // the zero-fill, so leading empty buckets don't turn grow into "0 → net worth".
      const dataLabels = [...byValue.keys()].sort((a, b) => a.localeCompare(b));
      const gStart = byValue.get(dataLabels[0]!) ?? 0n;
      const gEnd = byValue.get(dataLabels[dataLabels.length - 1]!) ?? 0n;
      const grow = {
        delta_cents: (gEnd - gStart).toString(),
        delta_pct:
          gStart === 0n ? null : (Number(gEnd - gStart) * 100) / Number(gStart),
      };

      // series: the FULL range grid so the chart spans [from,to] (item 5). CARRY
      // the last known value across empty buckets — wealth holds between snapshots;
      // dropping to 0 in a gap (e.g. a missed hourly tick) would draw a false crash.
      // Seed with the opening value so leading buckets show last month's value, not
      // 0 (item 2); only 0 when there is NO prior snapshot at all ("not tracked yet").
      let carried = openingVal ?? 0n;
      const series = valueGrid(input.from, input.to, hours).map((label) => {
        if (byValue.has(label)) carried = byValue.get(label)!;
        return { label, value_cents: carried.toString() };
      });

      // Financial-Wealth section growth is measured from the chart's ACTUAL leftmost
      // point (series[0]) to the current value, so the number always equals what the
      // line draws (chart-end − chart-start). With a prior snapshot that's the opening
      // value ("since month start"); with none, it's the zero-fill $0 edge → the full
      // amount with an undefined % (r30b user choice — "measure from the $0 edge").
      const chartStart = series.length ? BigInt(series[0]!.value_cents) : 0n;
      const grow_from_open = {
        delta_cents: (gEnd - chartStart).toString(),
        delta_pct:
          chartStart === 0n
            ? null
            : (Number(gEnd - chartStart) * 100) / Number(chartStart),
      };

      // dynamics (% change) at its OWN coarser calendar bucket (item 1). Labelled by
      // the later bucket.
      const dynBucket = dynamicsBucketOf(input.from, input.to);
      let dynamics: {
        label: string;
        pct: number | null;
        delta_cents: string;
      }[];
      if (dynBucket === "daily") {
        // 1M → a bar for EVERY day in range, using the CARRIED series value (the
        // series holds a value for each day incl. gaps via carry-forward, which never
        // fakes a −100%). So the month shows all its days, not just the sparse days
        // that happen to have a raw snapshot (item 4).
        const byDay = new Map<string, bigint>();
        for (const p of series)
          byDay.set(p.label.slice(0, 10), BigInt(p.value_cents));
        const dayLabels = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
        const dayVals = dayLabels.map((l) => byDay.get(l)!);
        dynamics = dayLabels.slice(1).map((label, i) => ({
          label,
          pct: pctChange(dayVals[i]!, dayVals[i + 1]!),
          delta_cents: (dayVals[i + 1]! - dayVals[i]!).toString(),
        }));
      } else {
        // monthly / yearly → step between consecutive DATA buckets only (a zero-fill
        // gap would fake a −100%; snapshots are sparse but real on long ranges).
        const byDyn = new Map<string, bigint>();
        for (const r of rows)
          byDyn.set(
            dynLabelOf(r.captured_at, dynBucket),
            pickAdj(r, r.captured_at),
          );
        if (liveInRange)
          byDyn.set(dynLabelOf(now, dynBucket), pickAdj(live, now));
        let dynLabels = [...byDyn.keys()].sort((a, b) => a.localeCompare(b));
        // Give the FIRST in-range bucket a predecessor — but ONLY when the opening
        // snapshot lands in the immediately-preceding calendar bucket. Then that first
        // bar is a true per-period change (dense monthly history — item 4), instead of
        // being dropped for lack of a predecessor. A NON-contiguous opening (a far-back
        // seed) is still skipped so the first bar never spans a gap into a giant
        // outlier (r28 item 1 — a seed-data jump swamped every real per-period change).
        if (opening && openingVal !== null && dynLabels.length) {
          const openLabel = dynLabelOf(opening.captured_at, dynBucket);
          if (openLabel === prevDynLabel(dynLabels[0]!, dynBucket)) {
            byDyn.set(openLabel, openingVal);
            dynLabels = [...byDyn.keys()].sort((a, b) => a.localeCompare(b));
          }
        }
        const dynVals = dynLabels.map((l) => byDyn.get(l)!);
        dynamics = dynLabels.slice(1).map((label, i) => ({
          label,
          pct: pctChange(dynVals[i]!, dynVals[i + 1]!),
          delta_cents: (dynVals[i + 1]! - dynVals[i]!).toString(),
        }));
      }
      const nonNull = dynamics
        .map((d) => d.pct)
        .filter((p): p is number => p !== null);
      // Average PERIOD growth is the GEOMETRIC mean of the per-period returns —
      // (∏(1 + rᵢ))^(1/n) − 1 — NOT the arithmetic mean, because growth compounds.
      // For contiguous periods this telescopes to (last/first)^(1/n) − 1, so e.g.
      // a total ×2.75 over 7 periods averages 2.75^(1/7) − 1 per period, not the
      // (overstated) simple average of the step %s.
      const monthly_avg_grow_pct = ((): number | null => {
        if (nonNull.length === 0) return null;
        const product = nonNull.reduce((acc, p) => acc * (1 + p / 100), 1);
        if (product < 0) return null; // a ≤ −100% period → geometric mean undefined
        return (Math.pow(product, 1 / nonNull.length) - 1) * 100;
      })();

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
        bucket: `${hours}h` as "1h" | "12h" | "24h",
        dynamicsBucket: dynBucket,
        series,
        grow,
        grow_from_open,
        monthly_avg_grow_pct,
        dynamics,
        pie,
        invested_cents,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
