/**
 * get-overview-planned.ts — Planned section service (11-04).
 *
 * Multi-month Planned-vs-Real timeline (D-12), adaptive monthly/daily bucket
 * (D-20), planned-avg-vs-real-avg over ONLY the months a category was active
 * (D-13), and the two current-config recurring charts (D-14).
 *
 * Timeline planned/real are already in default_currency (limits are stored in the
 * budget currency; the ledger stores amount_converted_cents) — no FX on that path,
 * matching get-spendings-summary. Recurring amounts ARE FX-converted (rules carry
 * their own currency). Cents are bigint internally; the DTO stringifies at the
 * service boundary (matching get-spendings-summary / get-cushion-summary).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { FxProvider } from "@budget/shared-kernel";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import {
  computeInvestmentSmartLimit,
  normalizeIncomesToMonthlyItems,
  type IncomeForNormalize,
} from "./investment-smart-limit";
import {
  recurringMonthlyNormalize,
  type Cadence,
} from "./recurring-monthly-normalize";

export interface MonthlyPlannedRow {
  category_id: string;
  month: string; // YYYY-MM
  planned_cents: bigint;
  /** The cushion (essential/"needs") portion of the planned limit; wants =
   *  planned − needs. Defaults to 0 for callers/tests that omit it. */
  needs_cents?: bigint;
}
export interface MonthlySpendRow {
  category_id: string;
  month: string; // YYYY-MM
  spent_cents: bigint;
}
export interface CategoryWindow {
  category_id: string;
  name: string;
  created_month: string; // YYYY-MM
  archived_month: string | null; // YYYY-MM, null = active
  is_investment: boolean;
  /** 'manual' | 'smart' | null. SMART has no stored limit — it is income minus
   *  everything else planned, resolved here so the Overview reads the same plan
   *  the Spendings grid shows. */
  investment_limit_mode?: string | null;
}
export interface DailySpendRow {
  day: string; // YYYY-MM-DD
  spent_cents: bigint;
}
export interface ActiveRecurringRule {
  category_id: string | null;
  /** category name (for the per-category chart). */
  name: string | null;
  /** the rule's OWN name/note (for the per-month payment list). */
  rule_name?: string | null;
  amount_cents: bigint; // in `currency`
  currency: string;
  cadence: Cadence;
  yearly_month: number | null;
}

export interface OverviewPlannedRepo {
  monthlyPlannedByCategory(
    budgetId: string,
    from: string,
    to: string,
  ): Promise<MonthlyPlannedRow[]>;
  monthlySpendByCategory(
    budgetId: string,
    from: string,
    to: string,
  ): Promise<MonthlySpendRow[]>;
  categoryWindows(budgetId: string): Promise<CategoryWindow[]>;
  dailySpend(
    budgetId: string,
    from: string,
    to: string,
    /** Empty or absent → every category the timeline counts (260802). */
    categoryIds?: string[],
  ): Promise<DailySpendRow[]>;
  activeRecurringRules(budgetId: string): Promise<ActiveRecurringRule[]>;
}

export interface GetOverviewPlannedDeps {
  repo: OverviewPlannedRepo;
  metaReader: {
    getBudgetMeta(
      budgetId: string,
    ): Promise<{ default_currency: string } | null>;
  };
  fxProvider: FxProvider;
  /**
   * r33: active incomes + FX, used ONLY to resolve the SMART Investments limit
   * (income − Σ other planned), which the category has no stored limit for.
   * Optional — a budget whose Investments category is absent or on MANUAL never
   * touches them.
   */
  incomeRepo?: {
    listActive(tenantId: string): Promise<IncomeForNormalize[]>;
  };
  /**
   * 260801: the timeline splits each month's spend into what the plan covered,
   * what the RESERVE covered and what was overspent, so it needs the engine's
   * per-(category, month) reserve draw. Same seam the Overspent section uses.
   * Optional: without it a month reads as limit-then-overspend, no yellow.
   */
  reservePositions?: (input: { tenantId: string; budgetId: string }) => Promise<
    Result<
      {
        positions: Map<
          string,
          {
            byMonth: Map<
              string,
              { usedCents: bigint; endReserveCents: bigint }
            >;
          }
        >;
      },
      Error
    >
  >;
}

