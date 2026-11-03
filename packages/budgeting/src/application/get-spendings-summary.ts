/**
 * get-spendings-summary.ts — Composed read service for the 5-row spendings grid header.
 *
 * DTO returns serialized bigint cents as strings (plannedCents: string, etc).
 * Money value object wrapping happens at the Hono route boundary, NOT here.
 * This follows the precedent established by get-budget-home-summary.ts —
 * cross-check via `grep -n 'plannedCents\|spentCents' packages/budgeting/src/application/get-budget-home-summary.ts`
 *
 * budgetTz is returned at top level to allow Plan 04-04's RSC to skip a second
 * /budgets/:id fetch (resolves D-PH4-Q5 timezone correctness gap).
 *
 * GRID-02, GRID-15, RSCM-03, RSCM-04
 *
 * Phase 14 (D-08): a limit in a currency other than the budget's counts at
 * LEAST(last day of the viewed month, today) — the current month at the latest
 * rate, a past month at the last rate within it (frozen; later rates never move
 * it). "Today" is serverNow() in the budget timezone (test-clock aware). A limit
 * whose pair has no rate counts as 0 and is flagged — the summary never fails
 * on FX.
 */
import { ok, err, serverNow, type Result } from "@budget/shared-kernel";
import type { Currency, FxProvider } from "@budget/shared-kernel";
// (Result re-exported from the import above; do not re-import it.)
import { Temporal } from "temporal-polyfill";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryLimitRepo, EffectiveLimit } from "../ports/category-limit-repo";
import { convertCents } from "../domain/fx-round";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { SpendingsSummaryRepo } from "../ports/spendings-summary-repo";
import type { ReservePositionsResult } from "./get-reserve-positions";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import {
  computeInvestmentSmartLimit,
  normalizeIncomesToMonthlyItems,
  type IncomeForNormalize,
} from "./investment-smart-limit";

export interface GetSpendingsSummaryDeps {
  categoryRepo: CategoryRepo;
  categoryLimitRepo: CategoryLimitRepo;
  transactionRepo: TransactionRepo;
  summaryRepo: SpendingsSummaryRepo;
  /**
   * Canonical reserve calculator (05-12 replay orchestrator). The grid's
   * reserveUsed/overspent for a month come straight from the engine cells:
   * positions.get(catId).byMonth.get(month).{usedCents,overspentCents}. One
   * engine-derived reserve per category, shared with the reserves tab. Required
   * — the old reserve_actual_cents fallback is gone.
   */
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
    month?: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  /**
   * r33: active incomes + FX, used ONLY to compute the smart Investments limit
   * (income − Σ other planned). Optional — a budget with no Investments category
   * never touches them, so callers without an investment feature can omit both.
   */
  incomeRepo?: {
    listActive(tenantId: string): Promise<IncomeForNormalize[]>;
  };
  fxProvider?: FxProvider;
  /** Clock for the current-month boundary and the D-08 rate date; defaults to serverNow(). */
  now?: () => Date;
}

export interface GetSpendingsSummaryInput {
  tenantId: string;
  budgetId: string;
  month: string; // YYYY-MM
}

