/**
 * create-recurring-rule.ts — Create a recurring rule use case.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   - accountId / walletId dropped: categorical-only per TXN-02 / D-PH2-09
 *   - kind dropped: all rules produce SPENDING drafts per D-PH2-09
 *   - yearlyMonth added for YEARLY cadence
 *   - Cadence extended to DAILY|WEEKLY|MONTHLY|YEARLY
 */
import { type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type Cadence } from "../domain/cadence";
import type { RecurringRuleRepo } from "../ports/recurring-rule-repo";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { computeRecurringFx, type FxProviderLike } from "./recurring-engine-fx";

export interface CreateRecurringRuleInput {
  tenantId: string;
  categoryId?: string | null;
  amount: string;
  currency: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor?: number | null;
  weeklyDow?: number | null;
  yearlyMonth?: number | null;
  note?: string | null;
  firstDueDate: string; // ISO YYYY-MM-DD
  actorUserId: string;
}

export interface CreateRecurringRuleResult {
  ruleId: string;
}

/**
 * Kept exported for backward source compatibility — the route still
 * pattern-matches on `kind: "FirstDueDateInPast"` for an older error
 * branch. UAT (Phase 6, Test 7 retest) showed users want to seed rules
 * from a past first occurrence so the historical drafts continue from
 * the right anchor. We no longer raise this error from the service.
 */
export class FirstDueDateInPastError extends Error {
  readonly kind = "FirstDueDateInPast" as const;
  constructor() {
    super("first_due_date must be today or in the future");
    this.name = "FirstDueDateInPastError";
  }
}

