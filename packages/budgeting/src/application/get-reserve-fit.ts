/**
 * get-reserve-fit.ts — "is each category's reserve the right size?" (260804).
 *
 * The sibling of get-overview-planned: that one tells the member whether a LIMIT
 * is right, this one assumes the limit is right and asks whether the BUFFER
 * around it is. Both risks are real — a reserve too small means overspend, a
 * reserve too large is money the engine will never hand back on its own (accrual
 * is uncapped: `R += left` every closed month, forever).
 *
 * needed = deepest cumulative trough of `left − overage` (see domain/reserve-fit.ts)
 * held   = the category's R right now, from the reserve engine
 * gap    = held − needed   → negative: short. positive: trimmable.
 *
 * One-off spend is the member's call, not a statistic's: an insurance charge is
 * rare and certain, a parachute jump is rare and not. So the large transactions
 * in range ride along with each row, ticked ON by default (counted), and the
 * budget's un-ticks are subtracted from spend before the walk. Default-counted
 * means an untouched chart can only ever ask you to hold too MUCH, never too
 * little (user decision, 260804).
 *
 * Analysis only: nothing here changes real reserve balances, used, or overspent.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { reserveFit, type ReserveFitMonth } from "../domain/reserve-fit";
import { projectRecurring } from "../domain/recurring-projection";
import type { ReservePositionsResult } from "./get-reserve-positions";
import type { OverviewPlannedRepo } from "./get-overview-planned";

/** A transaction big enough to be worth a member's judgement. */
export interface LargeTransactionRow {
  ledger_id: string;
  category_id: string;
  transaction_date: string; // YYYY-MM-DD
  note: string | null;
  amount_cents: bigint;
  /** The rule's cadence when this spend came from a recurring rule — evidence
   *  that it WILL come round again (yearly insurance), so the member does not
   *  have to remember. null = one-off as far as the app knows. */
  recurring_cadence: string | null;
  /** Already un-ticked for this budget. */
  excluded: boolean;
}

export interface ReserveFitExclusionsRepo {
  largeTransactions(input: {
    budgetId: string;
    from: string;
    to: string;
  }): Promise<LargeTransactionRow[]>;
}

/** How far ahead the walk carries known commitments. A year catches every
 *  annual renewal exactly once — the charge a backwards-only chart is blind to. */
export const FORWARD_MONTHS = 12;

export interface GetReserveFitDeps {
  overviewRepo: Pick<
    OverviewPlannedRepo,
    "categoryWindows" | "monthlyPlannedByCategory" | "monthlySpendByCategory"
  >;
  /** Active recurring rules — the spend each category is already committed to. */
  activeRecurringRules: (budgetId: string) => Promise<
    {
      category_id: string | null;
      amount_cents: bigint;
      cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
      yearly_month: number | null;
      /** The rule's own note, and the category it points at. Both optional:
       *  a rule with NO category has no category name, which is exactly the
       *  case `unassigned_recurring` reports. The repo has always selected
       *  them (overview-repo `rr.note AS rule_name`, `c.name AS name`); this
       *  type simply never said so, and the read below did not compile. */
      rule_name?: string | null;
      name?: string | null;
    }[]
  >;
  now?: () => Date;
  exclusionsRepo: ReserveFitExclusionsRepo;
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  metaReader: {
    getBudgetMeta(
      budgetId: string,
    ): Promise<{ default_currency: string } | null>;
  };
}

export interface GetReserveFitInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface ReserveFitRowDTO {
  category_id: string;
  name: string;
  held_cents: string;
  needed_cents: string;
  /** held − needed. Negative = short, positive = trimmable. */
  gap_cents: string;
  worst_month: string | null;
  worst_overage_cents: string;
  overage_months: number;
  months_counted: number;
  large_transactions: {
    ledger_id: string;
    transaction_date: string;
    note: string | null;
    amount_cents: string;
    recurring_cadence: string | null;
    excluded: boolean;
  }[];
}

export interface ReserveFitDTO {
  currency: string;
  rows: ReserveFitRowDTO[];
  /** Active recurring rules with NO category. They are real commitments but
   *  belong to no buffer, so they can size nothing — the chart names them so the
   *  member can assign one rather than wonder why a charge is uncounted
   *  (user report, 260804: a 2,500 September car insurance sat uncategorised). */
  unassigned_recurring: { name: string; amount_cents: string }[];
}

