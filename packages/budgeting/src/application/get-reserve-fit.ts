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
import { smallestSufficientLimit } from "../domain/suggest-limit";
import { reserveNeededToday } from "../domain/reserve-requirement";
import { projectScheduledPayments } from "../domain/scheduled-payment-projection";
import type { ReservePositionsResult } from "./get-reserve-positions";
import type { OverviewPlannedRepo } from "./get-overview-planned";

/** A transaction big enough to be worth a member's judgement. */
export interface LargeTransactionRow {
  ledger_id: string;
  category_id: string;
  transaction_date: string; // YYYY-MM-DD
  note: string | null;
  amount_cents: bigint;
  /** The rule's cadence when this spend came from a scheduled rule — evidence
   *  that it WILL come round again (yearly insurance), so the member does not
   *  have to remember. null = one-off as far as the app knows. */
  scheduled_cadence: string | null;
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

/** The FLOOR on how far ahead the walk carries known commitments. A year
 *  catches every annual renewal exactly once — the charge a backwards-only
 *  chart is blind to. It stopped being a ceiling on 260807: a one-time payment
 *  can sit two years out, and a buffer that never sees it is sized wrong. */
export const FORWARD_MONTHS = 12;

/** Whole months from `from` to `to` ('YYYY-MM'), never negative. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export interface GetReserveFitDeps {
  overviewRepo: Pick<
    OverviewPlannedRepo,
    "categoryWindows" | "monthlyPlannedByCategory" | "monthlySpendByCategory"
  >;
  /** Active scheduled rules — the spend each category is already committed to. */
  activeScheduledPayments: (budgetId: string) => Promise<
    {
      category_id: string | null;
      amount_cents: bigint;
      cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
      yearly_month: number | null;
      /** ONCE has no rhythm to derive a month from — its date is the month it
       *  lands in, so the forward walk needs it to reserve for it at all. */
      next_due_date?: string | null;
      /** The rule's own note, and the category it points at. Both optional:
       *  a rule with NO category has no category name, which is exactly the
       *  case `unassigned_scheduled` reports. The repo has always selected
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
  /** The limit that would keep this category solvent across the whole runway,
   *  and what moving to it costs or frees each month. null = today's limit
   *  already is that limit, so there is nothing to say (260807). */
  suggested_limit_cents: string | null;
  /** What this reserve would need at that limit — always at least
   *  `needed_cents` when the limit comes down, because a lower limit accrues
   *  less. The pair is what makes "lower it AND withdraw" safe. */
  suggested_needed_cents: string | null;
  suggested_delta_cents: string | null;
  suggested_over_months: number | null;
  suggested_direction: "raise" | "lower" | null;
  overage_months: number;
  months_counted: number;
  large_transactions: {
    ledger_id: string;
    transaction_date: string;
    note: string | null;
    amount_cents: string;
    scheduled_cadence: string | null;
    excluded: boolean;
  }[];
}

export interface ReserveFitDTO {
  currency: string;
  rows: ReserveFitRowDTO[];
  /** Active scheduled rules with NO category. They are real commitments but
   *  belong to no buffer, so they can size nothing — the chart names them so the
   *  member can assign one rather than wonder why a charge is uncounted
   *  (user report, 260804: a 2,500 September car insurance sat uncategorised). */
  unassigned_scheduled: { name: string; amount_cents: string }[];
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
          deps.activeScheduledPayments(budgetId),
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
      const scheduledByCell = new Map<string, bigint>();
      for (const s of spend) {
        spendByCell.set(`${s.category_id}|${s.month}`, s.spent_cents);
        // The half that came from a scheduled payment. The schedule projects
        // those forward on their own, so history must not charge them again —
        // an insurance category was told to hold 11,000 for a policy that was
        // counted once through its own past and once through its own future
        // (audit, 260807). A payload cached before the column existed replays
        // without it and simply reads as "none of it was scheduled".
        scheduledByCell.set(
          `${s.category_id}|${s.month}`,
          s.scheduled_cents ?? 0n,
        );
      }

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
      // Far enough to reach the last thing scheduled, and never less than a
      // year — so an ordinary yearly renewal is still caught when nothing sits
      // further out (260807).
      const forwardFrom = addMonths(lastMonth, 1);
      const furthest = rules.reduce(
        (far, r) =>
          r.next_due_date && r.next_due_date.slice(0, 7) > far
            ? r.next_due_date.slice(0, 7)
            : far,
        forwardFrom,
      );
      const windowMonths = Math.max(
        FORWARD_MONTHS,
        monthsBetween(forwardFrom, furthest) + 1,
      );
      const committed = projectScheduledPayments(rules, forwardFrom, windowMonths);
      /** Every month of the runway in order — the ones with nothing due too. */
      const forwardWindow = Array.from({ length: windowMonths }, (_, i) =>
        addMonths(forwardFrom, i),
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
        // The buffer is held for what comes NEXT, so every month is judged
        // against the limit in force TODAY — not the one it happened to have.
        // Reading history at its own retired limits quoted a buffer for a budget
        // nobody runs any more: a category left at 50/month all year while it
        // actually ran at ~110 was asked to hold 662, and against the 110 the
        // household had already moved to, the same months ask for nothing
        // (user, 260807). Same definition of "current" as the planned chart's
        // basis switch — the limit in the RUNNING month, not the last month of
        // the range, so a past window still reports today's limit.
        // A category with no current limit (archived, or never given one) keeps
        // its own history: there is nothing current to judge it against, and
        // treating that as a limit of zero would turn all its spend into overage.
        const currentLimit =
          limitByCell.get(`${w.category_id}|${nowMonth}`) ??
          [...all]
            .sort()
            .map((m) => limitByCell.get(`${w.category_id}|${m}`))
            .filter((v): v is bigint => v !== undefined)
            .pop() ??
          0n;
        // Half a month of spend against a whole month of limit fakes a surplus
        // that refills the walk, so the month still running is left out — unless
        // it is the only month there is, when a weak signal beats none at all
        // (user, 260804; the same rule the planned averages follow).
        // What this category is committed to every month, from the rules
        // themselves. Needed BEFORE the history is read — see the floor below.
        const commitments = [...(committed.get(w.category_id) ?? [])];
        const routineRate = commitments[0]?.[1].routine ?? 0n;

        const closed = all.filter((m) => m !== nowMonth);
        const months: ReserveFitMonth[] = (
          closed.length > 0 ? closed : all
        ).map((month) => {
          const key = `${w.category_id}|${month}`;
          // ORDINARY spend: the month's total, less the one-offs the household
          // un-ticked, less what a scheduled payment took. What is left is what
          // this category costs by habit, and it is the only part history can
          // tell us that the schedule cannot.
          //
          // The ledger's own link is the best evidence of what a rule took, but
          // it only exists from the day the rule was recorded. Alimony paid for
          // a year and scheduled last month leaves eleven months whose "habit"
          // silently contains it — and the forward walk then charged the same
          // 2,000 again, telling a household with a 2,500 limit and 2,215 of
          // spend to raise that limit by 1,314 (user screenshot, 260808).
          //
          // So a ROUTINE rule — one that fires every month or oftener — puts a
          // FLOOR under what each month's scheduled portion must have been. A
          // month that names more than that keeps its own figure.
          const seen = scheduledByCell.get(key) ?? 0n;
          const spent =
            (spendByCell.get(key) ?? 0n) -
            (excludedByCell.get(key) ?? 0n) -
            (seen > routineRate ? seen : routineRate);
          return {
            month,
            limitCents:
              currentLimit > 0n ? currentLimit : (limitByCell.get(key) ?? 0n),
            // An excluded transaction can outrun the month's other spend only if
            // something was refunded; floor it rather than credit the walk.
            spentCents: spent > 0n ? spent : 0n,
          };
        });

        // History's own contribution: the deepest trough of (limit − ORDINARY
        // spend). It is what irregular habit has cost before, and nothing else
        // — the scheduled half was taken out at source, so this can be added to
        // the commitments below without charging anything twice.
        const past = reserveFit(months);

        // The limit that would keep this category solvent, spread across the
        // whole runway (260807 r2). The first cut aimed at the NEXT lump, and a
        // 129 zł internet bill next month made it demand a year of commitments
        // at once; the household asked for the opposite — extend it as far as
        // possible and stay solvent the whole way.
        // DENSE over the whole runway, not just the months carrying a charge:
        // a category with nothing scheduled still has a year to fund its buffer
        // over, and an array of its commitment months alone would give it none.
        // Ordinary spending, straight from the months above — they already hold
        // the ordinary half only. The old code subtracted a forward RATE from a
        // historical mean and hoped the two cancelled; they did not when a rule
        // was new, when the windows were different lengths, or when the range
        // happened to contain the lump (audit, 260807).
        const baselineSpend =
          months.length > 0
            ? months.reduce((acc, m) => acc + m.spentCents, 0n) /
              BigInt(months.length)
            : 0n;

        // The rules in full: the baseline above has had them taken out of
        // every month, whether the ledger named them or not, so counting them
        // here charges each of them exactly once.
        const byMonth = new Map(commitments);
        const forward = forwardWindow.map((m) => {
          const c = byMonth.get(m);
          return c ? c.routine + c.onTop + c.oneTime : 0n;
        });
        // What must be in this reserve TODAY. The old answer assumed the
        // household would never save another złoty — the forward walk started
        // at zero — so it came out as the sum of the whole runway's lumps, and
        // a category whose own limit comfortably funds its future still read as
        // short (user, 260807). Counting the accrual the current limit already
        // produces makes this and the suggestion below one function: the
        // suggested limit is exactly the limit at which this equals `held`.
        const neededCents = reserveNeededToday({
          baselineSpendCents: baselineSpend,
          commitmentsByMonth: forward,
          historicalNeedCents: past.neededCents,
          limitCents: currentLimit,
        });
        // No current limit means nothing to suggest a change TO — the row is
        // already being judged on its own history (see currentLimit above).
        //
        // And never off a HALF-FINISHED month. When the range is the running
        // month alone (the default view is "this month"), the walk falls back to
        // it rather than to nothing — a weak signal beats none for SIZING. But
        // a baseline taken from a part-month is not weak, it is wrong: on the
        // 7th it reads a 3,000/month category as spending 700, and the advice
        // becomes "cut this limit to 700 and free 2,300", every month, on the
        // default screen. The trough walk keeps its fallback; the suggestion
        // does not get one.
        const hasClosedMonth = all.some((m) => m !== nowMonth);
        const suggestion =
          currentLimit > 0n && months.length > 0 && hasClosedMonth
            ? smallestSufficientLimit({
                heldCents: position.reserveCents,
                baselineSpendCents: baselineSpend,
                commitmentsByMonth: forward,
                // What irregular ORDINARY spending has cost before, wanted by
                // the end of the runway.
                historicalNeedCents: past.neededCents,
                currentLimitCents: currentLimit,
              })
            : null;

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
          needed_cents: neededCents.toString(),
          gap_cents: (position.reserveCents - neededCents).toString(),
          worst_month: past.worstMonth,
          worst_overage_cents: past.worstOverageCents.toString(),
          suggested_limit_cents: suggestion?.limitCents.toString() ?? null,
          // What the reserve would need AT that limit. Lowering a limit stops
          // the reserve topping itself up, so the requirement RISES — reporting
          // only the figure at today's limit invited the household to withdraw
          // the surplus AND lower the limit, which leaves them short (user,
          // 260807).
          suggested_needed_cents:
            suggestion == null
              ? null
              : reserveNeededToday({
                  baselineSpendCents: baselineSpend,
                  commitmentsByMonth: forward,
                  historicalNeedCents: past.neededCents,
                  limitCents: suggestion.limitCents,
                }).toString(),
          suggested_delta_cents: suggestion?.deltaCents.toString() ?? null,
          suggested_over_months: suggestion?.overMonths ?? null,
          suggested_direction: suggestion?.direction ?? null,
          overage_months: past.overageMonths,
          months_counted: past.monthsCounted,
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
              scheduled_cadence: t.scheduled_cadence,
              excluded: t.excluded,
            })),
        });
      }

      // Worst fit first: the rows that need money, then the ones holding it idle.
      rows.sort((a, b) => Number(BigInt(a.gap_cents) - BigInt(b.gap_cents)));

      return ok({
        currency: meta?.default_currency ?? "EUR",
        rows,
        unassigned_scheduled: rules
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
