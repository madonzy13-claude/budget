/**
 * reserve-event-loader-repo.ts — Drizzle adapter for ReserveEventLoaderRepo.
 *
 * Phase 05 reserve rewrite (decision A/B): loads the ordered RAW reserve events
 * for one budget so the orchestrator (05-12) can replay them through
 * reserve-engine.ts. Replaces the VIEW-based reserve-balance-repo reads.
 *
 * Composition (do NOT re-implement limit/wallet SQL — reuse the ports):
 *   - limitsByMonth           → categoryLimitRepo.effectiveForMonths (one query)
 *   - wallets per currency    → reservesSummaryRepo.reserveWalletsByCurrency
 *
 * In-adapter raw SQL (Drizzle/SQL stays ONLY here, per CLAUDE.md hex rule):
 *   - budget meta (timezone, default_currency, reserves_enabled) from tenancy.budgets
 *   - cushionHistory          → budgeting.budget_mode_history (ASC)
 *   - adjustmentsByCategory   → budgeting.category_reserve_adjustments (ASC)
 *   - categoryFlags           → budgeting.categories
 *   - spend rows              → budgeting.expense_ledger, one row per payment
 *
 * Phase 14 (D-10 / D-17): every amount the engine sees is in the category's
 * CURRENT currency. A payment converts at its own date; an adjustment at its
 * own date; a CLOSED month whose limit was in another currency (the category's
 * currency changed since) is computed in that month's currency and only its
 * RESULT converts — a leftover at the month's closing rate, an overspend at the
 * date(s) that pushed it past the limit (reserve-month-conversion.ts). Only past
 * rates are ever read for a closed month, so closed months never move. A row
 * with no FX pair is left out and `fxUnavailable` is set — never booked at par.
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
import { TenantId, UserId, serverNow } from "@budget/shared-kernel";
import type {
  ReserveEventInputs,
  ReserveEventLoaderRepo,
} from "../../ports/reserve-event-loader-repo";
import type { TransactionRepo } from "../../ports/transaction-repo";
import type { CategoryLimitRepo } from "../../ports/category-limit-repo";
import type { ReservesSummaryRepo } from "../../ports/reserves-summary-repo";
import { convertCents } from "../../domain/fx-round";
import {
  convertClosedMonthResult,
  toEngineMonthEvents,
} from "../../domain/reserve-month-conversion";

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
  // transactionRepo stays in the deps for wiring compatibility; spend is read
  // per row here (Phase 14) because each payment converts at its own date.
  const { categoryLimitRepo, reservesSummaryRepo } = deps;

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
        // serverNow() = real now() unless the gated test clock is on.
        currentYM = ymOfInstant(
          Temporal.Instant.fromEpochMilliseconds(serverNow().getTime()),
          tz,
        );
      }
      const openMonth = currentYM.toString(); // 'YYYY-MM'
      const nextMonthStart = currentYM
        .add({ months: 1 })
        .toPlainDate({ day: 1 })
        .toString(); // 'YYYY-MM-01' (exclusive upper bound — covers the open month)

      // ── Compose existing repos (no re-implemented SQL) + in-adapter raw SQL.
      const [reserveWallets, rawEvents] =
        await Promise.all([
          reservesSummaryRepo.reserveWalletsByCurrency(tenantId),
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
                             currency::text AS currency,
                             to_char(occurred_at, 'YYYY-MM-DD') AS occurred_date,
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
                             sort_index,
                             currency::text AS currency
                        FROM budgeting.categories
                       WHERE tenant_id = ${tenantId}::uuid`,
              )
            ).rows;
            // One row per confirmed payment, in fold order; `native` is the
            // amount in the category's current currency at the payment's date
            // (NULL: no FX pair).
            const txRows = (
              await drizzleTx.execute(
                sql`SELECT l.category_id::text AS category_id,
                             l.transaction_date::text AS d,
                             to_char(l.transaction_date, 'YYYY-MM') AS month,
                             l.amount_original_cents::text AS cents,
                             l.currency_original AS ccy,
                             budgeting.fx_convert(l.amount_original_cents, l.currency_original,
                                                  c.currency::text, l.transaction_date)::text AS native
                        FROM budgeting.expense_ledger l
                        JOIN budgeting.categories c ON c.id = l.category_id
                       WHERE l.tenant_id = ${tenantId}::uuid
                         AND l.budget_id = ${budgetId}::uuid
                         AND l.kind = 'SPENDING'
                         AND l.transaction_date < ${nextMonthStart}::date
                         AND l.confirmed_at IS NOT NULL
                         AND l.deleted_at IS NULL
                       ORDER BY l.category_id, l.transaction_date, l.created_at, l.id`,
              )
            ).rows;
            return { cushionRows, adjustmentRows, categoryRows, txRows };
          }),
        ]);
      if (rawEvents.isErr()) throw rawEvents.error;
      const { cushionRows, adjustmentRows, categoryRows, txRows } =
        rawEvents.value;

      // ── Currencies + rates (Phase 14).
      const categoryCurrency = new Map<string, string>();
      for (const r of categoryRows) {
        categoryCurrency.set(r.id as string, ((r.currency as string) ?? budgetCurrency).trim());
      }
      const ccyOf = (catId: string) => categoryCurrency.get(catId) ?? budgetCurrency;
      let fxUnavailable = false;
      const rates = new Map<string, Promise<string | null>>();
      /** Rate on `date`, else the most recent prior, else the earliest — the
       *  same semantics as budgeting.fx_convert. null = no pair at all. */
      const rate = (from: string, to: string, date: string): Promise<string | null> => {
        if (from === to) return Promise.resolve("1");
        const key = `${from}|${to}|${date}`;
        let hit = rates.get(key);
        if (!hit) {
          hit = withTenantTx(TenantId(tenantId), UserId(tenantId), async (tx) => {
            const rs = await (
              tx as { execute: (q: unknown) => Promise<{ rows: Array<{ rate: string | null }> }> }
            ).execute(sql`
              SELECT COALESCE(
                (SELECT rate::text FROM budgeting.fx_rates
                  WHERE base = ${from}::bpchar AND quote = ${to}::bpchar AND date <= ${date}::date
                  ORDER BY date DESC LIMIT 1),
                (SELECT rate::text FROM budgeting.fx_rates
                  WHERE base = ${from}::bpchar AND quote = ${to}::bpchar
                  ORDER BY date ASC LIMIT 1)) AS rate`);
            return rs.rows[0]?.rate ?? null;
          }).then((r) => {
            if (r.isErr()) throw r.error;
            return r.value;
          });
          rates.set(key, hit);
        }
        return hit;
      };

      // ── Payments grouped per category + month; native spend summed.
      type TxRow = { d: string; cents: bigint; ccy: string };
      const txByCatMonth = new Map<string, Map<string, TxRow[]>>();
      const spendByCategoryByMonth = new Map<string, Map<string, bigint>>();
      const nativeGap = new Set<string>(); // `${cat}|${month}` with an unconvertible row
      for (const r of txRows) {
        const cat = r.category_id as string;
        const month = r.month as string;
        let byMonth = txByCatMonth.get(cat);
        if (!byMonth) txByCatMonth.set(cat, (byMonth = new Map()));
        const arr = byMonth.get(month) ?? [];
        arr.push({ d: r.d as string, cents: BigInt(r.cents as string), ccy: (r.ccy as string).trim() });
        byMonth.set(month, arr);
        let spend = spendByCategoryByMonth.get(cat);
        if (!spend) spendByCategoryByMonth.set(cat, (spend = new Map()));
        if (r.native == null) nativeGap.add(`${cat}|${month}`);
        spend.set(month, (spend.get(month) ?? 0n) + (r.native == null ? 0n : BigInt(r.native as string)));
      }

      // ── limitsByMonth: every month present in spend ∪ {openMonth}.
      const monthKeys = new Set<string>([openMonth]);
      for (const byMonth of spendByCategoryByMonth.values()) {
        for (const m of byMonth.keys()) monthKeys.add(m);
      }
      // ONE query for every month, not one per month. This used to be a
      // Promise.all over `effectiveForMonth`, which looks concurrent but is
      // still 35 separate transactions on a three-year budget — each carrying
      // two SET LOCAL statements for the RLS GUCs. The all-budgets aggregate
      // was issuing 424 limit lookups and ~500 GUC statements per request,
      // about a second of round-trip against ~0.1ms of actual query time.
      const months = [...monthKeys];
      const limitsForMonths = await categoryLimitRepo.effectiveForMonths(
        tenantId,
        budgetId,
        months.map((m) => `${m}-01`),
      );
      const limitsByMonth = new Map<
        string,
        Map<
          string,
          { plannedCents: bigint; cushionCents: bigint; noLimit: boolean }
        >
      >();
      // ── cushionHistory: ordered { fromMonth, on } segments (ascending).
      const cushionHistory = cushionRows.map((r) => ({
        fromMonth: toMonthKey(r.from_month),
        on: (r.mode as string) === "CUSHION",
      }));
      const cushionOn = (m: string) => {
        let on = false;
        for (const seg of cushionHistory) if (seg.fromMonth <= m) on = seg.on;
        return on;
      };
      const today = Temporal.Instant.fromEpochMilliseconds(serverNow().getTime())
        .toZonedDateTimeISO(tz)
        .toPlainDate()
        .toString();

      for (const m of months) {
        const limits = limitsForMonths.get(`${m}-01`) ?? new Map();
        const mapped = new Map<
          string,
          { plannedCents: bigint; cushionCents: bigint; noLimit: boolean }
        >();
        for (const [catId, v] of limits) {
          const catCcy = ccyOf(catId);
          const segN = (v.normalCurrency ?? catCcy).trim();
          const segC = (v.cushionCurrency ?? catCcy).trim();
          if (segN === catCcy && segC === catCcy) {
            mapped.set(catId, { plannedCents: v.planned, cushionCents: v.cushion, noLimit: v.noLimit });
            continue;
          }
          if (m >= openMonth) {
            // Open month: the limit at today's rate (D-08).
            const rN = await rate(segN, catCcy, today);
            const rC = await rate(segC, catCcy, today);
            if (rN === null || rC === null) fxUnavailable = true;
            mapped.set(catId, {
              plannedCents: rN === null ? 0n : convertCents(v.planned, rN),
              cushionCents: rC === null ? 0n : convertCents(v.cushion, rC),
              noLimit: v.noLimit,
            });
            continue;
          }
          // D-17: a closed month in the currency the category had then.
          const lastDay = Temporal.PlainYearMonth.from(m).toPlainDate({ day: 1 }).add({ months: 1 }).subtract({ days: 1 }).toString();
          const closeRate = await rate(segN, catCcy, lastDay);
          const cushionRate = await rate(segC, segN, lastDay);
          const txs: { date: string; cents: bigint }[] = [];
          const rateOnDate = new Map<string, string>();
          let gap = closeRate === null || cushionRate === null;
          for (const t of txByCatMonth.get(catId)?.get(m) ?? []) {
            const toMonth = await rate(t.ccy, segN, t.d);
            const toCurrent = await rate(segN, catCcy, t.d);
            if (toMonth === null || toCurrent === null) {
              gap = true;
              continue;
            }
            txs.push({ date: t.d, cents: convertCents(t.cents, toMonth) });
            rateOnDate.set(t.d, toCurrent);
          }
          if (gap) fxUnavailable = true;
          if (closeRate === null || cushionRate === null) {
            mapped.set(catId, { plannedCents: 0n, cushionCents: 0n, noLimit: v.noLimit });
            continue;
          }
          const eff = cushionOn(m) ? convertCents(v.cushion, cushionRate) : v.planned;
          const ev = toEngineMonthEvents(
            convertClosedMonthResult({
              effLimitCents: eff,
              noLimit: v.noLimit,
              txs,
              closeRate,
              rateOn: (d) => rateOnDate.get(d) ?? closeRate,
            }),
            v.noLimit,
          );
          mapped.set(catId, { plannedCents: ev.normalCents, cushionCents: ev.cushionCents, noLimit: ev.noLimit });
          let spend = spendByCategoryByMonth.get(catId);
          if (!spend) spendByCategoryByMonth.set(catId, (spend = new Map()));
          spend.set(m, ev.spendCents);
          nativeGap.delete(`${catId}|${m}`);
        }
        limitsByMonth.set(m, mapped);
      }
      if (nativeGap.size > 0) fxUnavailable = true;

      // ── D-11..D-16 inputs: today's rates between the budget currency and
      // every currency a reserve is held in or a RESERVE wallet holds.
      const todayRates = new Map<string, string | null>();
      const reserveCurrencies = new Set<string>([
        ...categoryCurrency.values(),
        ...reserveWallets.byCurrency.keys(),
      ]);
      for (const c of reserveCurrencies) {
        if (c === budgetCurrency) continue;
        todayRates.set(`${c}|${budgetCurrency}`, await rate(c, budgetCurrency, today));
        todayRates.set(`${budgetCurrency}|${c}`, await rate(budgetCurrency, c, today));
      }
      let userDefinedCents = 0n;
      for (const [c, cents] of reserveWallets.byCurrency) {
        const r = c === budgetCurrency ? "1" : todayRates.get(`${c}|${budgetCurrency}`);
        if (r == null) fxUnavailable = true;
        else userDefinedCents += convertCents(cents, r);
      }

      // ── adjustmentsByCategory: grouped ordered {delta, month} (occurred_at asc).
      // `month` (the adjustment's open month) scopes its overspent coverage to that
      // month — a closed month is never retroactively covered by an adjust.
      const adjustmentsByCategory = new Map<
        string,
        Array<{ deltaCents: bigint; month: string }>
      >();
      for (const r of adjustmentRows) {
        const catId = r.category_id as string;
        // An adjustment converts at its own date (D-17).
        const adjRate = await rate(
          ((r.currency as string) ?? ccyOf(catId)).trim(),
          ccyOf(catId),
          (r.occurred_date as string) ?? today,
        );
        if (adjRate === null) {
          fxUnavailable = true;
          continue;
        }
        const entry = {
          deltaCents: convertCents(BigInt(String(r.delta_cents ?? "0")), adjRate),
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
        categoryCurrency,
        walletsByCurrency: reserveWallets.byCurrency,
        reserveWalletCurrencies: reserveWallets.currencies,
        todayRates,
        ...(fxUnavailable ? { fxUnavailable: true } : {}),
      };
    },
  };
}

/** date → 'YYYY-MM-DD'. */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return String(v).substring(0, 10);
}