export interface SpendingsSummaryCategoryDTO {
  categoryId: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  sortIndex: number;
  plannedCents: string;
  cushionCents: string;
  /** Phase 14 (D-08): the limit as typed, in its own currency. plannedCents above
   *  is the same limit in the budget currency. */
  limitOriginalCents: string;
  limitCurrency: string;
  /** The limit's amounts as typed, in limitCurrency — what the editor prefills. */
  limitOriginal?: {
    plannedCents: string;
    cushionCents: string;
    needsCents: string | null;
    wantsCents: string | null;
  };
  /** No FX rate for the limit's currency — it counts as 0 here. */
  fxUnavailable?: boolean;
  /** A category in another currency than the budget's: the same column
   *  figures in the CATEGORY's own currency (spent at each row's date, limit
   *  as typed, reserve native). The grid column reads these; totals and
   *  charts keep the budget-currency fields. Absent for a same-currency one. */
  own?: {
    currency: string;
    plannedCents: string;
    cushionCents: string;
    activeBudgetCents: string;
    spentCents: string;
    reserveUsedCents: string;
    reserveAvailableCents: string;
    overspentCents: string;
    balanceCents: string;
  };
  /** 0061: persisted needs/wants split of plannedCents (null = never set, the
   *  editor then falls back to needs = planned, wants = 0). */
  needsCents: string | null;
  wantsCents: string | null;
  activeBudgetCents: string;
  spentCents: string;
  /** Reserve drawn for THIS month (clamped ≤ reserveAvailableCents). */
  reserveUsedCents: string;
  /** Reserve AVAILABLE to this month = used + free reserve at the month's end.
   *  The denominator of the "used / available" display. */
  reserveAvailableCents: string;
  /** reserve_excluded NOW — the grid renders "available" as a dash when true. */
  reserveExcluded: boolean;
  /** 0083: unbounded THIS month. The grid renders overspent + reserve-used as a
   *  dash — such a category cannot be overspent and accrues nothing, so the 0s
   *  those fields carry are true but meaningless, and "0 zł" reads as a real
   *  measurement. Same shape as reserveExcluded above: the numbers stay honest
   *  for every other consumer, and only the display changes.
   *  plannedCents/needsCents/wantsCents hold the category's scheduled payments
   *  due this month — its implicit plan — rather than a typed limit. */
  noLimit: boolean;
  /** Archived "keep history" (archived_from set) — the grid renders this column
   *  greyed + read-only (no quick entry / edit). Hidden entirely in future months. */
  archived: boolean;
  /** Overspend NOT covered by reserve for THIS month (overage − reserveUsed).
   *  For the Investments category the grid relabels this "overinvested" + green. */
  overspentCents: string;
  balanceCents: string;
  /** r33: THE Investments category — grid pins it, greens the overinvested row,
   *  dashes its reserve, and swaps its edit form to the smart/manual limit picker. */
  isInvestment: boolean;
  /** 'manual' | 'smart' | null (null for every normal category). */
  investmentLimitMode: string | null;
}

export interface SpendingsSummaryDTO {
  month: string;
  budgetCurrency: string;
  budgetTz: string; // IANA timezone — resolves D-PH4-Q5 RSC timezone gap
  cushionModeEnabled: boolean;
  /** The mode the VIEWED month ran under. Optional so a cached payload from
   *  before this existed still parses; callers fall back to the flag above. */
  cushionModeForMonth?: boolean;
  /** r40: newest created_at over confirmed, non-deleted spendings (ISO) —
   *  the "last spending added" footer. Budget-wide, NOT month-scoped; null
   *  when the budget has no confirmed spendings. */
  lastSpendingAddedAt: string | null;
  categories: SpendingsSummaryCategoryDTO[];
}

