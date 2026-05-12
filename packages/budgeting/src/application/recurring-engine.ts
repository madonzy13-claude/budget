/**
 * recurring-engine.ts — pg-boss handler for the recurring draft generation cron.
 *
 * Schedule: 0 6 * * * UTC (D-01-e)
 *
 * Algorithm (D-PH2-04 catch-up loop):
 *   1. SELECT DISTINCT tenant_id from active rules due today or earlier (withInfraTx)
 *   2. Per tenant withTenantTx:
 *      - SELECT active rules WHERE next_due_date <= today FOR UPDATE
 *      - For each rule:
 *          while dueDate <= today:
 *            INSERT into budgeting.expense_ledger (confirmed_at NULL, kind='SPENDING',
 *              recurring_rule_id=rule.id) ON CONFLICT (recurring_rule_id, transaction_date) DO NOTHING
 *            if new row: writeOutbox
 *            dueDate = nextOccurrence(dueDate)
 *          UPDATE recurring_rules.next_due_date = dueDate (first date > today)
 *
 * T-02-03 idempotency: UNIQUE index (recurring_rule_id, transaction_date) WHERE NOT deleted_at.
 * INSERT FIRST, UPDATE next_due_date AFTER (Pitfall 3).
 * budget_id = tenant_id in this schema (single workspace per tenant).
 *
 * Returns { tenantsScanned, draftsGenerated } for observability.
 * System user sentinel: 00000000-0000-0000-0000-000000000001 (D-05-g).
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx, writeOutbox } from "@budget/platform";
import {
  TenantId,
  UserId,
  InMemoryFxProvider,
  ok,
  type Result,
} from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import {
  nextOccurrence,
  type Cadence,
} from "@budget/budgeting/src/domain/cadence";
import {
  computeRecurringFx,
  type FxProviderLike,
} from "@budget/budgeting/src/application/recurring-engine-fx";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// PgBoss type hint
interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

interface RuleRow {
  id: string;
  tenant_id: string;
  next_due_date: string | Date;
  cadence: string;
  cadence_anchor: number | null;
  weekly_dow: number | null;
  yearly_month: number | null;
  category_id: string | null;
  amount: string;
  currency: string;
  note: string | null;
  budget_currency?: string; // joined from tenancy.budgets
}

function toDateString(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export interface RunRecurringEngineOpts {
  todayOverride?: string;
  fxProvider?: FxProviderLike;
}

/** Core engine logic — exported for direct testing. */
export async function runRecurringEngine(
  opts: RunRecurringEngineOpts | string = {},
): Promise<Result<{ tenantsScanned: number; draftsGenerated: number }, Error>> {
  // Backwards-compat: legacy callers pass `todayOverride` positionally as a string.
  const normalized: RunRecurringEngineOpts =
    typeof opts === "string" ? { todayOverride: opts } : opts;
  const today =
    normalized.todayOverride ?? Temporal.Now.plainDateISO().toString();
  const todayDate = Temporal.PlainDate.from(today);
  const fxProvider: FxProviderLike =
    normalized.fxProvider ?? new InMemoryFxProvider();

  // Step 1: collect distinct tenants with due rules (worker_role, no RLS needed for scan)
  const tenantsResult = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const r = await drizzleTx.execute(sql`
      SELECT DISTINCT tenant_id FROM budgeting.recurring_rules
       WHERE active = true AND next_due_date <= ${today}::date
    `);
    return r.rows as Array<{ tenant_id: string }>;
  });

  if (tenantsResult.isErr())
    return tenantsResult as unknown as Result<
      { tenantsScanned: number; draftsGenerated: number },
      Error
    >;
  const tenants = tenantsResult.value;

  let totalDrafts = 0;

  for (const { tenant_id } of tenants) {
    const r = await withTenantTx(
      TenantId(tenant_id),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };

        // Step 2: get all due rules for this tenant, join budget currency
        const rulesResult = await drizzleTx.execute(sql`
        SELECT r.id, r.tenant_id, r.next_due_date, r.cadence, r.cadence_anchor, r.weekly_dow,
               r.yearly_month, r.category_id, r.amount, r.currency, r.note,
               b.default_currency AS budget_currency
          FROM budgeting.recurring_rules r
          JOIN tenancy.budgets b ON b.id = r.tenant_id
         WHERE r.tenant_id = ${tenant_id}::uuid
           AND r.active = true
           AND r.next_due_date <= ${today}::date
         FOR UPDATE OF r
      `);

        let draftsGenerated = 0;

        for (const ruleRaw of rulesResult.rows) {
          const rule = ruleRaw as unknown as RuleRow;
          let dueDate = Temporal.PlainDate.from(
            toDateString(rule.next_due_date),
          );
          const budgetCurrency = rule.budget_currency ?? rule.currency;
          const amountOriginalCents = String(
            Math.round(Number(rule.amount) * 100),
          );
          const categoryId = rule.category_id ?? null;
          const note = rule.note ?? null;

          // Step 3: catch-up loop — INSERT a draft for each missed due date
          while (Temporal.PlainDate.compare(dueDate, todayDate) <= 0) {
            const dueDateStr = dueDate.toString();

            // T-02-WORKER-FX: same-currency path skips FX call; cross-currency uses
            // FxProvider and enforces `0 < rate < 1e6` before persisting any draft.
            const fxComputed = await computeRecurringFx({
              ruleCurrency: rule.currency,
              budgetCurrency,
              amountOriginalCents,
              dueDateStr,
              fxProvider,
            });
            const fxRate = fxComputed.fxRate;
            const fxAsOf = fxComputed.fxAsOf;
            const amountConvertedCents = fxComputed.amountConvertedCents;

            // INSERT into expense_ledger (confirmed_at NULL = draft, per D-PH2-08)
            const insertResult = await drizzleTx.execute(sql`
            INSERT INTO budgeting.expense_ledger
              (id, tenant_id, budget_id, category_id, transaction_date,
               amount_original_cents, currency_original,
               amount_converted_cents, fx_rate, fx_as_of,
               note, recurring_rule_id, confirmed_at, kind, created_at, updated_at)
            VALUES
              (gen_random_uuid(), ${tenant_id}::uuid, ${tenant_id}::uuid,
               ${categoryId}::uuid, ${dueDateStr}::date,
               ${amountOriginalCents}::bigint, ${rule.currency},
               ${amountConvertedCents}::bigint, ${fxRate}::numeric, ${fxAsOf}::date,
               ${note}, ${rule.id}::uuid,
               NULL,
               'SPENDING',
               now(), now())
            ON CONFLICT (recurring_rule_id, transaction_date) WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL DO NOTHING
            RETURNING id
          `);

            // Step 4: writeOutbox only if draft was actually inserted (not a conflict skip)
            if (insertResult.rows.length > 0) {
              const draftId = (insertResult.rows[0] as Record<string, unknown>)
                .id as string;
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

            // Step 5: advance dueDate via nextOccurrence
            dueDate = nextOccurrence(
              {
                cadence: rule.cadence as Cadence,
                anchorDay: rule.cadence_anchor ?? undefined,
                weeklyDow: rule.weekly_dow ?? undefined,
                yearlyMonth: rule.yearly_month ?? undefined,
              },
              dueDate,
            );
          }

          // Step 6: UPDATE next_due_date to first date > today (INSERT FIRST per Pitfall 3)
          await drizzleTx.execute(sql`
          UPDATE budgeting.recurring_rules
             SET next_due_date = ${dueDate.toString()}::date,
                 updated_at = now()
           WHERE id = ${rule.id}::uuid
        `);
        }

        return draftsGenerated;
      },
    );

    if (r.isOk()) totalDrafts += r.value;
    else {
      const anyE = r.error as unknown as Record<string, unknown>;
      const cause = anyE?.cause as Record<string, unknown> | undefined;
      if (cause?.code)
        console.error(
          `[engine] tenant ${tenant_id} pg_err code=${cause.code} msg=${cause.message}`,
        );
    }
  }

  return ok({ tenantsScanned: tenants.length, draftsGenerated: totalDrafts });
}

/** Register pg-boss handler scheduled at 0 6 * * * UTC (5-placeholder format). */
export function registerRecurringEngine(
  boss: PgBossLike,
  fxProvider?: FxProviderLike,
): void {
  boss.work("recurring-engine", async () => {
    return runRecurringEngine(fxProvider ? { fxProvider } : {});
  });
}
