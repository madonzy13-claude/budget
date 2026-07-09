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
  name: string | null;
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
  timeline: { label: string; planned_cents: string; real_cents: string }[];
  plannedAvgVsReal: {
    category_id: string;
    name: string;
    planned_avg_cents: string;
    real_avg_cents: string;
  }[];
  recurringPerMonth: { month: number; planned_cents: string }[];
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

      const inCat = (catId: string) =>
        !input.categoryId || catId === input.categoryId;

      // ---- timeline ----
      let timeline: OverviewPlannedDTO["timeline"];
      if (bucket === "monthly") {
        const months = monthsInRange(input.from, input.to);
        const plannedByMonth = new Map<string, bigint>();
        const spendByMonth = new Map<string, bigint>();
        for (const p of planned)
          if (inCat(p.category_id))
            plannedByMonth.set(
              p.month,
              (plannedByMonth.get(p.month) ?? 0n) + p.planned_cents,
            );
        for (const s of spend)
          if (inCat(s.category_id))
            spendByMonth.set(
              s.month,
              (spendByMonth.get(s.month) ?? 0n) + s.spent_cents,
            );
        timeline = months.map((label) => ({
          label,
          planned_cents: (plannedByMonth.get(label) ?? 0n).toString(),
          real_cents: (spendByMonth.get(label) ?? 0n).toString(),
        }));
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
        for (const p of planned)
          if (inCat(p.category_id))
            plannedByMonth.set(
              p.month,
              (plannedByMonth.get(p.month) ?? 0n) + p.planned_cents,
            );
        let cumulative = 0n;
        timeline = [...days]
          .sort((a, b) => a.day.localeCompare(b.day))
          .map((d) => {
            cumulative += d.spent_cents;
            return {
              label: d.day,
              planned_cents: (
                plannedByMonth.get(d.day.slice(0, 7)) ?? 0n
              ).toString(),
              real_cents: cumulative.toString(),
            };
          });
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
      const perCategory = new Map<string, { name: string; cents: bigint }>();
      rules.forEach((rule, i) => {
        const amt = ruleAmounts[i]!;
        // per-month distribution: where the rule actually fires.
        if (rule.cadence === "YEARLY") {
          const idx = (rule.yearly_month ?? 1) - 1;
          perMonth[idx] = (perMonth[idx] ?? 0n) + amt; // full annual amount in its month
        } else if (rule.cadence === "MONTHLY") {
          for (let m = 0; m < 12; m++) perMonth[m] = (perMonth[m] ?? 0n) + amt;
        } else {
          const monthly = recurringMonthlyNormalize(amt, rule.cadence);
          for (let m = 0; m < 12; m++)
            perMonth[m] = (perMonth[m] ?? 0n) + monthly;
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

      // r33: the smart Investments category has no stored category_limits row, so
      // it lands in plannedAvgVsReal with planned_avg 0. Override its planned with
      // the computed smart limit (monthly income − Σ other planned), matching the
      // spendings grid. real_avg stays 0 (contributions aren't ledger spend).
      const invWindow = windows.find((w) => w.is_investment);
      if (invWindow && deps.incomeRepo && deps.fxProvider) {
        const invRow = plannedAvgVsReal.find(
          (r) => r.category_id === invWindow.category_id,
        );
        if (invRow) {
          const otherPlannedCents = plannedAvgVsReal.reduce(
            (sum, r) =>
              r.category_id === invWindow.category_id
                ? sum
                : sum + BigInt(r.planned_avg_cents),
            0n,
          );
          const incomes = await deps.incomeRepo.listActive(input.tenantId);
          const monthlyIncomeCents = await sumWalletsToCurrency(
            normalizeIncomesToMonthlyItems(incomes),
            ccy,
            deps.fxProvider,
            asOf,
          );
          invRow.planned_avg_cents = computeInvestmentSmartLimit({
            monthlyIncomeCents,
            otherPlannedCents,
          }).toString();
        }
      }

      return ok({
        currency: ccy,
        bucket,
        timeline,
        plannedAvgVsReal,
        recurringPerMonth: perMonth.map((cents, i) => ({
          month: i + 1,
          planned_cents: cents.toString(),
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
