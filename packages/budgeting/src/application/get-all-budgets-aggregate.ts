/**
 * get-all-budgets-aggregate.ts — cross-budget "all budgets" aggregate (Task 6).
 *
 * Pure application service: fans getOverviewCards out across every budget the
 * user belongs to, FX-converts each figure into the user's display currency, and
 * additionally scales WEALTH figures (net worth, investments, cash, reserves,
 * cushion) by the member's ownership share — flow figures (spent/left/overspent
 * this month) and counts/flags are NOT share-scaled (a shared budget's monthly
 * spend isn't "mine" to fractionalize, only the wealth sitting in it is).
 *
 * A missing/thrown FX rate degrades that budget's row to zeroed wealth figures
 * with fx_unavailable=true rather than failing the whole aggregate.
 */
import { Money } from "@budget/shared-kernel";
import type { Currency, FxProvider, Result } from "@budget/shared-kernel";
import type { OverviewCards } from "./get-overview-cards";
import { centsToMoney, moneyToCents } from "./compute-budget-wealth-now";

export interface AggregateBudgetRow {
  id: string;
  name: string;
  default_currency: string;
  member_count: number;
  my_share_pct: number;
  net_worth_cents: string;
  investments_cents: string;
  cash_cents: string;
  reserves_cents: string;
  cushion_cents: string;
  spent_month_cents: string;
  left_month_cents: string;
  overspent_total_cents: string;
  overspent_count: number;
  /** Top overspent category (single highest across the budget) — for the
   *  Overspent card caption. null when nothing is overspent. */
  overspent_top_name: string | null;
  overspent_top_cents: string;
  cushion_breached: boolean;
  reserves_status: "ok" | "short" | "surplus";
  /** FULL (NO ownership share) available-to-spend + reserves + reserve required —
   *  the Available-to-spend / Available-reserves / Overspent cards are operational
   *  household figures, not "my share of wealth", so they are un-fractionalized.
   *  (The share-scaled cash_cents/reserves_cents above still feed the wealth pie.) */
  cash_full_cents: string;
  reserves_full_cents: string;
  reserves_required_cents: string;
  cushion_required_cents: string;
  /** Cushion FULL saved + required + monthly need (NO ownership share) — the
   *  cushion coverage card is a household safety check ("do ALL cushion wallets
   *  cover ALL expected cushion months across every applied budget?"). monthly =
   *  required ÷ target_months (balance-independent) so an unfunded-but-budgeted
   *  cushion still adds its monthly need to the combined runway. */
  cushion_saved_full_cents: string;
  cushion_required_full_cents: string;
  cushion_monthly_cents: string;
  /** Cushion runway in months (per-budget ratio, NOT scaled). */
  cushion_real_months: number;
  /** Effective monthly planned spend (cushion-aware, share-scaled to match net
   *  worth) — the net-worth "money runway" divisor: netWorth ÷ Σ planned. */
  monthly_planned_cents: string;
  pending_tasks: number;
  health: "red" | "amber" | "green";
  included: boolean;
  fx_unavailable: boolean;
}

export interface AllBudgetsAggregate {
  display_currency: string;
  budgets: AggregateBudgetRow[];
}

export interface GetAllBudgetsAggregateDeps {
  listForUser: (userId: string) => Promise<
    Array<{
      id: string;
      name: string;
      default_currency: string;
      member_count: number;
      pendingTasksCount: number;
    }>
  >;
  getOverviewCardsForTenant: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<OverviewCards, Error>>;
  getAggPrefsForUser: (
    userId: string,
  ) => Promise<
    Map<
      string,
      { ownership_share_pct: number; include_in_aggregation: boolean }
    >
  >;
  displayCurrencyReader: {
    getDisplayCurrency: (userId: string) => Promise<string | null>;
  };
  fxProvider: FxProvider;
  /** Clock; defaults to new Date(). */
  now?: () => Date;
}

/** The 7 fields known before FX/cards even resolve — shared by the happy path and zeroRow. */
type BaseRowFields = Pick<
  AggregateBudgetRow,
  | "id"
  | "name"
  | "default_currency"
  | "member_count"
  | "my_share_pct"
  | "included"
  | "pending_tasks"
>;

/** FX hop only (Money×rate, banker's rounding — same path as compute-budget-wealth-now). */
function toDisplayCcy(
  cents: bigint,
  fromCcy: string,
  rate: string,
  displayCcy: string,
): bigint {
  const converted = centsToMoney(cents, fromCcy).mul(rate);
  return moneyToCents(
    Money.of(converted.amount.toFixed(), displayCcy as Currency),
  );
}

/** FX hop, then member ownership share — for WEALTH figures only. */
function toDisplayCcyShared(
  cents: bigint,
  fromCcy: string,
  rate: string,
  displayCcy: string,
  sharePct: number,
): string {
  const converted = toDisplayCcy(cents, fromCcy, rate, displayCcy);
  return ((converted * BigInt(sharePct)) / 100n).toString();
}

/** FX hop only, no share — for FLOW figures (spent/left/overspent). */
function toDisplayCcyFlow(
  cents: bigint,
  fromCcy: string,
  rate: string,
  displayCcy: string,
): string {
  return toDisplayCcy(cents, fromCcy, rate, displayCcy).toString();
}