export function createRecurringRule(deps: {
  ruleRepo: RecurringRuleRepo;
  fxProvider: FxProviderLike;
  taskRepo: TaskRepo;
}) {
  return async (
    input: CreateRecurringRuleInput,
  ): Promise<Result<CreateRecurringRuleResult, Error>> => {
    // Past first_due_date is now allowed — the user often seeds a
    // rule from a past start (e.g. a salary that began last month) so
    // the recurring engine generates the correct stream of drafts
    // from that anchor onwards. The recurring engine's catch-up logic
    // handles back-fill safely (it skips already-confirmed periods).
    void Temporal.PlainDate.from(input.firstDueDate); // shape validation only

    // sql imported at module scope below — using a hoisted dynamic import
    // keeps Drizzle as a transitive dep only, no bundle penalty in unused
    // contexts (matches the existing pattern in this file).
    const { sql } = await import("drizzle-orm");

    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const result = await drizzleTx.execute(sql`
        INSERT INTO budgeting.recurring_rules
          (tenant_id, category_id, amount, currency, cadence,
           cadence_anchor, weekly_dow, yearly_month,
           note, active, next_due_date, actor_user_id)
        VALUES
          (${input.tenantId}::uuid, ${(input.categoryId ?? null) as string | null}::uuid,
           ${input.amount}::numeric, ${input.currency}, ${input.cadence},
           ${input.cadenceAnchor ?? null}, ${input.weeklyDow ?? null}, ${input.yearlyMonth ?? null},
           ${input.note ?? null}, true,
           ${input.firstDueDate}::date, ${input.actorUserId}::uuid)
        RETURNING id
      `);
        const ruleId = (result.rows[0] as Record<string, unknown>).id as string;

        await writeAudit(tx, {
          tenantId: TenantId(input.tenantId),
          actorUserId: UserId(input.actorUserId),
          entityType: "recurring_rule",
          entityId: ruleId,
          action: "create" as const,
          before: null,
          after: { amount: input.amount, cadence: input.cadence },
        });

        await writeOutbox(tx, {
          tenantId: TenantId(input.tenantId),
          aggregateType: "recurring_rule",
          aggregateId: ruleId,
          eventType: "budgeting.recurring.rule.created",
          payload: { ruleId, tenantId: input.tenantId, cadence: input.cadence },
        });

        // Catch-up loop for past first_due_date — drop a draft into the
        // ledger for every missed period up to today. The nightly engine
        // does this too but its 0 6 * * * UTC schedule means a user who
        // creates a back-dated rule at noon waits ~18h for the drafts to
        // appear. We inline the same INSERT...ON CONFLICT DO NOTHING +
        // writeOutbox loop so the rule is immediately usable.
        //
        // Cross-currency back-fills are handled here too — when the
        // rule's currency differs from the budget's, we call
        // `computeRecurringFx` to fetch the rate-as-of the due date.
        // Same-currency rules short-circuit with `fxRate = 1` and an
        // identity conversion.
        const today = Temporal.Now.plainDateISO();
        let dueDate = Temporal.PlainDate.from(input.firstDueDate);
        const amountCents = String(Math.round(Number(input.amount) * 100));
        const drizzleTx2 = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        // Fetch the budget's default currency once — the catch-up loop
        // reuses it across every missed period; we never refresh this
        // value mid-loop because budget currency is immutable post-
        // first-transaction (D-10).
        const budgetRow = await drizzleTx2.execute(sql`
          SELECT default_currency FROM tenancy.budgets
           WHERE id = ${input.tenantId}::uuid
        `);
        const budgetCurrency =
          (budgetRow.rows[0]?.default_currency as string | undefined) ??
          input.currency;
        while (Temporal.PlainDate.compare(dueDate, today) <= 0) {
          const dueStr = dueDate.toString();
          const fxComputed = await computeRecurringFx({
            ruleCurrency: input.currency,
            budgetCurrency,
            amountOriginalCents: amountCents,
            dueDateStr: dueStr,
            fxProvider: deps.fxProvider,
          });
          // UAT-Phase6-Test7 retest follow-up: lock the draft to the
          // BUDGET currency — `currency_original` becomes the budget
          // currency, `amount_original_cents` becomes the converted
          // value, `fx_rate` is identity. The rule's raw currency
          // (e.g. "PLN" in an EUR budget) is consumed only to compute
          // the conversion; the persisted ledger row reads as a
          // budget-currency row, matching the edit-transaction
          // lock semantics.
          const insertResult = await drizzleTx2.execute(sql`
            INSERT INTO budgeting.expense_ledger
              (id, tenant_id, budget_id, category_id, transaction_date,
               amount_original_cents, currency_original,
               amount_converted_cents, fx_rate, fx_as_of,
               note, recurring_rule_id, confirmed_at, kind, created_at, updated_at)
            VALUES
              (gen_random_uuid(), ${input.tenantId}::uuid, ${input.tenantId}::uuid,
               ${input.categoryId ?? null}::uuid, ${dueStr}::date,
               ${fxComputed.amountConvertedCents}::bigint, ${budgetCurrency},
               ${fxComputed.amountConvertedCents}::bigint,
               1::numeric, ${fxComputed.fxAsOf}::date,
               ${input.note ?? null}, ${ruleId}::uuid,
               NULL, 'SPENDING', now(), now())
            ON CONFLICT (recurring_rule_id, transaction_date)
              WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL
              DO NOTHING
            RETURNING id
          `);
          if (insertResult.rows.length > 0) {
            const draftId = (insertResult.rows[0] as Record<string, unknown>)
              .id as string;
            await writeOutbox(tx, {
              tenantId: TenantId(input.tenantId),
              aggregateType: "recurring_rule",
              aggregateId: ruleId,
              eventType: "budgeting.recurring.draft.generated",
              payload: {
                draftId,
                ruleId,
                tenantId: input.tenantId,
                dueDate: dueStr,
              },
            });
            // Emit CONFIRM_DRAFT task inline so the badge appears on the client's
            // next refetch without waiting for the 0 6 * * * cron to fire.
            // Idempotent: tasks_confirm_draft_dedup_idx (UNIQUE on draft_id) means
            // a duplicate call from the nightly engine is a silent no-op.
            await deps.taskRepo.emitConfirmDraft(
              input.tenantId,
              input.tenantId,
              {
                draft_id: draftId,
                rule_name: input.note ?? "",
                amount_cents: amountCents,
                currency: budgetCurrency,
                transaction_date: dueStr,
                category_id: input.categoryId ?? "",
              },
              tx as unknown as TenantTx,
            );
          }
          dueDate = nextOccurrence(
            {
              cadence: input.cadence as Cadence,
              anchorDay: input.cadenceAnchor ?? undefined,
              weeklyDow: input.weeklyDow ?? undefined,
              yearlyMonth: input.yearlyMonth ?? undefined,
            },
            dueDate,
          );
        }

        // Move next_due_date forward to the first date STRICTLY after
        // today so the nightly engine doesn't double-insert what we
        // just back-filled.
        if (Temporal.PlainDate.compare(dueDate, today) > 0) {
          await drizzleTx2.execute(sql`
            UPDATE budgeting.recurring_rules
               SET next_due_date = ${dueDate.toString()}::date
             WHERE id = ${ruleId}::uuid
          `);
        }

        return { ruleId };
      },
    );

    return r;
  };
}