export function getSpendingsSummary(deps: GetSpendingsSummaryDeps) {
  return async (
    input: GetSpendingsSummaryInput,
  ): Promise<Result<SpendingsSummaryDTO, Error>> => {
    try {
      if (!/^\d{4}-\d{2}$/.test(input.month)) {
        return err(new Error("invalid_month"));
      }

      let ym: Temporal.PlainYearMonth;
      try {
        ym = Temporal.PlainYearMonth.from(input.month);
      } catch {
        return err(new Error("invalid_month"));
      }
      const monthStart = ym.toPlainDate({ day: 1 }).toString(); // YYYY-MM-01
      const monthEnd = ym.add({ months: 1 }).toPlainDate({ day: 1 }).toString();

      const meta = await deps.summaryRepo.getBudgetMeta(
        input.tenantId,
        input.budgetId,
      );
      if (!meta) return err(new Error("budget_not_found"));

      const [categories, perCatSpend, rawLimits, posResult] =
        await Promise.all([
          deps.categoryRepo.listForBudget(
            input.tenantId,
            input.budgetId,
            false,
            monthStart, // month-removed categories stay visible in their active months
          ),
          deps.transactionRepo.spendByCategoryForMonth(
            input.tenantId,
            input.budgetId,
            monthStart,
            monthEnd,
          ),
          deps.categoryLimitRepo.effectiveForMonth(
            input.tenantId,
            input.budgetId,
            monthStart,
          ),
          // Reserve cells are sliced from the CURRENT-month pool computation, NOT
          // recomputed at the viewed month. A per-category reserve is a single
          // POOL whose coverage depends on the whole ledger (leftover reserve
          // sweeps onto any month's overspend). Passing the viewed month as the
          // open month would truncate LATER spend (loader date-bounds spend at the
          // open month) while still loading later reserve top-ups — so those
          // top-ups would sweep back onto the viewed past month, making its cell
          // differ from the same month seen "live". Omitting month → loader uses
          // serverNow()'s month, and byMonth.get(input.month) selects the slice.
          // This also keeps the grid numbers identical to the reserves tab.
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
        ]);

      // D-08: limits into the budget currency at LEAST(month's last day, today).
      const now = (deps.now ?? serverNow)();
      const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
        .toZonedDateTimeISO(meta.timezone || "UTC")
        .toPlainDate()
        .toString();
      const lastDay = ym.toPlainDate({ day: ym.daysInMonth }).toString();
      const rateDate = new Date(`${lastDay < today ? lastDay : today}T00:00:00Z`);
      const rates = new Map<string, Promise<string | null>>();
      const rateTo = (ccy: string): Promise<string | null> => {
        if (ccy === meta.currency) return Promise.resolve("1");
        let r = rates.get(ccy);
        if (!r) {
          const fx = deps.fxProvider;
          r = fx
            ? fx.rateAsOf(ccy as Currency, meta.currency as Currency, rateDate).then((x) => x.rate, () => null)
            : Promise.resolve(null);
          rates.set(ccy, r);
        }
        return r;
      };
      const effectiveLimits = new Map<
        string,
        EffectiveLimit & { originalPlanned: bigint; original?: EffectiveLimit; fxUnavailable: boolean }
      >();
      for (const [catId, l] of rawLimits) {
        const normalCcy = l.normalCurrency ?? meta.currency;
        const nRate = await rateTo(normalCcy);
        const cRate = await rateTo(l.cushionCurrency ?? meta.currency);
        const conv = (v: bigint, rate: string | null) => (rate === null ? 0n : convertCents(v, rate));
        effectiveLimits.set(catId, {
          ...l,
          planned: conv(l.planned, nRate),
          cushion: conv(l.cushion, cRate),
          needs: l.needs == null ? null : conv(l.needs, nRate),
          wants: l.wants == null ? null : conv(l.wants, nRate),
          normalCurrency: normalCcy,
          originalPlanned: l.planned,
          original: l,
          fxUnavailable: nRate === null || cRate === null,
        });
      }

      // 05-12: reserveUsed + overspent for the viewed month come STRAIGHT from
      // the engine cells (one reserve per category, shared with the reserves
      // tab). No reserve_actual fallback, no funded/available concept.
      if (posResult.isErr()) return err(posResult.error);
      const positions = posResult.value.positions;
      // Resolved ONCE for the viewed month: the engine already worked out which
      // limit each month was judged against, so the column can read the same
      // answer instead of asking the budget what mode it is in now.
      const monthCushionMode =
        posResult.value.cushionByMonth?.get(input.month) ??
        meta.cushionModeEnabled;

      // r33: resolve the smart Investments category's planned BEFORE the sync map.
      // SMART = monthly income (FX→budget ccy) − Σ planned of every OTHER active
      // category, clamped ≥ 0. MANUAL keeps its stored limit. Either way the
      // Investments category carries no cushion (forced to 0 in the map below).
      const invCat = categories.find((c) => (c as any).isInvestment) as
        { id: string; investmentLimitMode?: string | null } | undefined;
      let investmentPlannedOverride: bigint | null = null;
      if (invCat) {
        if (invCat.investmentLimitMode === "smart") {
          let otherPlanned = 0n;
          for (const c of categories) {
            if (c.id === invCat.id) continue;
            otherPlanned += effectiveLimits.get(c.id)?.planned ?? 0n;
          }
          let monthlyIncome = 0n;
          if (deps.incomeRepo && deps.fxProvider) {
            const incomes = await deps.incomeRepo.listActive(input.tenantId);
            // The month being summarised is the month a ONE-TIME income is
            // judged against: it counts here only if it arrives in it (260807).
            const items = normalizeIncomesToMonthlyItems(
              incomes,
              ym.toString(),
            );
            const asOf = now;
            monthlyIncome = await sumWalletsToCurrency(
              items,
              meta.currency,
              deps.fxProvider,
              asOf,
            );
          }
          investmentPlannedOverride = computeInvestmentSmartLimit({
            monthlyIncomeCents: monthlyIncome,
            otherPlannedCents: otherPlanned,
          });
        } else {
          // manual — keep the stored limit; override only forces cushion 0.
          investmentPlannedOverride =
            effectiveLimits.get(invCat.id)?.planned ?? 0n;
        }
      }

      // Phase 14: reserve cells are in each category's own currency (D-10);
      // the grid reads them in the budget currency at the same rate date as
      // the limits (D-08).
      const reserveRate = new Map<string, string | null>();
      for (const ccy of new Set(posResult.value.categoryCurrency?.values() ?? [])) {
        reserveRate.set(ccy, await rateTo(ccy));
      }
      const reserveIn = (catId: string, cents: bigint) => {
        const ccy = posResult.value.categoryCurrency?.get(catId) ?? meta.currency;
        if (ccy === meta.currency) return cents;
        const r = reserveRate.get(ccy);
        return r == null ? 0n : convertCents(cents, r);
      };

      const ownSpend = deps.transactionRepo.spendByCategoryForMonthInCategoryCurrency
        ? await deps.transactionRepo.spendByCategoryForMonthInCategoryCurrency(
            input.tenantId,
            input.budgetId,
            monthStart,
            monthEnd,
          )
        : new Map<string, bigint>();

      const dtoCategories: SpendingsSummaryCategoryDTO[] = categories
        .sort((a, b) => (a as any).sortIndex - (b as any).sortIndex)
        .map((c) => {
          const limits = effectiveLimits.get(c.id) ?? {
            planned: 0n,
            cushion: 0n,
            needs: null,
            wants: null,
            noLimit: false,
            normalCurrency: c.currency ?? meta.currency,
            cushionCurrency: c.currency ?? meta.currency,
            originalPlanned: 0n,
            fxUnavailable: false,
          };
          const isInvestment = Boolean((c as any).isInvestment);
          const spent = perCatSpend.get(c.id) ?? 0n;
          // 0083: a No-limit category's implicit plan is WHAT IT SPENT, counted
          // entirely as needs (user, 260820). It was the category's scheduled
          // payments until then; the scheduled total is not what the month cost,
          // so the charts showed a plan the household never recognised.
          // A cushion month makes Investments UNBOUNDED (user, 260904g). It used
          // to be handed a limit of 0, which is a different claim: a plan of
          // zero is a cap that every złoty spent is outside, so a household
          // investing in a tight month read as fully overspent. "No limit" says
          // the true thing, and it is a shape the rest of this function already
          // understands — plan becomes what it actually cost, overage becomes 0,
          // and the grid renders its dashes — so nothing below needs to know
          // that investing is the reason.
          const noLimit =
            limits.noLimit === true || (isInvestment && monthCushionMode);
          const planned = noLimit
            ? spent
            : isInvestment && investmentPlannedOverride !== null
              ? investmentPlannedOverride
              : limits.planned;
          // Investments has no cushion → 0. In cushion mode its limit therefore
          // shows 0 (you shouldn't invest when the budget is on the tighter
          // cushion). Outside cushion mode it shows the smart/manual planned.
          const cushion = isInvestment ? 0n : limits.cushion;
          // The VIEWED month's mode, not the budget's mode today (user report,
          // 260806). A month that ran in cushion mode is judged against the
          // cushion limit — the engine has always done that — but this column
          // read `meta.cushionModeEnabled`, which is how the budget stands NOW.
          // Look back at a cushion month from a normal one and it showed the
          // normal limit beside an overspend measured against the cushion one:
          // "planned 500" over "overspent 450" with a cushion limit of zero.
          // No fallback between the two figures in either direction (user rule):
          // the mode picks one, and that is the limit.
          // A No-limit category has no cushion figure either (both amounts are
          // 0 on the row), so in a cushion month the plain ternary would hand
          // back 0 and the runway would read it as costing nothing. Its plan is
          // its scheduled payments in either mode.
          const active = noLimit
            ? planned
            : monthCushionMode
              ? cushion
              : planned;

          // Engine cell for THIS month → used + overspent + the free reserve at the
          // month's end. When the engine emitted no cell (no activity it tracked),
          // fall back to the raw over-budget figure with no reserve coverage.
          const pos = positions.get(c.id);
          const cell = pos?.byMonth.get(input.month);
          const reserveExcluded = pos?.reserveExcluded ?? false;
          // The Investments category's limit (smart or manual) isn't the stored
          // category_limits value the reserve engine used, so its engine overage
          // is wrong (spent − stored 0 = full spend). Derive overinvested from the
          // OVERRIDE limit here instead. It's reserve-excluded → no reserve to net.
          // A No-limit category cannot be overspent. The engine already says so,
          // but the `??` fallback below fires when the engine emitted no cell —
          // and `spent − implicitPlan` would then invent an overspend out of the
          // scheduled figure, which is a plan, not a cap.
          const overage = noLimit
            ? 0n
            : isInvestment
              ? spent > active
                ? spent - active
                : 0n
              : cell
                ? reserveIn(c.id, cell.overageCents)
                : spent > active
                  ? spent - active
                  : 0n;
          const rawUsed = reserveIn(c.id, cell?.usedCents ?? 0n);
          // "Reserve available to this month" = used + free reserve at month's end
          // (clamped ≥ 0). Used is then clamped ≤ available so we never display
          // spending more reserve than was available — e.g. if the reserve was later
          // reduced below what this month had used, the shown used drops to match.
          const endReserve = reserveIn(c.id, cell?.endReserveCents ?? 0n);
          const reserveAvailable =
            rawUsed + endReserve > 0n ? rawUsed + endReserve : 0n;
          const reserveUsed =
            rawUsed < reserveAvailable ? rawUsed : reserveAvailable;
          const overspent = overage - reserveUsed;
          const balance = active - spent + reserveUsed;

          // The column in the category's own currency (user, 261103).
          const catCcy = posResult.value.categoryCurrency?.get(c.id) ?? c.currency ?? meta.currency;
          let own: SpendingsSummaryCategoryDTO["own"];
          if (catCcy !== meta.currency && !isInvestment && limits.original) {
            const o = limits.original;
            const oSpent = ownSpend.get(c.id) ?? 0n;
            const oActive = noLimit ? oSpent : monthCushionMode ? o.cushion : o.planned;
            const oOver = noLimit ? 0n : (cell?.overageCents ?? (oSpent > oActive ? oSpent - oActive : 0n));
            const oUsedRaw = cell?.usedCents ?? 0n;
            const oEnd = cell?.endReserveCents ?? 0n;
            const oAvail = oUsedRaw + oEnd > 0n ? oUsedRaw + oEnd : 0n;
            const oUsed = oUsedRaw < oAvail ? oUsedRaw : oAvail;
            own = {
              currency: catCcy,
              plannedCents: (noLimit ? oSpent : o.planned).toString(),
              cushionCents: o.cushion.toString(),
              activeBudgetCents: oActive.toString(),
              spentCents: oSpent.toString(),
              reserveUsedCents: oUsed.toString(),
              reserveAvailableCents: oAvail.toString(),
              overspentCents: (oOver - oUsed).toString(),
              balanceCents: (oActive - oSpent + oUsed).toString(),
            };
          }

          return {
            categoryId: c.id,
            name: c.name,
            iconKey: (c as any).iconKey ?? null,
            // 260613-v1p: colorKey is now a REAL persisted field on the domain
            // Category (was a dead `(c as any)` cast that was always null).
            colorKey: c.colorKey ?? null,
            sortIndex: (c as any).sortIndex ?? 0,
            plannedCents: planned.toString(),
            cushionCents: cushion.toString(),
            limitOriginalCents: limits.originalPlanned.toString(),
            limitCurrency: limits.normalCurrency ?? meta.currency,
            ...(limits.original
              ? {
                  limitOriginal: {
                    plannedCents: limits.original.planned.toString(),
                    cushionCents: limits.original.cushion.toString(),
                    needsCents: limits.original.needs == null ? null : limits.original.needs.toString(),
                    wantsCents: limits.original.wants == null ? null : limits.original.wants.toString(),
                  },
                }
              : {}),
            ...(limits.fxUnavailable ? { fxUnavailable: true } : {}),
            ...(own ? { own } : {}),
            // 0061: the persisted needs/wants split (null when never set → the
            // editor falls back to needs = planned, wants = 0).
            needsCents: noLimit
              ? planned.toString()
              : limits.needs != null
                ? limits.needs.toString()
                : null,
            wantsCents: noLimit
              ? "0"
              : limits.wants != null
                ? limits.wants.toString()
                : null,
            activeBudgetCents: active.toString(),
            spentCents: spent.toString(),
            reserveUsedCents: reserveUsed.toString(),
            reserveAvailableCents: reserveAvailable.toString(),
            reserveExcluded,
            noLimit,
            archived: (c as any).archivedFrom != null,
            overspentCents: overspent.toString(),
            balanceCents: balance.toString(),
            isInvestment,
            investmentLimitMode: (c as any).investmentLimitMode ?? null,
          };
        });

      const lastSpendingAddedAt =
        await deps.transactionRepo.latestSpendingCreatedAt(
          input.tenantId,
          input.budgetId,
          monthStart,
          monthEnd,
        );

      return ok({
        month: input.month,
        budgetCurrency: meta.currency,
        budgetTz: meta.timezone,
        cushionModeEnabled: meta.cushionModeEnabled,
        // The mode the VIEWED month actually ran under. `cushionModeEnabled`
        // above is how the budget stands TODAY, which is a different question
        // for any past month — a month completed on the cushion keeps its
        // cushion limit for good (user, 260806).
        cushionModeForMonth: monthCushionMode,
        lastSpendingAddedAt,
        categories: dtoCategories,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
