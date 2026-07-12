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
import { type IncomeForNormalize } from "./investment-smart-limit";
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
    categoryId?: string,
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
   * r33: active incomes + FX, used ONLY to compute the smart Investments limit
   * (income − Σ other planned) as its plannedAvgVsReal value. Optional — a budget
   * with no Investments category never touches them.
   */
  incomeRepo?: {
    listActive(tenantId: string): Promise<IncomeForNormalize[]>;
  };
}

export interface GetOverviewPlannedInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  categoryId?: string;
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
  }[];
  plannedAvgVsReal: {
    category_id: string;
    name: string;
    planned_avg_cents: string;
    real_avg_cents: string;
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

      const [planned, spend, windows, rules] = await Promise.all([
        deps.repo.monthlyPlannedByCategory(
          input.budgetId,
          input.from,
          input.to,
        ),
        deps.repo.monthlySpendByCategory(input.budgetId, input.from, input.to),
        deps.repo.categoryWindows(input.budgetId),
        deps.repo.activeRecurringRules(input.budgetId),
      ]);

      // Investment categories are excluded from the "All categories" planned-vs-
      // actual TIMELINE — investing isn't spending, so it shouldn't inflate the
      // spend line (item 1). Still shown if the user explicitly picks it in the
      // category selector. The avg-by-category chart KEEPS it (r33 smart limit).
      const investmentIds = new Set(
        windows.filter((w) => w.is_investment).map((w) => w.category_id),
      );
      const inCat = (catId: string) =>
        input.categoryId
          ? catId === input.categoryId
          : !investmentIds.has(catId);

      // ---- timeline ----
      let timeline: OverviewPlannedDTO["timeline"];
      if (bucket === "monthly") {
        const months = monthsInRange(input.from, input.to);
        const plannedByMonth = new Map<string, bigint>();
        const needsByMonth = new Map<string, bigint>();
        const spendByMonth = new Map<string, bigint>();
        for (const p of planned)
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
          };
        });
      } else {
        // daily: cumulative confirmed spend per returned day; planned = the
        // active monthly limit for that day's month (flat target line).
        const days = await deps.repo.dailySpend(
          input.budgetId,
          input.from,
          input.to,
          input.categoryId,
        );
        const plannedByMonth = new Map<string, bigint>();
        const needsByMonth = new Map<string, bigint>();
        for (const p of planned)
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
        // needs/wants split for a given day's month (planned = needs + wants).
        const splitAt = (month: string) => {
          const planned = plannedByMonth.get(month) ?? 0n;
          const needs = needsByMonth.get(month) ?? 0n;
          return {
            planned_cents: planned.toString(),
            needs_cents: needs.toString(),
            wants_cents: (planned > needs ? planned - needs : 0n).toString(),
          };
        };
        const anyPlanned = [...plannedByMonth.values()].some((v) => v > 0n);
        // Render the (flat) line whenever there's a planned limit OR a single
        // category is being inspected — a selected category with a 0 budget should
        // still draw a 0-line (parity with the monthly view), NOT "No activity".
        // Only the All-categories view with nothing planned keeps the empty message.
        if (days.length === 0 && (anyPlanned || input.categoryId)) {
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
          timeline = [...days]
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((d) => {
              cumulative += d.spent_cents;
              return {
                label: d.day,
                ...splitAt(d.day.slice(0, 7)),
                real_cents: cumulative.toString(),
              };
            });
        }
      }

      // ---- planned-avg vs real-avg over active months only (D-13/D-06) ----
      const rangeMonths = monthsInRange(input.from, input.to);
      const plannedKey = new Map<string, bigint>();
      const spendKey = new Map<string, bigint>();
      for (const p of planned)
        plannedKey.set(`${p.category_id}|${p.month}`, p.planned_cents);
      for (const s of spend)
        spendKey.set(`${s.category_id}|${s.month}`, s.spent_cents);

      const plannedAvgVsReal = windows
        .map((w) => {
          // Investing isn't spending — exclude it from the over/under-budget-by-
          // category chart entirely (its smart limit dwarfs every real category and
          // isn't a "budget vs actual" comparison anyway).
          if (w.is_investment) return null;
          const active = rangeMonths.filter(
            (m) =>
              m >= w.created_month &&
              (w.archived_month === null || m <= w.archived_month),
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
