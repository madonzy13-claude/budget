/**
 * reconcile-projections.ts — ENGR-14 hourly reconciliation use case (Plan 02-09).
 *
 * Compares budgeting.spending_by_category_month against a fresh aggregate from
 * the latest-only expense_ledger view. Auto-repairs small drift (|delta| < 1.00),
 * alerts on large drift via outbox event budgeting.projection.drift.detected.
 *
 * Single withTenantTx; advisory lock per (tenant, "budgeting:reconciliation")
 * keeps two reconciliations against the same tenant from racing.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { withTenantTx, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

export interface ReconcileProjectionsInput {
  tenantId: string;
  monthStart: string; // 'YYYY-MM-DD' inclusive
  monthEnd: string; // 'YYYY-MM-DD' inclusive
  /** User to record as the actor on auto-repairs. Defaults to system user (D-05-g). */
  actorUserId?: string;
}

export interface ReconcileProjectionsOutput {
  checked: number;
  repaired: number;
  alerted: number;
}

/** Auto-repair under this absolute delta (default currency units); alert otherwise. */
const AUTO_REPAIR_THRESHOLD = 1.0;
/** Ignore deltas smaller than this (rounding noise). */
const ROUNDING_NOISE_THRESHOLD = 0.005;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export function reconcileProjections() {
  return async (
    input: ReconcileProjectionsInput,
  ): Promise<Result<ReconcileProjectionsOutput, Error>> => {
    const actorUser = input.actorUserId ?? SYSTEM_USER_ID;
    const tid = TenantId(input.tenantId);
    const uid = UserId(actorUser);

    let checked = 0;
    let repaired = 0;
    let alerted = 0;

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as {
        execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
      };

      // Tenant-scoped advisory lock — two recons for same tenant won't race.
      // ledger UPDATE is REVOKE'd so SELECT FOR UPDATE is unavailable; advisory
      // locks are the canonical workaround (lesson from plan 02-07).
      await drizzleTx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('budgeting:reconciliation:' || ${input.tenantId}))`,
      );

      // Compute fresh aggregate from latest-only ledger (kind=EXPENSE only) over the
      // month range; LEFT JOIN against projection so we surface both:
      //   - rows present in fresh but missing in projection (drift > 0)
      //   - rows present in projection but with wrong amount
      // Categories that exist in projection but no longer have ledger contribution
      // ARE NOT covered here (they require a separate sweep — out of scope for v1
      // and accepted in T-2-09-08).
      const driftRows = await drizzleTx.execute(
        sql`
          WITH latest AS (
            SELECT * FROM budgeting.expense_ledger
             WHERE tenant_id = ${input.tenantId}::uuid
               AND kind = 'EXPENSE'
               AND id NOT IN (
                     SELECT corrects_id FROM budgeting.expense_ledger
                      WHERE tenant_id = ${input.tenantId}::uuid AND corrects_id IS NOT NULL
                   )
               AND transaction_date BETWEEN ${input.monthStart}::date AND ${input.monthEnd}::date
          ),
          fresh AS (
            SELECT category_id,
                   date_trunc('month', transaction_date)::date AS month_start_date,
                   SUM(amount_default)::numeric AS normal_amount,
                   currency_default AS currency
              FROM latest
             WHERE category_id IS NOT NULL
             GROUP BY category_id, date_trunc('month', transaction_date)::date, currency_default
          )
          SELECT f.category_id,
                 f.month_start_date::text AS month_start_date,
                 f.normal_amount::text AS fresh_normal,
                 COALESCE(p.normal_amount, '0')::text AS proj_normal,
                 f.currency
            FROM fresh f
            LEFT JOIN budgeting.spending_by_category_month p
              ON p.tenant_id = ${input.tenantId}::uuid
             AND p.category_id = f.category_id
             AND p.month_start_date = f.month_start_date
           WHERE ABS(COALESCE(p.normal_amount, '0')::numeric - f.normal_amount::numeric) > ${ROUNDING_NOISE_THRESHOLD}
        `,
      );

      checked = driftRows.rows.length;

      for (const row of driftRows.rows) {
        const categoryId = row.category_id as string;
        const monthStartDate = row.month_start_date as string;
        const fresh = parseFloat(row.fresh_normal as string);
        const projection = parseFloat(row.proj_normal as string);
        const delta = Math.abs(fresh - projection);
        const currency = row.currency as string;

        if (delta < AUTO_REPAIR_THRESHOLD) {
          // Auto-repair: UPSERT projection with fresh value (set, not delta-add)
          await drizzleTx.execute(
            sql`INSERT INTO budgeting.spending_by_category_month
                  (tenant_id, workspace_id, category_id, month_start_date,
                   normal_amount, cushion_amount, currency, updated_at)
                VALUES
                  (${input.tenantId}::uuid, ${input.tenantId}::uuid, ${categoryId}::uuid,
                   ${monthStartDate}::date,
                   ${row.fresh_normal as string}::numeric, '0'::numeric,
                   ${currency}, now())
                ON CONFLICT (tenant_id, category_id, month_start_date) DO UPDATE
                  SET normal_amount = EXCLUDED.normal_amount,
                      updated_at = now()`,
          );
          repaired++;
          console.log(
            `[reconcile] auto-repaired projection tenant=${input.tenantId} cat=${categoryId} month=${monthStartDate} delta=${delta.toFixed(4)}`,
          );
        } else {
          // Alert: emit outbox event, leave projection alone
          await writeOutbox(tx, {
            tenantId: TenantId(input.tenantId),
            aggregateType: "projection",
            aggregateId: `${categoryId}:${monthStartDate}`,
            eventType: "budgeting.projection.drift.detected",
            payload: {
              tenantId: input.tenantId,
              categoryId,
              monthStartDate,
              fresh: fresh.toFixed(4),
              projection: projection.toFixed(4),
              delta: delta.toFixed(4),
              currency,
            },
          });
          alerted++;
          console.warn(
            `[reconcile] DRIFT tenant=${input.tenantId} cat=${categoryId} month=${monthStartDate} fresh=${fresh.toFixed(4)} proj=${projection.toFixed(4)} delta=${delta.toFixed(4)} — alert emitted`,
          );
        }
      }
    });

    if (r.isErr()) return err(r.error);
    return ok({ checked, repaired, alerted });
  };
}