function deriveHealth(c: OverviewCards): "red" | "amber" | "green" {
  if (c.overspent.count > 0 || (c.cushion.enabled && !c.cushion.covered))
    return "red";
  if (c.reserves.status === "short") return "amber";
  return "green";
}

function zeroRow(
  base: BaseRowFields,
  health: "red" | "amber" | "green",
  fxUnavailable: boolean,
): AggregateBudgetRow {
  return {
    ...base,
    net_worth_cents: "0",
    investments_cents: "0",
    cash_cents: "0",
    reserves_cents: "0",
    cushion_cents: "0",
    spent_month_cents: "0",
    left_month_cents: "0",
    overspent_total_cents: "0",
    overspent_count: 0,
    overspent_top_name: null,
    overspent_top_cents: "0",
    cushion_breached: false,
    reserves_status: "ok",
    cash_full_cents: "0",
    reserves_full_cents: "0",
    reserves_required_cents: "0",
    cushion_required_cents: "0",
    cushion_saved_full_cents: "0",
    cushion_required_full_cents: "0",
    cushion_monthly_cents: "0",
    cushion_real_months: 0,
    monthly_planned_cents: "0",
    health,
    fx_unavailable: fxUnavailable,
  };
}

export function getAllBudgetsAggregate(deps: GetAllBudgetsAggregateDeps) {
  return async (userId: string): Promise<AllBudgetsAggregate> => {
    const now = deps.now ? deps.now() : new Date();
    const [budgets, prefs, displayCcyRaw] = await Promise.all([
      deps.listForUser(userId),
      deps.getAggPrefsForUser(userId),
      deps.displayCurrencyReader.getDisplayCurrency(userId),
    ]);
    const displayCcy = displayCcyRaw ?? budgets[0]?.default_currency ?? "USD";

    const rows = await Promise.all(
      budgets.map(async (b): Promise<AggregateBudgetRow> => {
        const p = prefs.get(b.id) ?? {
          ownership_share_pct: 100,
          include_in_aggregation: true,
        };
        const base: BaseRowFields = {
          id: b.id,
          name: b.name,
          default_currency: b.default_currency,
          member_count: b.member_count,
          my_share_pct: p.ownership_share_pct,
          included: p.include_in_aggregation,
          pending_tasks: b.pendingTasksCount,
        };

        const cardsRes = await deps.getOverviewCardsForTenant({
          tenantId: b.id,
          budgetId: b.id,
        });
        if (cardsRes.isErr()) return zeroRow(base, "green", true);
        const c = cardsRes.value;

        let rate: string;
        try {
          rate = (
            await deps.fxProvider.rateAsOf(
              c.default_currency as Currency,
              displayCcy as Currency,
              now,
            )
          ).rate;
        } catch {
          return zeroRow(base, deriveHealth(c), true);
        }

        const s = p.ownership_share_pct;
        const ccy = c.default_currency;
        return {
          ...base,
          net_worth_cents: toDisplayCcyShared(
            c.capitalization_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          investments_cents: toDisplayCcyShared(
            c.investment_value_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          cash_cents: toDisplayCcyShared(
            c.available_to_spend_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          reserves_cents: toDisplayCcyShared(
            c.available_reserves_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          cushion_cents: toDisplayCcyShared(
            c.cushion.total_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          spent_month_cents: toDisplayCcyFlow(
            c.spendings.spent_cents,
            ccy,
            rate,
            displayCcy,
          ),
          left_month_cents: toDisplayCcyFlow(
            c.spendings.left_cents,
            ccy,
            rate,
            displayCcy,
          ),
          overspent_total_cents: toDisplayCcyFlow(
            c.overspent.total_cents,
            ccy,
            rate,
            displayCcy,
          ),
          overspent_count: c.overspent.count,
          overspent_top_name: c.overspent.top[0]?.name ?? null,
          overspent_top_cents: c.overspent.top[0]
            ? toDisplayCcyFlow(
                c.overspent.top[0].over_amount_cents,
                ccy,
                rate,
                displayCcy,
              )
            : "0",
          cushion_breached: c.cushion.enabled && !c.cushion.covered,
          reserves_status: c.reserves.status,
          cash_full_cents: toDisplayCcyFlow(
            c.available_to_spend_cents,
            ccy,
            rate,
            displayCcy,
          ),
          reserves_full_cents: toDisplayCcyFlow(
            c.available_reserves_cents,
            ccy,
            rate,
            displayCcy,
          ),
          reserves_required_cents: toDisplayCcyFlow(
            c.reserves.required_cents,
            ccy,
            rate,
            displayCcy,
          ),
          cushion_required_cents: toDisplayCcyShared(
            c.cushion.required_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          cushion_saved_full_cents: toDisplayCcyFlow(
            c.cushion.total_cents,
            ccy,
            rate,
            displayCcy,
          ),
          cushion_required_full_cents: toDisplayCcyFlow(
            c.cushion.required_cents,
            ccy,
            rate,
            displayCcy,
          ),
          cushion_monthly_cents: toDisplayCcyFlow(
            c.cushion.monthly_cents,
            ccy,
            rate,
            displayCcy,
          ),
          cushion_real_months: c.cushion.real_months,
          monthly_planned_cents: toDisplayCcyShared(
            c.monthly_planned_cents,
            ccy,
            rate,
            displayCcy,
            s,
          ),
          health: deriveHealth(c),
          fx_unavailable: false,
        };
      }),
    );

    return { display_currency: displayCcy, budgets: rows };
  };
}
