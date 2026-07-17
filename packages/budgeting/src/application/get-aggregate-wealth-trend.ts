/**
 * get-aggregate-wealth-trend.ts — combined net-worth trend across budgets (Task 9).
 *
 * Pure application service: fans the per-budget Financial-Wealth series
 * (get-overview-wealth, via the `getWealthForBudget` dep) out across every
 * INCLUDED budget, converts each point to the user's display currency at
 * TODAY's rate (not the point's own date — isolates asset growth from FX
 * noise, matching getAllBudgetsAggregate's "now" FX hop) scaled by the
 * member's ownership share, then sums per label.
 *
 * Budgets don't always share the same snapshot history (a newly-added budget
 * has no early buckets), so labels are the UNION across included budgets in
 * first-seen order, and each budget's contribution is forward-filled: a
 * label before that budget's first data point contributes 0; a label after
 * its last known point carries that last value forward (wealth holds between
 * snapshots — same rule as get-overview-wealth's own carry-forward).
 */
import { Money } from "@budget/shared-kernel";
import type { Currency, FxProvider } from "@budget/shared-kernel";
import { centsToMoney, moneyToCents } from "./compute-budget-wealth-now";

export interface AggregateWealthPoint {
  label: string;
  value_cents: string;
}

export interface AggregateWealthTrend {
  display_currency: string;
  series: AggregateWealthPoint[];
  grow: { delta_cents: string; delta_pct: number };
}

export interface GetAggregateWealthTrendDeps {
  listForUser: (
    userId: string,
  ) => Promise<Array<{ id: string; default_currency: string }>>;
  getAggPrefsForUser: (
    userId: string,
  ) => Promise<
    Map<
      string,
      { ownership_share_pct: number; include_in_aggregation: boolean }
    >
  >;
  /** Per-budget Financial-Wealth series (adapts get-overview-wealth). */
  getWealthForBudget: (input: {
    tenantId: string;
    budgetId: string;
    range: string;
  }) => Promise<{
    currency: string;
    series: { label: string; value_cents: bigint }[];
  }>;
  displayCurrencyReader: {
    getDisplayCurrency: (userId: string) => Promise<string | null>;
  };
  fxProvider: FxProvider;
  /** Clock; defaults to new Date(). Rate + "today" label anchor. */
  now?: () => Date;
}

export interface GetAggregateWealthTrendInput {
  userId: string;
  range: string;
  includeIds: string[];
}

/** FX hop (today's rate) + ownership share — mirrors getAllBudgetsAggregate's
 *  toDisplayCcyShared, kept local since that helper isn't exported. */
function toDisplayCcyShared(
  cents: bigint,
  fromCcy: string,
  rate: string,
  displayCcy: string,
  sharePct: number,
): bigint {
  const converted = centsToMoney(cents, fromCcy).mul(rate);
  const inTarget = moneyToCents(
    Money.of(converted.amount.toFixed(), displayCcy as Currency),
  );
  return (inTarget * BigInt(sharePct)) / 100n;
}

export function getAggregateWealthTrend(deps: GetAggregateWealthTrendDeps) {
  return async (
    input: GetAggregateWealthTrendInput,
  ): Promise<AggregateWealthTrend> => {
    const now = deps.now ? deps.now() : new Date();
    const [budgets, prefs, displayCcyRaw] = await Promise.all([
      deps.listForUser(input.userId),
      deps.getAggPrefsForUser(input.userId),
      deps.displayCurrencyReader.getDisplayCurrency(input.userId),
    ]);
    const displayCcy = displayCcyRaw ?? budgets[0]?.default_currency ?? "USD";

    const included = budgets.filter((b) => input.includeIds.includes(b.id));

    // Per-budget: {label -> converted cents}, in the order the series arrived.
    const perBudget = await Promise.all(
      included.map(async (b) => {
        const w = await deps.getWealthForBudget({
          tenantId: b.id,
          budgetId: b.id,
          range: input.range,
        });
        const { rate } = await deps.fxProvider.rateAsOf(
          w.currency as Currency,
          displayCcy as Currency,
          now,
        );
        const share = prefs.get(b.id)?.ownership_share_pct ?? 100;
        const byLabel = new Map<string, bigint>();
        for (const pt of w.series) {
          byLabel.set(
            pt.label,
            toDisplayCcyShared(
              pt.value_cents,
              w.currency,
              rate,
              displayCcy,
              share,
            ),
          );
        }
        return byLabel;
      }),
    );

    // Union of labels, first-seen order across budgets.
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const m of perBudget) {
      for (const label of m.keys()) {
        if (!seen.has(label)) {
          seen.add(label);
          labels.push(label);
        }
      }
    }

    // Forward-fill each budget's projection across the full label axis (missing
    // leading buckets stay 0; a label after the last known point carries it).
    const projections = perBudget.map((m) => {
      let carried = 0n;
      return labels.map((label) => {
        if (m.has(label)) carried = m.get(label)!;
        return carried;
      });
    });

    const series = labels.map((label, i) => {
      let acc = 0n;
      for (const proj of projections) acc += proj[i]!;
      return { label, value_cents: acc.toString() };
    });

    const first = series.length ? BigInt(series[0]!.value_cents) : 0n;
    const last = series.length
      ? BigInt(series[series.length - 1]!.value_cents)
      : 0n;
    const delta = last - first;
    const grow = {
      delta_cents: delta.toString(),
      delta_pct: first === 0n ? 0 : (Number(delta) * 100) / Number(first),
    };

    return { display_currency: displayCcy, series, grow };
  };
}

const MS_PER_DAY = 86_400_000;

/** range code ("1M"/"3M"/"6M"/"1Y"/"All") → {from,to} YYYY-MM-DD, today-relative.
 *  Plain-Date equivalent of apps/web's overview-range.ts resolveRange (no shared
 *  package across the web/api boundary); unrecognized codes fall back to 6M.
 *  "All" caps at 5 years back — an arbitrary upper bound (get-overview-wealth has
 *  no span guard; it only switches bucket granularity at 31/93/366 days). */
export function rangeToFromTo(
  range: string,
  now: Date,
): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const monthsBack = (n: number): string =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1))
      .toISOString()
      .slice(0, 10);
  switch (range) {
    case "1M":
      return { from: monthsBack(0), to };
    case "3M":
      return { from: monthsBack(2), to };
    case "1Y":
      return { from: monthsBack(11), to };
    case "All":
    case "ALL":
      return {
        from: new Date(now.getTime() - 5 * 366 * MS_PER_DAY)
          .toISOString()
          .slice(0, 10),
        to,
      };
    case "6M":
    default:
      return { from: monthsBack(5), to };
  }
}
