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
import { reserveNeededToday } from "../domain/reserve-requirement";
import {
  earmarkedForOneOffs,
  projectedMonthly,
} from "../domain/projected-monthly";
import type { FxProvider } from "@budget/shared-kernel";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
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
      /** The rule's OWN currency, which need not be the budget's (260809). */
      currency?: string | null;
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
  /** Rules carry their own currency, so a 100 EUR charge in a PLN budget is
   *  430 of limit, not 100. The scheduled charts have always converted; this
   *  read model counted the bare number (user, 260809). */
  fxProvider: FxProvider;
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
  /** What this category will cost in an AVERAGE month from here: the ordinary
   *  habit plus every recurring rule normalised to a monthly figure. The Future
   *  chart draws this against today's limit, so the two figures it lists and
   *  the difference between them are finally the same arithmetic (user,
   *  260808). A one-off is left out — it happens once, and the reserve is what
   *  funds it. */
  projected_monthly_cents: string;
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
  /**
   * What EVERY category will cost in an average month — including the ones with
   * no reserve row: opted out of the buffer, or not tracked by the engine at
   * all. Sizing a reserve is none of their business; what they will cost is a
   * different question, asked by the Future chart, and it has an answer for all
   * of them. Without it that chart fell back to drawing today's limit against
   * itself, so Insurance read "current 779 / expected 779" while its two
   * monthly payments came to 798 (user, 260812).
   */
  projected_by_category: {
    category_id: string;
    projected_monthly_cents: string;
  }[];
  /**
   * Every large spend the household could set aside, from EVERY category —
   * including the ones with no reserve row. The dialog used to read these off
   * the rows, so a big spend inside an opted-out category could not be ticked:
   * it was never offered (user, 260812).
   */
  one_off_candidates: {
    ledger_id: string;
    category_id: string;
    category_name: string;
    transaction_date: string;
    note: string | null;
    amount_cents: string;
    scheduled_cadence: string | null;
    excluded: boolean;
  }[];
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
      const [meta, windows, planned, spend, large, rawRules, positionsResult] =
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

      // Every rule in the BUDGET's money, once, before anything counts it. A
      // rule carries its own currency, so a 100 EUR charge in a PLN budget is
      // 430 of limit — the scheduled charts have always converted, this read
      // model did not (user, 260809). Converted here rather than at each use,
      // so the projection and the reserve walk cannot disagree about a rule.
      const budgetCcy = meta?.default_currency ?? "EUR";
      const asOfDate = new Date(`${nowMonth}-01T00:00:00Z`);
      const rules = await Promise.all(
        rawRules.map(async (r) =>
          !r.currency || r.currency === budgetCcy
            ? r
            : {
                ...r,
                amount_cents: await sumWalletsToCurrency(
                  [{ amount_cents: r.amount_cents, currency: r.currency }],
                  budgetCcy,
                  deps.fxProvider,
                  asOfDate,
                ),
                currency: budgetCcy,
              },
        ),
      );

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
      const committed = projectScheduledPayments(
        rules,
        forwardFrom,
        windowMonths,
      );
      /** Every month of the runway in order — the ones with nothing due too. */
      const forwardWindow = Array.from({ length: windowMonths }, (_, i) =>
        addMonths(forwardFrom, i),
      );

      /**
       * What one category will cost in an average month ahead — see
       * projected-monthly.ts for the three rules. Hoisted out of the row loop
       * because a category with NO reserve row still has an answer here: the
       * Future chart asks every category, not just the buffered ones (user,
       * 260812).
       */
      const projectedFor = (w: (typeof windows)[number]): bigint => {
        const scope: string[] = [];
        for (
          let m = from.slice(0, 7);
          m <= to.slice(0, 7);
          m = addMonths(m, 1)
        ) {
          if (m === nowMonth) continue;
          if (w.created_month !== null && m < w.created_month) continue;
          if (w.archived_month !== null && m > w.archived_month) continue;
          scope.push(m);
        }
        return projectedMonthly({
          windowMonths: scope,
          spentByMonth: new Map(
            scope.map((m) => {
              const key = `${w.category_id}|${m}`;
              const ordinary =
                (spendByCell.get(key) ?? 0n) -
                (excludedByCell.get(key) ?? 0n) -
                (scheduledByCell.get(key) ?? 0n);
              return [m, ordinary > 0n ? ordinary : 0n];
            }),
          ),
          rules: rules.filter((r) => r.category_id === w.category_id),
          fromMonth: nowMonth,
          // An excluded or untracked category holds nothing against its
          // one-offs, so there is nothing to credit.
          reserveHeldCents: positions.get(w.category_id)?.reserveCents ?? 0n,
        });
      };

      /**
       * "Which spend won't happen again" — so a charge that WILL is no
       * candidate. A ledger row linked to a repeating rule recurs by
       * construction; ticking it as a one-off is always wrong, and it used to
       * take a shortlist slot from a genuine one (user, 260813). A ONCE rule is
       * a real single purchase and stays.
       */
      const isOneOffish = (cadence: string | null) =>
        cadence === null || cadence === "ONCE";

      /**
       * Half a typical month's limit — the bar a spend has to clear to be worth
       * a decision, per category. Hoisted for the same reason as projectedFor:
       * a category with no reserve row still has one-offs to offer, and they
       * must be judged by the same rule as everyone else's (user, 260812).
       */
      const worthDecidingIn = (categoryId: string) => {
        const months = [...(monthsByCat.get(categoryId) ?? [])].filter(
          (m) => m !== nowMonth,
        );
        const avg =
          months.length > 0
            ? months.reduce(
                (acc, m) => acc + (limitByCell.get(`${categoryId}|${m}`) ?? 0n),
                0n,
              ) / BigInt(months.length)
            : 0n;
        return (amount: bigint) => amount * 2n >= avg;
      };

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
        const commitments = [...(committed.get(w.category_id) ?? [])];

        // Every month of the RANGE this category has existed for — the ones it
        // spent nothing in included, because a quiet month is still a month it
        // was alive and under a limit. The average that used to divide by the
        // months carrying a figure read two gifts a year as 251 a month
        // (user, 260808). The running month is dropped, as everywhere else:
        // half a month of spend against a whole month of limit is not a rate.
        const scopeMonths: string[] = [];
        for (
          let m = from.slice(0, 7);
          m <= to.slice(0, 7);
          m = addMonths(m, 1)
        ) {
          if (m === nowMonth) continue;
          if (w.created_month !== null && m < w.created_month) continue;
          if (w.archived_month !== null && m > w.archived_month) continue;
          scopeMonths.push(m);
        }

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
          // What the ledger LINKS to a rule, and nothing more. A floor used to
          // be inferred here from the rule's own rate, to cover history that
          // predated the rule — but inferring is not this layer's job (user,
          // 260809). Where an import left the two unlinked, a one-time backfill
          // links them; after that this is a fact on the row.
          const spent =
            (spendByCell.get(key) ?? 0n) -
            (excludedByCell.get(key) ?? 0n) -
            (scheduledByCell.get(key) ?? 0n);
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

        // What an average month ahead costs (projectedFor, above): the ordinary
        // habit over every month of the RANGE this category existed for, plus
        // each recurring rule once at its monthly size, less whatever its
        // reserve already holds against a one-off.
        const categoryRules = rules.filter(
          (r) => r.category_id === w.category_id,
        );
        const projected = projectedFor(w);

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
        //
        // …with a FLOOR: whatever the projection above stopped asking the limit
        // to save for, because this reserve is already holding it, the reserve
        // has to keep holding. Without the floor the two halves of one credit
        // disagreed — the limit was excused Japan because the reserve had the
        // money, and the requirement then said "needed 0" because the limit's
        // accrual could fund Japan on its own. Held 17,315, needed 0, and a
        // recommendation that only made sense if the reserve stayed put (user,
        // 260809).
        const earmarked = earmarkedForOneOffs(
          categoryRules,
          nowMonth,
          position.reserveCents,
        );
        //
        // `needed` stays the requirement at the limit in FORCE — that is what
        // this figure has always meant and what the sizing tests pin. The chart
        // re-bases it onto the recommended limit for display (user, 260809,
        // lib/reserve-fit-rows.ts); the DTO reports both, and history is
        // re-walked for the second because it moves with the limit too.
        const neededAt = (limitCents: bigint): bigint => {
          const walked = reserveNeededToday({
            baselineSpendCents: baselineSpend,
            commitmentsByMonth: forward,
            historicalNeedCents:
              limitCents === currentLimit
                ? past.neededCents
                : reserveFit(months.map((m) => ({ ...m, limitCents })))
                    .neededCents,
            limitCents,
          });
          return walked > earmarked ? walked : earmarked;
        };
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
        // ONE suggested limit, wherever it is shown (user, 260808). The reserve
        // tooltip used to offer "or set the limit to X" from a solvency walk
        // while the Future chart drew a different X from the projection — two
        // numbers for one decision, on two screens a tap apart.
        //
        // The projection is the one that survives, because it is the answer to
        // the question the household actually asks: what does this category
        // cost me a month? The walk's extra input was what the reserve already
        // holds, and that is a separate question — held against needed, which
        // the same row still reports.
        // …and nothing at all when today's limit already IS it: a suggestion
        // that changes nothing is noise on every row of the chart. Under a
        // whole unit is not a change.
        const suggestionWorthMaking =
          hasClosedMonth &&
          scopeMonths.length > 0 &&
          (projected - currentLimit > 99n || currentLimit - projected > 99n);
        const suggestion = suggestionWorthMaking
          ? {
              limitCents: projected,
              deltaCents: projected - currentLimit,
              overMonths: scopeMonths.length,
              direction:
                projected > currentLimit
                  ? ("raise" as const)
                  : ("lower" as const),
            }
          : null;

        const neededCents = neededAt(currentLimit);

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
          projected_monthly_cents: projected.toString(),
          suggested_limit_cents: suggestion?.limitCents.toString() ?? null,
          // What the reserve would need AT that limit. Lowering a limit stops
          // the reserve topping itself up, so the requirement RISES — reporting
          // only the figure at today's limit invited the household to withdraw
          // the surplus AND lower the limit, which leaves them short (user,
          // 260807).
          // What the buffer needs at the limit being suggested — the basis the
          // chart draws once there is a suggestion to draw.
          suggested_needed_cents:
            suggestion == null
              ? null
              : neededAt(suggestion.limitCents).toString(),
          suggested_delta_cents: suggestion?.deltaCents.toString() ?? null,
          suggested_over_months: suggestion?.overMonths ?? null,
          suggested_direction: suggestion?.direction ?? null,
          overage_months: past.overageMonths,
          months_counted: past.monthsCounted,
          large_transactions: large
            .filter(
              (t) =>
                t.category_id === w.category_id &&
                isOneOffish(t.scheduled_cadence) &&
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
        // …and what every category costs in an average month, whether or not it
        // earned a reserve row (see the DTO).
        projected_by_category: windows.map((w) => ({
          category_id: w.category_id,
          projected_monthly_cents: projectedFor(w).toString(),
        })),
        // …and every large spend that could be set aside, from every category
        // (see the DTO). Biggest first, as the dialog lists them.
        one_off_candidates: (() => {
          const nameOf = new Map(windows.map((w) => [w.category_id, w.name]));
          return large
            .filter(
              (t) =>
                nameOf.has(t.category_id) &&
                isOneOffish(t.scheduled_cadence) &&
                worthDecidingIn(t.category_id)(t.amount_cents),
            )
            .sort((a, b) => (a.amount_cents < b.amount_cents ? 1 : -1))
            .map((t) => ({
              ledger_id: t.ledger_id,
              category_id: t.category_id,
              category_name: nameOf.get(t.category_id) ?? "",
              transaction_date: t.transaction_date,
              note: t.note,
              amount_cents: t.amount_cents.toString(),
              scheduled_cadence: t.scheduled_cadence,
              excluded: t.excluded,
            }));
        })(),
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
