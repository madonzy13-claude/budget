/**
 * reserve-fit-repo.ts — Drizzle adapter for the reserve-fit chart's one-off list
 * (260804).
 *
 * Two jobs:
 *   1. the candidates — the biggest confirmed spends per category in range, each
 *      carrying whether the budget has already un-ticked it and whether it came
 *      from a scheduled rule (a yearly insurance charge is rare AND certain, so
 *      the member should see that before deciding);
 *   2. the toggle — insert/delete a row in budgeting.reserve_fit_exclusions.
 *
 * Only the SHORTLIST is decided here (top 5 per category). Whether a candidate is
 * big enough to bother a human with is policy, and lives in get-reserve-fit.ts
 * where it is unit-testable.
 *
 * Same conventions as overview-repo: own withTenantTx per call (RLS GUC), the
 * ledger's amount_converted_cents is already the budget currency, spend is
 * bucketed by transaction_date, confirmed_at IS NOT NULL is the confirmed filter.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  ReserveFitExclusionsRepo,
  LargeTransactionRow,
} from "../../application/get-reserve-fit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function tx<T>(
  budgetId: string,
  actorUserId: string,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  const r = await withTenantTx(
    TenantId(budgetId),
    UserId(actorUserId),
    async (t) => fn(t as DrizzleTx),
  );
  if (r.isErr()) throw r.error;
  return r.value;
}

/** How many candidates per category the member is offered. */
const SHORTLIST_PER_CATEGORY = 5;

/** Monthly sum of what a budget has set aside — what the planned chart subtracts
 *  from each category's average (its totals stay honest). */
export interface ExcludedSpendRow {
  category_id: string;
  month: string; // YYYY-MM
  cents: bigint;
}

/** One page of the "which spend won't happen again" list. */
export interface OneOffPage {
  items: {
    ledger_id: string;
    category_id: string;
    transaction_date: string;
    note: string | null;
    amount_cents: bigint;
    scheduled_cadence: string | null;
    excluded: boolean;
  }[];
  /** Pass back to fetch the next page; null at the end of the list. */
  next_cursor: string | null;
  /** How many spends in the whole range are set aside — NOT how many of them
   *  this page happens to carry. The chart's badge reads it. */
  excluded_total: number;
}

export interface ReserveFitRepo extends ReserveFitExclusionsRepo {
  /**
   * EVERY spend in the range, biggest first, a page at a time — the dialog
   * used to offer a shortlist of five per category above a size bar, which hid
   * most of the household's spending from a decision it is entitled to make
   * (user, 260813). Repeating charges stay out: they are not one-offs.
   *
   * Keyset pagination on (amount DESC, ledger id) — stable while the member
   * scrolls, and it does not slow down on page fifty the way OFFSET does.
   */
  oneOffPage(input: {
    budgetId: string;
    from: string;
    to: string;
    categoryId?: string | null;
    cursor?: string | null;
    limit: number;
  }): Promise<OneOffPage>;
  excludedSpendByCategory(input: {
    budgetId: string;
    from: string;
    to: string;
  }): Promise<ExcludedSpendRow[]>;
  /** One save of the dialog: what to start ignoring, what to count again. */
  setExclusions(input: {
    budgetId: string;
    add: readonly string[];
    remove: readonly string[];
    actorUserId: string;
  }): Promise<void>;
}