export interface GetOverviewPlannedInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  categoryId?: string;
  /**
   * The chart's picker is a MULTI-select (260802): the timeline counts exactly
   * these categories. Empty or absent → every category, investments included
   * (260803). Takes precedence over the single `categoryId`.
   */
  categoryIds?: string[];
  /**
   * Leave the RUNNING month out of the per-category averages (260802 user
   * request): a month still in progress drags an average down against months
   * that ran their full course. Ignored when it is the only month in range.
   */
  excludeCurrentMonth?: boolean;
  now?: () => Date;
}

export interface OverviewPlannedDTO {
  currency: string;
  bucket: "monthly" | "daily";
  timeline: {
    label: string;
    planned_cents: string;
    real_cents: string;
    /** planned split: needs (cushion/essential) + wants (planned − needs). The
     *  chart stacks wants ABOVE needs; needs + wants === planned. */
    needs_cents: string;
    wants_cents: string;
    /**
     * Where that month's spend CAME FROM (260801) — the chart colours the line
     * in these proportions: green up to within_limit, yellow for the reserve it
     * consumed, red for the rest. The three always sum to real_cents.
     */
    within_limit_cents: string;
    reserve_used_cents: string;
    overspent_cents: string;
  }[];
  /**
   * Σ over the selected range, across the categories in view: what was planned,
   * what was spent, and how that spend was paid for — what the limit covered,
   * what the reserve covered, and what was left over. The timeline's picker
   * narrows both sides alike. within + reserve_used + overspent === spent.
   */
  rangeTotals: {
    /** Σ of the limits in view over the range — the plan side of the comparison. */
    planned_cents: string;
    spent_cents: string;
    within_limit_cents: string;
    reserve_used_cents: string;
    overspent_cents: string;
  };
  plannedAvgVsReal: {
    category_id: string;
    name: string;
    planned_avg_cents: string;
    real_avg_cents: string;
    /** Σ over the months the category was active in range — the tooltip shows
     *  the average and the total side by side (260803 user request). */
    planned_total_cents: string;
    real_total_cents: string;
  }[];
  recurringPerMonth: {
    month: number;
    planned_cents: string;
    /** the individual payments that make up this month's bar (tooltip list). */
    items: { name: string; amount_cents: string }[];
  }[];
  recurringPerCategory: {
    category_id: string;
    name: string;
    planned_cents: string;
  }[];
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

/** Inclusive YYYY-MM list from `from` to `to`. */
function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number];
  const [ty, tm] = to.slice(0, 7).split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Round-half-up integer division of bigint cents. */
function avgCents(sum: bigint, count: number): bigint {
  if (count <= 0) return 0n;
  const c = BigInt(count);
  return (sum * 2n + c) / (2n * c);
}

