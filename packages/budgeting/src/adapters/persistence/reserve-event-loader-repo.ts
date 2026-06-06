/**
 * reserve-event-loader-repo.ts — Drizzle adapter for ReserveEventLoaderRepo.
 *
 * Phase 05 reserve rewrite (decision A/B): loads the ordered RAW reserve events
 * for one budget so the orchestrator (05-12) can replay them through
 * reserve-engine.ts. Replaces the VIEW-based reserve-balance-repo reads.
 *
 * Composition (do NOT re-implement spend/limit/wallet SQL — reuse the ports):
 *   - spendByCategoryByMonth  → transactionRepo.spendByCategoryByMonth (exclusive
 *                               upper bound = first day of the month AFTER open)
 *   - limitsByMonth           → categoryLimitRepo.effectiveForMonth per month
 *   - userDefinedCents        → reservesSummaryRepo.sumReserveWalletAmounts
 *
 * In-adapter raw SQL (Drizzle/SQL stays ONLY here, per CLAUDE.md hex rule):
 *   - budget meta (timezone, default_currency, reserves_enabled) from tenancy.budgets
 *   - cushionHistory          → budgeting.budget_mode_history (ASC)
 *   - adjustmentsByCategory   → budgeting.category_reserve_adjustments (ASC)
 *   - categoryFlags           → budgeting.categories
 *
 * Security (threat T-0511-01/02): every SELECT runs inside withTenantTx with the
 * tenant GUC (RLS), and all identifiers are bound as ${value}::uuid parameters —
 * never string-concatenated. Adjustment + categories SELECTs also carry an
 * explicit tenant_id = ${tenantId} predicate (defence in depth).
 *
 * Money at the adapter boundary: cents are bigint here; the engine works in cents
 * and the orchestrator maps to Money for display.
 */
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  ReserveEventInputs,
  ReserveEventLoaderRepo,
} from "../../ports/reserve-event-loader-repo";
import type { TransactionRepo } from "../../ports/transaction-repo";
import type { CategoryLimitRepo } from "../../ports/category-limit-repo";
import type { ReservesSummaryRepo } from "../../ports/reserves-summary-repo";

export interface ReserveEventLoaderRepoDeps {
  transactionRepo: TransactionRepo;
  categoryLimitRepo: CategoryLimitRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
}

/** PlainYearMonth of an instant in the given timezone (polyfill-safe). Mirrors
 *  getReservePositions.ymOfInstant so the open-month boundary is TZ-correct. */
function ymOfInstant(
  inst: Temporal.Instant,
  tz: string,
): Temporal.PlainYearMonth {
  const z = inst.toZonedDateTimeISO(tz);
  return Temporal.PlainYearMonth.from({ year: z.year, month: z.month });
}

/** date/timestamp → 'YYYY-MM' (first 7 chars of the ISO date). */
function toMonthKey(v: unknown): string {
  if (v instanceof Date) return v.toISOString().substring(0, 7);
  return String(v).substring(0, 7);
}

