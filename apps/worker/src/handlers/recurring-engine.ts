/**
 * recurring-engine.ts — pg-boss handler for the recurring draft generation cron.
 *
 * Schedule: 0 6 * * * UTC (D-01-e, plan 02-08)
 * Algorithm:
 *   1. SELECT DISTINCT tenant_id from active rules due today (withInfraTx — no RLS needed for scan)
 *   2. For each tenant: withTenantTx(tenantId, SYSTEM_USER_ID)
 *      - SELECT rules WHERE active AND next_due_date <= today FOR UPDATE
 *      - INSERT draft ON CONFLICT (rule_id, due_date) DO NOTHING (idempotency)
 *      - UPDATE rule.next_due_date = computeNext(...)
 *      - writeOutbox 'budgeting.recurring.draft.generated'
 *
 * Returns { tenantsScanned, draftsGenerated } for observability.
 * System user sentinel: 00000000-0000-0000-0000-000000000001 (D-05-g).
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx, writeOutbox } from "@budget/platform";
import { TenantId, UserId, ok, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type Cadence } from "@budget/budgeting/src/domain/cadence";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// PgBoss type hint
interface PgBossLike {
  work(queue: string, handler: (job: unknown) => Promise<unknown>): Promise<void>;
}

interface RuleRow {
  id: string;
  tenant_id: string;
  next_due_date: string | Date;
  cadence: string;
  cadence_anchor: number | null;
  weekly_dow: number | null;
  account_id: string;
  category_id: string | null;
  amount: string;
  currency: string;
  kind: string;
  note: string | null;
}

function toDateString(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/** Core engine logic — exported for direct testing. */
export async function runRecurringEngine(
  todayOverride?: string,
): Promise<Result<{ tenantsScanned: number; draftsGenerated: number }, Error>> {
  const today = todayOverride ?? Temporal.Now.plainDateISO().toString();

  // Step 1: collect distinct tenants with due rules (worker_role, no RLS)
  const tenantsResult = await withInfraTx(async (tx) => {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
    const r = await drizzleTx.execute(sql`
      SELECT DISTINCT tenant_id FROM budgeting.recurring_rules
       WHERE active = true AND next_due_date <= ${today}::date
    `);
    return r.rows as Array<{ tenant_id: string }>;
  });

  if (tenantsResult.isErr()) return tenantsResult as unknown as Result<{ tenantsScanned: number; draftsGenerated: number }, Error>; // propagate err
  const tenants = tenantsResult.value;

  let totalDrafts = 0;

  for (const { tenant_id } of tenants) {
    const r = await withTenantTx(TenantId(tenant_id), UserId(SYSTEM_USER_ID), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

      // Step 2: get all due rules for this tenant
      const rulesResult = await drizzleTx.execute(sql`
        SELECT id, tenant_id, next_due_date, cadence, cadence_anchor, weekly_dow,
               account_id, category_id, amount, currency, kind, note
          FROM budgeting.recurring_rules
         WHERE tenant_id = ${tenant_id}::uuid
           AND active = true
           AND next_due_date <= ${today}::date
         FOR UPDATE
      `);

      let draftsGenerated = 0;

      for (const ruleRaw of rulesResult.rows) {
        const rule = ruleRaw as unknown as RuleRow;
        const dueDateStr = toDateString(rule.next_due_date);

        // Step 3: INSERT draft ON CONFLICT DO NOTHING (idempotency via UNIQUE (rule_id, due_date))
        const categoryId = rule.category_id ?? null;
        const note = rule.note ?? null;
        const insertResult = await drizzleTx.execute(sql`
          INSERT INTO budgeting.recurring_drafts
            (tenant_id, rule_id, due_date, amount, currency, account_id, category_id, kind, note, status, actor_user_id)
          VALUES
            (${tenant_id}::uuid, ${rule.id}::uuid, ${dueDateStr}::date, ${rule.amount}, ${rule.currency},
             ${rule.account_id}::uuid, ${categoryId}::uuid, ${rule.kind}, ${note}, 'PENDING', ${SYSTEM_USER_ID}::uuid)
          ON CONFLICT (rule_id, due_date) DO NOTHING
          RETURNING id
        `);

        // Step 4: advance next_due_date
        const prevDate = Temporal.PlainDate.from(dueDateStr);
        const nextDate = nextOccurrence(
          {
            cadence: rule.cadence as Cadence,
            anchorDay: rule.cadence_anchor ?? undefined,
            weeklyDow: rule.weekly_dow ?? undefined,
          },
          prevDate,
        );

        await drizzleTx.execute(sql`
          UPDATE budgeting.recurring_rules
             SET next_due_date = ${nextDate.toString()}::date,
                 updated_at = now()
           WHERE id = ${rule.id}::uuid
        `);

        // Step 5: writeOutbox (only if draft was actually inserted — not a conflict)
        if (insertResult.rows.length > 0) {
          const draftId = (insertResult.rows[0] as Record<string, unknown>).id as string;
          await writeOutbox(tx, {
            tenantId: TenantId(tenant_id),
            aggregateType: "recurring_rule",
            aggregateId: rule.id,
            eventType: "budgeting.recurring.draft.generated",
            payload: {
              draftId,
              ruleId: rule.id,
              tenantId: tenant_id,
              dueDate: dueDateStr,
            },
          });
          draftsGenerated++;
        }
      }

      return draftsGenerated;
    });

    if (r.isOk()) totalDrafts += r.value;
  }

  return ok({ tenantsScanned: tenants.length, draftsGenerated: totalDrafts });
}

/** Register pg-boss handler scheduled at 0 6 * * * UTC (5-placeholder format). */
export function registerRecurringEngine(boss: PgBossLike): void {
  boss.work("recurring-engine", async () => {
    return runRecurringEngine();
  });
}