export function getOverviewPlanned(deps: GetOverviewPlannedDeps) {
  return async (
    input: GetOverviewPlannedInput,
  ): Promise<Result<OverviewPlannedDTO, Error>> => {
    try {
      const asOf = input.now ? input.now() : new Date();
      const meta = await deps.metaReader.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));
      const ccy = meta.default_currency;
      const bucket = chooseBucket(input.from, input.to);

      const [planned, spend, windows, rules, posResult] = await Promise.all([
        deps.repo.monthlyPlannedByCategory(
          input.budgetId,
          input.from,
          input.to,
        ),
        deps.repo.monthlySpendByCategory(input.budgetId, input.from, input.to),
        deps.repo.categoryWindows(input.budgetId),
        deps.repo.activeRecurringRules(input.budgetId),
        deps.reservePositions?.({
          tenantId: input.tenantId,
          budgetId: input.budgetId,
        }),
      ]);
      let reservePositions:
        | Map<
            string,
            {
              byMonth: Map<
                string,
                { usedCents: bigint; endReserveCents: bigint }
              >;
            }
          >
        | undefined;
      if (posResult) {
        if (posResult.isErr()) return err(posResult.error);
        reservePositions = posResult.value.positions;
      }

      // When a category STARTED, for averaging and for the plan band. Its record
      // can be younger than its data — an imported history is written against a
      // category created today — and gating on created_at alone averaged three
      // years of spend over a single month (user report, 260803). Whichever came
      // first, the record or the activity, is the start.
      const firstSeen = new Map<string, string>();
      const noteMonth = (categoryId: string, month: string) => {
        const at = firstSeen.get(categoryId);
        if (at === undefined || month < at) firstSeen.set(categoryId, month);
      };
      for (const p of planned) noteMonth(p.category_id, p.month);
      for (const s of spend) noteMonth(s.category_id, s.month);
      const startOf = (w: CategoryWindow): string => {
        const seen = firstSeen.get(w.category_id);
        return seen !== undefined && seen < w.created_month
          ? seen
          : w.created_month;
      };

      // Every category counts by default, investments included (260803 user
      // request) — the picker is what narrows the view, exactly as it does for
      // any other category.
      const picked = new Set(
        input.categoryIds?.length
          ? input.categoryIds
          : input.categoryId
            ? [input.categoryId]
            : [],
      );
      const inCat = (catId: string) => (picked.size ? picked.has(catId) : true);

      // While the Investments category is on SMART it stores no limit: its plan
      // is income minus everything else planned, computed on read — the figure
      // the Spendings grid already shows. Resolve it here too, or the category
      // would enter these charts against a plan of ZERO, reading as pure
      // overspend and drowning out every real one.
      //
      // Income carries no history, so the CURRENT monthly income is applied to
      // every month in range; the "everything else" side is each month's own.
      const investWindow = windows.find((w) => w.is_investment);
      let plannedRows = planned;
      if (investWindow?.investment_limit_mode === "smart") {
        let monthlyIncome = 0n;
        if (deps.incomeRepo) {
          const incomes = await deps.incomeRepo.listActive(input.tenantId);
          monthlyIncome = await sumWalletsToCurrency(
            normalizeIncomesToMonthlyItems(incomes),
            ccy,
            deps.fxProvider,
            asOf,
          );
        }
        const otherPlannedByMonth = new Map<string, bigint>();
        for (const p of planned) {
          if (p.category_id === investWindow.category_id) continue;
          otherPlannedByMonth.set(
            p.month,
            (otherPlannedByMonth.get(p.month) ?? 0n) + p.planned_cents,
          );
        }
        // Its plan is income minus everything else planned, which in a month
        // with no other limits is the WHOLE income — so applied to months before
        // the category existed it drew a full-height band across empty history.
        const from = startOf(investWindow);
        plannedRows = [
          ...planned.filter((p) => p.category_id !== investWindow.category_id),
          ...monthsInRange(input.from, input.to)
            .filter((month) => month >= from)
            .map((month) => ({
              category_id: investWindow.category_id,
              month,
              planned_cents: computeInvestmentSmartLimit({
                monthlyIncomeCents: monthlyIncome,
                otherPlannedCents: otherPlannedByMonth.get(month) ?? 0n,
              }),
              // No needs/wants split — Investments carries no cushion.
              needs_cents: 0n,
            })),
        ];
      }

      // Each month's spend, split by WHERE IT CAME FROM (260801 user decision):
      // what the limit covered, what the reserve covered, and the rest. Per
      // category, because a category under its limit cannot lend its headroom to
      // one that is over. The parts always sum to the month's spend, which is
      // what lets the chart colour the line in their proportions.
      const plannedPerCatMonth = new Map<string, bigint>();
      for (const p of plannedRows)
        plannedPerCatMonth.set(
          `${p.category_id}|${p.month}`,
          (plannedPerCatMonth.get(`${p.category_id}|${p.month}`) ?? 0n) +
            p.planned_cents,
        );
      const withinByMonth = new Map<string, bigint>();
      const reserveUsedByMonth = new Map<string, bigint>();
      const overspentByMonth = new Map<string, bigint>();
      for (const s of spend) {
        if (!inCat(s.category_id)) continue;
        const limit =
          plannedPerCatMonth.get(`${s.category_id}|${s.month}`) ?? 0n;
        const within = s.spent_cents < limit ? s.spent_cents : limit;
        const overage = s.spent_cents - within;
        const drawn =
          reservePositions?.get(s.category_id)?.byMonth.get(s.month)
            ?.usedCents ?? 0n;
        // The engine caps a draw at the overage, but a stale cell must never
        // colour more of the line than the month actually overspent.
        const used = drawn < overage ? drawn : overage;
        withinByMonth.set(s.month, (withinByMonth.get(s.month) ?? 0n) + within);
        const drawn2 = used > 0n ? used : 0n;
        reserveUsedByMonth.set(
          s.month,
          (reserveUsedByMonth.get(s.month) ?? 0n) + drawn2,
        );
        overspentByMonth.set(
          s.month,
          (overspentByMonth.get(s.month) ?? 0n) + (overage - drawn2),
        );
      }
      const sumOf = (m: Map<string, bigint>) => {
        let total = 0n;
        for (const v of m.values()) total += v;
        return total;
      };
      let plannedInRange = 0n;
      for (const p of plannedRows)
        if (inCat(p.category_id)) plannedInRange += p.planned_cents;
      const rangeTotals = {
        planned_cents: plannedInRange.toString(),
        within_limit_cents: sumOf(withinByMonth).toString(),
        reserve_used_cents: sumOf(reserveUsedByMonth).toString(),
        overspent_cents: sumOf(overspentByMonth).toString(),
        spent_cents: (
          sumOf(withinByMonth) +
          sumOf(reserveUsedByMonth) +
          sumOf(overspentByMonth)
        ).toString(),
      };
      const splitOf = (month: string) => ({
        within_limit_cents: (withinByMonth.get(month) ?? 0n).toString(),
        reserve_used_cents: (reserveUsedByMonth.get(month) ?? 0n).toString(),
        overspent_cents: (overspentByMonth.get(month) ?? 0n).toString(),
      });

      // ---- timeline ----
      let timeline: OverviewPlannedDTO["timeline"];
      if (bucket === "monthly") {
        const months = monthsInRange(input.from, input.to);
        const plannedByMonth = new Map<string, bigint>();
        const needsByMonth = new Map<string, bigint>();
        const spendByMonth = new Map<string, bigint>();
        for (const p of plannedRows)
          if (inCat(p.category_id)) {
            plannedByMonth.set(
              p.month,
              (plannedByMonth.get(p.month) ?? 0n) + p.planned_cents,
            );
            needsByMonth.set(
              p.month,
              (needsByMonth.get(p.month) ?? 0n) + (p.needs_cents ?? 0n),
            );
          }
        for (const s of spend)
          if (inCat(s.category_id))
            spendByMonth.set(
              s.month,
              (spendByMonth.get(s.month) ?? 0n) + s.spent_cents,
            );
        timeline = months.map((label) => {
          const planned = plannedByMonth.get(label) ?? 0n;
          const needs = needsByMonth.get(label) ?? 0n;
          const wants = planned > needs ? planned - needs : 0n;
          return {
            label,
            planned_cents: planned.toString(),
            real_cents: (spendByMonth.get(label) ?? 0n).toString(),
            needs_cents: needs.toString(),
            wants_cents: wants.toString(),
            ...splitOf(label),
          };
        });
      } else {
        // daily: cumulative confirmed spend per returned day; planned = the
        // active monthly limit for that day's month (flat target line).
        const days = await deps.repo.dailySpend(
          input.budgetId,
          input.from,
          input.to,
          picked.size ? [...picked] : undefined,
        );
        const plannedByMonth = new Map<string, bigint>();
        const needsByMonth = new Map<string, bigint>();
        for (const p of plannedRows)
          if (inCat(p.category_id)) {
            plannedByMonth.set(
              p.month,
              (plannedByMonth.get(p.month) ?? 0n) + p.planned_cents,
            );
            needsByMonth.set(
              p.month,
              (needsByMonth.get(p.month) ?? 0n) + (p.needs_cents ?? 0n),
            );
          }
        // 260801 (user decision): every month is its OWN cycle. The plan is that
        // month's plain limit and the spend line restarts at 0 on the 1st, so a
        // multi-month range reads as a row of monthly burn-ups. The earlier
        // cumulative-across-months line could never be compared against a single
        // month's limit, which is what produced 45K-of-spend beside a 23K plan and
        // then the whole-month leap on the 1st.
        const splitAt = (month: string) => {
          const planned = plannedByMonth.get(month) ?? 0n;
          const needs = needsByMonth.get(month) ?? 0n;
          return {
            planned_cents: planned.toString(),
            needs_cents: needs.toString(),
            wants_cents: (planned > needs ? planned - needs : 0n).toString(),
            ...splitOf(month),
          };
        };
        const anyPlanned = [...plannedByMonth.values()].some((v) => v > 0n);
        // Render the (flat) line whenever there's a planned limit OR a single
        // category is being inspected — a selected category with a 0 budget should
        // still draw a 0-line (parity with the monthly view), NOT "No activity".
        // Only the All-categories view with nothing planned keeps the empty message.
        if (days.length === 0 && (anyPlanned || picked.size)) {
          // No confirmed spend in range — render the planned target line with
          // real = 0 instead of an empty "no activity" chart (UAT). Two endpoints
          // draw the flat planned line.
          timeline = [input.from, input.to].map((label) => ({
            label,
            ...splitAt(label.slice(0, 7)),
            real_cents: "0",
          }));
        } else {
          let cumulative = 0n;
          let currentMonth: string | null = null;
          const points: OverviewPlannedDTO["timeline"] = [];
          for (const d of [...days].sort((a, b) =>
            a.day.localeCompare(b.day),
          )) {
            const month = d.day.slice(0, 7);
            if (month !== currentMonth) {
              // New month: the running total goes back to zero, and the month
              // opens with an explicit 0 point so the line DROPS at the boundary
              // instead of sliding across it.
              cumulative = 0n;
              currentMonth = month;
              const firstOfMonth = `${month}-01`;
              if (firstOfMonth >= input.from && firstOfMonth < d.day) {
                points.push({
                  label: firstOfMonth,
                  ...splitAt(month),
                  real_cents: "0",
                });
              }
            }
            cumulative += d.spent_cents;
            points.push({
              label: d.day,
              ...splitAt(month),
              real_cents: cumulative.toString(),
            });
          }
          // Anchor the series to the requested window so the chart spans it
          // (e.g. 1M = from the 1st to today), not just the days that happened to
          // have spend. Prepend `from` at real=0 and append `to` at the final
          // cumulative when they fall outside the spend-day span. Only when there
          // IS spend — the no-spend cases are handled above (empty message / flat
          // planned line).
          if (points.length > 0) {
            if (points[0]!.label > input.from) {
              points.unshift({
                label: input.from,
                ...splitAt(input.from.slice(0, 7)),
                real_cents: "0",
              });
            }
            const last = points[points.length - 1]!;
            if (last.label < input.to) {
              // The running total belongs to its own month: an anchor in a later
              // month starts that month's cycle at zero. Carrying the previous
              // month's total across the boundary read as a month that had spent
              // everything and overspent all of it (user report).
              const sameMonth = last.label.slice(0, 7) === input.to.slice(0, 7);
              points.push({
                label: input.to,
                ...splitAt(input.to.slice(0, 7)),
                real_cents: sameMonth ? last.real_cents : "0",
              });
            }
          }
          timeline = points;
        }
      }

      // ---- planned-avg vs real-avg over active months only (D-13/D-06) ----
      const allRangeMonths = monthsInRange(input.from, input.to);
      const runningMonth = `${asOf.getUTCFullYear()}-${String(
        asOf.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      // …minus the month still in progress, when asked and when there is
      // anything left to average.
      const rangeMonths =
        input.excludeCurrentMonth && allRangeMonths.length > 1
          ? allRangeMonths.filter((m) => m !== runningMonth)
          : allRangeMonths;
      const plannedKey = new Map<string, bigint>();
      const spendKey = new Map<string, bigint>();
      for (const p of plannedRows)
        plannedKey.set(`${p.category_id}|${p.month}`, p.planned_cents);
      for (const s of spend)
        spendKey.set(`${s.category_id}|${s.month}`, s.spent_cents);

      const plannedAvgVsReal = windows
        .map((w) => {
          const from = startOf(w);
          const active = rangeMonths.filter(
            (m) =>
              m >= from && (w.archived_month === null || m <= w.archived_month),
          );
          if (active.length === 0) return null;
          let ps = 0n;
          let rs = 0n;
          for (const m of active) {
            ps += plannedKey.get(`${w.category_id}|${m}`) ?? 0n;
            rs += spendKey.get(`${w.category_id}|${m}`) ?? 0n;
          }
          return {
            category_id: w.category_id,
            name: w.name,
            planned_avg_cents: avgCents(ps, active.length).toString(),
            real_avg_cents: avgCents(rs, active.length).toString(),
            planned_total_cents: ps.toString(),
            real_total_cents: rs.toString(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      // ---- recurring charts (current config, FX→default_ccy) ----
      // Convert each rule's amount to default_ccy once.
      const ruleAmounts = await Promise.all(
        rules.map((rule) =>
          sumWalletsToCurrency(
            [{ amount_cents: rule.amount_cents, currency: rule.currency }],
            ccy,
            deps.fxProvider,
            asOf,
          ),
        ),
      );

      const perMonth = new Array<bigint>(12).fill(0n);
      // Per-month list of the individual payments that make up each bar (name +
      // this-month amount) — the "Recurring bills, by month" tooltip lists them.
      const perMonthItems: Array<{ name: string; amount_cents: string }[]> =
        Array.from({ length: 12 }, () => []);
      const perCategory = new Map<string, { name: string; cents: bigint }>();
      rules.forEach((rule, i) => {
        const amt = ruleAmounts[i]!;
        // per-MONTH list uses the rule's own name (note); per-category keeps the
        // category name. Fall back to the category name when a rule has no note.
        const itemName = rule.rule_name || rule.name || "";
        const addItem = (m: number, cents: bigint) =>
          perMonthItems[m]!.push({
            name: itemName,
            amount_cents: cents.toString(),
          });
        // per-month distribution: where the rule actually fires.
        if (rule.cadence === "YEARLY") {
          const idx = (rule.yearly_month ?? 1) - 1;
          perMonth[idx] = (perMonth[idx] ?? 0n) + amt; // full annual amount in its month
          addItem(idx, amt);
        } else if (rule.cadence === "MONTHLY") {
          for (let m = 0; m < 12; m++) {
            perMonth[m] = (perMonth[m] ?? 0n) + amt;
            addItem(m, amt);
          }
        } else {
          const monthly = recurringMonthlyNormalize(amt, rule.cadence);
          for (let m = 0; m < 12; m++) {
            perMonth[m] = (perMonth[m] ?? 0n) + monthly;
            addItem(m, monthly);
          }
        }
        // per-category: a comparable monthly figure (YEARLY ÷ 12).
        if (rule.category_id) {
          const monthly = recurringMonthlyNormalize(amt, rule.cadence);
          const cur = perCategory.get(rule.category_id);
          perCategory.set(rule.category_id, {
            name: rule.name ?? cur?.name ?? "",
            cents: (cur?.cents ?? 0n) + monthly,
          });
        }
      });

      return ok({
        currency: ccy,
        bucket,
        rangeTotals,
        timeline,
        plannedAvgVsReal,
        recurringPerMonth: perMonth.map((cents, i) => ({
          month: i + 1,
          planned_cents: cents.toString(),
          items: perMonthItems[i]!,
        })),
        recurringPerCategory: Array.from(perCategory.entries()).map(
          ([category_id, v]) => ({
            category_id,
            name: v.name,
            planned_cents: v.cents.toString(),
          }),
        ),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