export function createReserveEventLoaderRepo(
  deps: ReserveEventLoaderRepoDeps,
): ReserveEventLoaderRepo {
  const { transactionRepo, categoryLimitRepo, reservesSummaryRepo } = deps;

  return {
    async load(
      tenantId: string,
      budgetId: string,
      openMonthOverride?: string,
    ): Promise<ReserveEventInputs> {
      // ── Budget meta (tz, currency, reserves_enabled) — one tenant-scoped read.
      const meta = await withTenantTx(
        TenantId(tenantId),
        UserId(tenantId), // read-only placeholder actor (must be a valid UUID; matches reserves-summary-repo)
        async (tx) => {
          const drizzleTx = tx as {
            execute: (q: unknown) => Promise<{
              rows: Array<{
                timezone: string | null;
                default_currency: string;
                reserves_enabled: boolean;
              }>;
            }>;
          };
          const rs = await drizzleTx.execute(
            sql`SELECT COALESCE(timezone, 'UTC') AS timezone,
                       default_currency,
                       reserves_enabled
                  FROM tenancy.budgets
                 WHERE id = ${budgetId}::uuid
                 LIMIT 1`,
          );
          return rs.rows[0] ?? null;
        },
      );
      if (meta.isErr()) throw meta.error;
      if (!meta.value) throw new Error("budget_not_found");
      const tz = meta.value.timezone || "UTC";
      const budgetCurrency = meta.value.default_currency ?? "EUR";
      const reservesEnabled = meta.value.reserves_enabled ?? true;

      // ── Resolve the open month (override → validate; else now() in budget tz).
      let currentYM: Temporal.PlainYearMonth;
      if (openMonthOverride) {
        if (!/^\d{4}-\d{2}$/.test(openMonthOverride)) {
          throw new Error("invalid_month");
        }
        currentYM = Temporal.PlainYearMonth.from(openMonthOverride);
      } else {
        currentYM = ymOfInstant(Temporal.Now.instant(), tz);
      }
      const openMonth = currentYM.toString(); // 'YYYY-MM'
      const nextMonthStart = currentYM
        .add({ months: 1 })
        .toPlainDate({ day: 1 })
        .toString(); // 'YYYY-MM-01' (exclusive upper bound — covers the open month)

      // ── Compose existing repos (no re-implemented SQL) + in-adapter raw SQL.
      const [spendByCategoryByMonth, userDefinedCents, rawEvents] =
        await Promise.all([
          transactionRepo.spendByCategoryByMonth(
            tenantId,
            budgetId,
            nextMonthStart,
          ),
          reservesSummaryRepo.sumReserveWalletAmounts(tenantId),
          // cushion history + adjustments + category flags, all tenant-scoped.
          // UserId(tenantId): read-only placeholder actor (valid UUID for the GUC).
          withTenantTx(TenantId(tenantId), UserId(tenantId), async (tx) => {
            const drizzleTx = tx as {
              execute: (
                q: unknown,
              ) => Promise<{ rows: Record<string, unknown>[] }>;
            };
            const cushionRows = (
              await drizzleTx.execute(
                sql`SELECT mode,
                             date_trunc('month', effective_from)::date AS from_month
                        FROM budgeting.budget_mode_history
                       WHERE budget_id = ${budgetId}::uuid
                         AND tenant_id = ${tenantId}::uuid
                       ORDER BY effective_from ASC`,
              )
            ).rows;
            const adjustmentRows = (
              await drizzleTx.execute(
                sql`SELECT category_id::text AS category_id,
                             delta_cents::text AS delta_cents,
                             to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS occurred_month
                        FROM budgeting.category_reserve_adjustments
                       WHERE tenant_id = ${tenantId}::uuid
                       ORDER BY category_id, occurred_at ASC`,
              )
            ).rows;
            const categoryRows = (
              await drizzleTx.execute(
                sql`SELECT id::text AS id,
                             name,
                             reserve_excluded,
                             archived_at,
                             archived_from,
                             sort_index
                        FROM budgeting.categories
                       WHERE tenant_id = ${tenantId}::uuid`,
              )
            ).rows;
            return { cushionRows, adjustmentRows, categoryRows };
          }),
        ]);
      if (rawEvents.isErr()) throw rawEvents.error;
      const { cushionRows, adjustmentRows, categoryRows } = rawEvents.value;

      // ── limitsByMonth: every month present in spend ∪ {openMonth}.
      const monthKeys = new Set<string>([openMonth]);
      for (const byMonth of spendByCategoryByMonth.values()) {
        for (const m of byMonth.keys()) monthKeys.add(m);
      }
      const limitEntries = await Promise.all(
        [...monthKeys].map(async (m) => {
          const limits = await categoryLimitRepo.effectiveForMonth(
            tenantId,
            budgetId,
            `${m}-01`,
          );
          const mapped = new Map<
            string,
            { plannedCents: bigint; cushionCents: bigint }
          >();
          for (const [catId, v] of limits) {
            mapped.set(catId, {
              plannedCents: v.planned,
              cushionCents: v.cushion,
            });
          }
          return [m, mapped] as const;
        }),
      );
      const limitsByMonth = new Map(limitEntries);

      // ── cushionHistory: ordered { fromMonth, on } segments (ascending).
      const cushionHistory = cushionRows.map((r) => ({
        fromMonth: toMonthKey(r.from_month),
        on: (r.mode as string) === "CUSHION",
      }));

      // ── adjustmentsByCategory: grouped ordered {delta, month} (occurred_at asc).
      // `month` (the adjustment's open month) scopes its overspent coverage in the
      // engine — a closed month is never retroactively covered by an adjust.
      const adjustmentsByCategory = new Map<
        string,
        Array<{ deltaCents: bigint; month: string }>
      >();
      for (const r of adjustmentRows) {
        const catId = r.category_id as string;
        const entry = {
          deltaCents: BigInt(String(r.delta_cents ?? "0")),
          month: toMonthKey(r.occurred_month ?? openMonth),
        };
        const arr = adjustmentsByCategory.get(catId);
        if (arr) arr.push(entry);
        else adjustmentsByCategory.set(catId, [entry]);
      }

      // ── categoryFlags (no archived filtering — orchestrator decides, decision J).
      const categoryFlags = new Map<
        string,
        {
          reserveExcluded: boolean;
          archivedAt: string | null;
          archivedFrom: string | null;
          sortIndex: number;
          name: string;
        }
      >();
      for (const r of categoryRows) {
        categoryFlags.set(r.id as string, {
          reserveExcluded: Boolean(r.reserve_excluded),
          archivedAt: r.archived_at
            ? new Date(r.archived_at as string).toISOString()
            : null,
          archivedFrom: r.archived_from ? toDateStr(r.archived_from) : null,
          sortIndex: r.sort_index == null ? 0 : Number(r.sort_index),
          name: (r.name as string) ?? "",
        });
      }

      return {
        spendByCategoryByMonth,
        limitsByMonth,
        cushionHistory,
        adjustmentsByCategory,
        categoryFlags,
        userDefinedCents,
        reservesEnabled,
        openMonth,
        budgetCurrency,
      };
    },
  };
}

/** date → 'YYYY-MM-DD'. */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return String(v).substring(0, 10);
}