export function createReserveFitRepo(): ReserveFitRepo {
  return {
    async oneOffPage({ budgetId, from, to, categoryId, cursor, limit }) {
      // (set-aside first, then amount DESC, id ASC): a total order, so the
      // cursor can say exactly where the last page stopped without OFFSET's
      // drift or its cost.
      //
      // Set-aside leads because those rows are the member's own decisions, and
      // an amount-only order buried them: tick three small spends, reopen, and
      // the dialog showed none of them because they sat on page four (user,
      // 260813).
      const [curExcluded, curAmount, curId] = cursor
        ? cursor.split("|")
        : [null, null, null];
      return tx(budgetId, SYSTEM_USER_ID, async (t) => {
        const res = await t.execute(sql`
          SELECT l.id::text AS ledger_id,
                 l.category_id::text AS category_id,
                 to_char(l.transaction_date, 'YYYY-MM-DD') AS transaction_date,
                 l.note,
                 l.amount_converted_cents::text AS amount_cents,
                 r.cadence AS scheduled_cadence,
                 (x.ledger_id IS NOT NULL) AS excluded
            FROM budgeting.expense_ledger l
            LEFT JOIN budgeting.scheduled_payments r ON r.id = l.scheduled_payment_id
            LEFT JOIN budgeting.reserve_fit_exclusions x
                   ON x.ledger_id = l.id AND x.tenant_id = ${budgetId}::uuid
           WHERE l.tenant_id = ${budgetId}::uuid
             AND l.budget_id = ${budgetId}::uuid
             AND l.kind = 'SPENDING'
             AND l.category_id IS NOT NULL
             AND l.confirmed_at IS NOT NULL
             AND l.deleted_at IS NULL
             AND l.transaction_date >= ${from}::date
             AND l.transaction_date <= ${to}::date
             -- A charge linked to a REPEATING rule will happen again, so it is
             -- no candidate for "won't happen again" (user, 260813).
             AND (r.id IS NULL OR r.cadence = 'ONCE')
             ${categoryId ? sql`AND l.category_id = ${categoryId}::uuid` : sql``}
             ${
               curAmount && curId
                 ? sql`AND (((x.ledger_id IS NOT NULL) < ${curExcluded === "1"}::boolean)
                        OR ((x.ledger_id IS NOT NULL) = ${curExcluded === "1"}::boolean
                            AND (l.amount_converted_cents < ${curAmount}::bigint
                                 OR (l.amount_converted_cents = ${curAmount}::bigint
                                     AND l.id > ${curId}::uuid))))`
                 : sql``
             }
           ORDER BY (x.ledger_id IS NOT NULL) DESC,
                    l.amount_converted_cents DESC, l.id ASC
           LIMIT ${limit + 1}`);

        // The badge counts what is set aside in the RANGE, not on the page —
        // same filters as the list, so the number and the rows agree.
        const totalRes = await t.execute(sql`
          SELECT COUNT(*)::text AS n
            FROM budgeting.expense_ledger l
            LEFT JOIN budgeting.scheduled_payments r ON r.id = l.scheduled_payment_id
            JOIN budgeting.reserve_fit_exclusions x
                 ON x.ledger_id = l.id AND x.tenant_id = ${budgetId}::uuid
           WHERE l.tenant_id = ${budgetId}::uuid
             AND l.budget_id = ${budgetId}::uuid
             AND l.kind = 'SPENDING'
             AND l.category_id IS NOT NULL
             AND l.confirmed_at IS NOT NULL
             AND l.deleted_at IS NULL
             AND l.transaction_date >= ${from}::date
             AND l.transaction_date <= ${to}::date
             AND (r.id IS NULL OR r.cadence = 'ONCE')
             ${categoryId ? sql`AND l.category_id = ${categoryId}::uuid` : sql``}`);

        const rows = res.rows as Record<string, unknown>[];
        // One extra row is fetched purely to answer "is there more?" — it is
        // never returned, so the page size the caller asked for is the page
        // size they get.
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        return {
          items: page.map((r) => ({
            ledger_id: r.ledger_id as string,
            category_id: r.category_id as string,
            transaction_date: r.transaction_date as string,
            note: (r.note as string | null) ?? null,
            amount_cents: BigInt(r.amount_cents as string),
            scheduled_cadence: (r.scheduled_cadence as string | null) ?? null,
            excluded: Boolean(r.excluded),
          })),
          next_cursor:
            hasMore && last
              ? `${last.excluded ? "1" : "0"}|${last.amount_cents as string}|${last.ledger_id as string}`
              : null,
          excluded_total: Number(
            (totalRes.rows[0]?.n as string | undefined) ?? "0",
          ),
        };
      });
    },

    async largeTransactions({ budgetId, from, to }) {
      return tx(budgetId, SYSTEM_USER_ID, async (t) => {
        const res = await t.execute(sql`
          WITH ranked AS (
            SELECT l.id,
                   l.category_id,
                   l.transaction_date,
                   l.note,
                   l.amount_converted_cents,
                   r.cadence AS scheduled_cadence,
                   ROW_NUMBER() OVER (
                     PARTITION BY l.category_id
                     ORDER BY l.amount_converted_cents DESC
                   ) AS rn
              FROM budgeting.expense_ledger l
              LEFT JOIN budgeting.scheduled_payments r ON r.id = l.scheduled_payment_id
             WHERE l.tenant_id = ${budgetId}::uuid
               AND l.budget_id = ${budgetId}::uuid
               AND l.kind = 'SPENDING'
               AND l.category_id IS NOT NULL
               AND l.confirmed_at IS NOT NULL
               AND l.deleted_at IS NULL
               AND l.transaction_date >= ${from}::date
               AND l.transaction_date <= ${to}::date
               -- A charge linked to a REPEATING rule will happen again, so it
               -- is no candidate for "won't happen again" — and leaving it in
               -- spent shortlist slots on the same premium month after month,
               -- hiding the genuine one-offs beneath it (user, 260813).
               -- A ONCE rule is a single purchase and stays.
               AND (r.id IS NULL OR r.cadence = 'ONCE')
          )
          SELECT ranked.id::text AS ledger_id,
                 ranked.category_id::text AS category_id,
                 to_char(ranked.transaction_date, 'YYYY-MM-DD') AS transaction_date,
                 ranked.note,
                 ranked.amount_converted_cents::text AS amount_cents,
                 ranked.scheduled_cadence,
                 (x.ledger_id IS NOT NULL) AS excluded
            FROM ranked
            LEFT JOIN budgeting.reserve_fit_exclusions x
                   ON x.ledger_id = ranked.id
                  AND x.tenant_id = ${budgetId}::uuid
           WHERE ranked.rn <= ${SHORTLIST_PER_CATEGORY}
           ORDER BY ranked.amount_converted_cents DESC
        `);
        return res.rows.map((r): LargeTransactionRow => ({
          ledger_id: r.ledger_id as string,
          category_id: r.category_id as string,
          transaction_date: r.transaction_date as string,
          note: (r.note as string | null) ?? null,
          amount_cents: BigInt(r.amount_cents as string),
          scheduled_cadence: (r.scheduled_cadence as string | null) ?? null,
          excluded: Boolean(r.excluded),
        }));
      });
    },

    async excludedSpendByCategory({ budgetId, from, to }) {
      return tx(budgetId, SYSTEM_USER_ID, async (t) => {
        const res = await t.execute(sql`
          SELECT l.category_id::text AS category_id,
                 to_char(l.transaction_date, 'YYYY-MM') AS month,
                 COALESCE(SUM(l.amount_converted_cents), 0)::text AS cents
            FROM budgeting.reserve_fit_exclusions x
            JOIN budgeting.expense_ledger l ON l.id = x.ledger_id
           WHERE x.tenant_id = ${budgetId}::uuid
             AND l.tenant_id = ${budgetId}::uuid
             AND l.kind = 'SPENDING'
             AND l.category_id IS NOT NULL
             AND l.confirmed_at IS NOT NULL
             AND l.deleted_at IS NULL
             AND l.transaction_date >= ${from}::date
             AND l.transaction_date <= ${to}::date
           GROUP BY l.category_id, to_char(l.transaction_date, 'YYYY-MM')
           ORDER BY 1, 2
        `);
        return res.rows.map((r) => ({
          category_id: r.category_id as string,
          month: r.month as string,
          cents: BigInt(r.cents as string),
        }));
      });
    },

    async setExclusions({ budgetId, add, remove, actorUserId }) {
      if (add.length === 0 && remove.length === 0) return;
      return tx(budgetId, actorUserId, async (t) => {
        if (add.length > 0) {
          // The SELECT is the tenant check: a ledger row this budget cannot see
          // produces no row to insert, so one budget can never annotate
          // another's spend. ON CONFLICT keeps a re-save idempotent.
          await t.execute(sql`
            INSERT INTO budgeting.reserve_fit_exclusions
              (tenant_id, ledger_id, actor_user_id)
            SELECT ${budgetId}::uuid, l.id, ${actorUserId}::uuid
              FROM budgeting.expense_ledger l
             WHERE l.tenant_id = ${budgetId}::uuid
               AND l.id IN (${sql.join(
                 add.map((id) => sql`${id}::uuid`),
                 sql`, `,
               )})
            ON CONFLICT (tenant_id, ledger_id) DO NOTHING
          `);
        }
        if (remove.length > 0) {
          await t.execute(sql`
            DELETE FROM budgeting.reserve_fit_exclusions
             WHERE tenant_id = ${budgetId}::uuid
               AND ledger_id IN (${sql.join(
                 remove.map((id) => sql`${id}::uuid`),
                 sql`, `,
               )})
          `);
        }
      });
    },
  };
}