/** 'YYYY-MM' + n months. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

export function getReserveFit(deps: GetReserveFitDeps) {
  return async (
    input: GetReserveFitInput,
  ): Promise<Result<ReserveFitDTO, Error>> => {
    try {
      const { budgetId, from, to } = input;
      const [meta, windows, planned, spend, large, rules, positionsResult] =
        await Promise.all([
          deps.metaReader.getBudgetMeta(budgetId),
          deps.overviewRepo.categoryWindows(budgetId),
          deps.overviewRepo.monthlyPlannedByCategory(budgetId, from, to),
          deps.overviewRepo.monthlySpendByCategory(budgetId, from, to),
          deps.exclusionsRepo.largeTransactions({ budgetId, from, to }),
          deps.activeRecurringRules(budgetId),
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId,
          }),
        ]);
      if (positionsResult.isErr()) return err(positionsResult.error);
      const positions = positionsResult.value.positions;

      // Spend to subtract, per (category, month) — only what the budget un-ticked.
      const excludedByCell = new Map<string, bigint>();
      for (const t of large) {
        if (!t.excluded) continue;
        const key = `${t.category_id}|${t.transaction_date.slice(0, 7)}`;
        excludedByCell.set(
          key,
          (excludedByCell.get(key) ?? 0n) + t.amount_cents,
        );
      }

      const limitByCell = new Map<string, bigint>();
      for (const p of planned)
        limitByCell.set(`${p.category_id}|${p.month}`, p.planned_cents);
      const spendByCell = new Map<string, bigint>();
      for (const s of spend)
        spendByCell.set(`${s.category_id}|${s.month}`, s.spent_cents);

      // Every month a category has either a limit or spend in — a month with
      // neither says nothing about the buffer.
      const monthsByCat = new Map<string, Set<string>>();
      for (const key of [...limitByCell.keys(), ...spendByCell.keys()]) {
        const [catId, month] = key.split("|") as [string, string];
        const set = monthsByCat.get(catId) ?? new Set<string>();
        set.add(month);
        monthsByCat.set(catId, set);
      }

      // Used twice: the month still running is dropped from the walk, and the
      // forward leg starts after BOTH the range and today, so a member reading an
      // old range still gets the real future rather than a replayed one.
      const nowMonth = (deps.now?.() ?? new Date()).toISOString().slice(0, 7);
      const lastMonth = to.slice(0, 7) > nowMonth ? to.slice(0, 7) : nowMonth;
      const committed = projectRecurring(
        rules,
        addMonths(lastMonth, 1),
        FORWARD_MONTHS,
      );

      const rows: ReserveFitRowDTO[] = [];
      for (const w of windows) {
        const position = positions.get(w.category_id);
        // No position at all = the engine does not track it (archived before the
        // range, or reserves disabled); excluded = the member opted it out.
        if (!position || position.reserveExcluded) continue;
        // Archived before the window even opened: nothing here to size, and the
        // reserve the engine still carries for it is a Reserves-tab matter
        // ("імперія", user 260804). A category archived DURING the range keeps
        // its bar — those months are real history.
        if (w.archived_month !== null && w.archived_month < from.slice(0, 7))
          continue;

        const all = [...(monthsByCat.get(w.category_id) ?? [])];
        // Half a month of spend against a whole month of limit fakes a surplus
        // that refills the walk, so the month still running is left out — unless
        // it is the only month there is, when a weak signal beats none at all
        // (user, 260804; the same rule the planned averages follow).
        const closed = all.filter((m) => m !== nowMonth);
        const months: ReserveFitMonth[] = (
          closed.length > 0 ? closed : all
        ).map((month) => {
          const key = `${w.category_id}|${month}`;
          const spent =
            (spendByCell.get(key) ?? 0n) - (excludedByCell.get(key) ?? 0n);
          return {
            month,
            limitCents: limitByCell.get(key) ?? 0n,
            // An excluded transaction can outrun the month's other spend only if
            // something was refunded; floor it rather than credit the walk.
            spentCents: spent > 0n ? spent : 0n,
          };
        });

        // Forward months assume the PLAN IS MET — spend equals the limit, so a
        // quiet future neither drains nor refills the buffer. On top of that:
        //   ROUTINE commitments (monthly and oftener) are what the limit was set
        //   for, so only their EXCESS over it counts;
        //   RARE ones (yearly) land on top of an ordinary month — September
        //   still has its fuel and parking, so the whole charge counts.
        // Sizing at "charge − limit" left exactly the charge covered and the
        // rest of that month uncovered (user, 260804).
        const latestLimit = months.length
          ? (months.reduce((a, b) => (a.month > b.month ? a : b)).limitCents ??
            0n)
          : 0n;
        const future: ReserveFitMonth[] = [
          ...(committed.get(w.category_id) ?? []),
        ].map(([month, c]) => {
          const routineExcess =
            c.routine > latestLimit ? c.routine - latestLimit : 0n;
          return {
            month,
            limitCents: latestLimit,
            spentCents: latestLimit + c.onTop + routineExcess,
          };
        });

        // Two walks, not one. Running them as a single line let months of past
        // underspend pay for a charge that has not happened yet — but that
        // surplus IS the reserve already held, which is the other side of this
        // comparison, so counting it here answered "you need nothing" to a
        // category with a 2,500 renewal coming (user report, 260804). The buffer
        // has to survive the worst past run AND the coming year's known lumps,
        // so the harder of the two is what must be held.
        const past = reserveFit(months);
        const ahead = reserveFit(future);
        const fit = {
          ...(past.neededCents >= ahead.neededCents ? past : ahead),
          neededCents:
            past.neededCents >= ahead.neededCents
              ? past.neededCents
              : ahead.neededCents,
          // The audit trail stays on the months that actually happened when
          // history is the binding constraint, and moves to the charge ahead
          // when that is.
          monthsCounted: past.monthsCounted,
        };
        // Nothing spent, nothing planned, nothing committed and nothing held:
        // an archived test category ("ымо", "імперія") that would otherwise sit
        // at 0% saying nothing (user, 260804). A dead category that still HOLDS
        // money stays — that money can be freed.
        if (
          months.length === 0 &&
          !committed.has(w.category_id) &&
          position.reserveCents === 0n
        ) {
          continue;
        }
        // Only spend big enough to be WHY a buffer exists is worth a decision.
        // Half a typical month's limit: below that, un-ticking it cannot move
        // the number, and a list full of coffees hides the one that matters.
        const avgLimit =
          months.length > 0
            ? months.reduce((acc, mo) => acc + mo.limitCents, 0n) /
              BigInt(months.length)
            : 0n;
        const worthDeciding = (amount: bigint) => amount * 2n >= avgLimit;
        rows.push({
          category_id: w.category_id,
          name: w.name,
          held_cents: position.reserveCents.toString(),
          needed_cents: fit.neededCents.toString(),
          gap_cents: (position.reserveCents - fit.neededCents).toString(),
          worst_month: fit.worstMonth,
          worst_overage_cents: fit.worstOverageCents.toString(),
          overage_months: fit.overageMonths,
          months_counted: fit.monthsCounted,
          large_transactions: large
            .filter(
              (t) =>
                t.category_id === w.category_id &&
                worthDeciding(t.amount_cents),
            )
            .sort((a, b) => (a.amount_cents < b.amount_cents ? 1 : -1))
            .map((t) => ({
              ledger_id: t.ledger_id,
              transaction_date: t.transaction_date,
              note: t.note,
              amount_cents: t.amount_cents.toString(),
              recurring_cadence: t.recurring_cadence,
              excluded: t.excluded,
            })),
        });
      }

      // Worst fit first: the rows that need money, then the ones holding it idle.
      rows.sort((a, b) => Number(BigInt(a.gap_cents) - BigInt(b.gap_cents)));

      return ok({
        currency: meta?.default_currency ?? "EUR",
        rows,
        unassigned_recurring: rules
          .filter((r) => !r.category_id && r.amount_cents > 0n)
          .map((r) => ({
            name: r.rule_name ?? r.name ?? "",
            amount_cents: r.amount_cents.toString(),
          })),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
