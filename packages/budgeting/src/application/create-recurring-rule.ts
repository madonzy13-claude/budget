/**
 * create-recurring-rule.ts — Create a recurring rule use case.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   - accountId / walletId dropped: categorical-only per TXN-02 / D-PH2-09
 *   - kind dropped: all rules produce SPENDING drafts per D-PH2-09
 *   - yearlyMonth added for YEARLY cadence
 *   - Cadence extended to DAILY|WEEKLY|MONTHLY|YEARLY
 */
import { err, type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import type { RecurringRuleRepo } from "../ports/recurring-rule-repo";

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

export class FirstDueDateInPastError extends Error {
  readonly kind = "FirstDueDateInPast" as const;
  constructor() {
    super("first_due_date must be today or in the future");
    this.name = "FirstDueDateInPastError";
  }
}

export function createRecurringRule(_deps: { ruleRepo: RecurringRuleRepo }) {
  return async (
    input: CreateRecurringRuleInput,
  ): Promise<Result<CreateRecurringRuleResult, Error>> => {
    // Validate first_due_date >= today
    const today = Temporal.Now.plainDateISO();
    const firstDue = Temporal.PlainDate.from(input.firstDueDate);
    if (Temporal.PlainDate.compare(firstDue, today) < 0) {
      return err(new FirstDueDateInPastError());
    }

    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const { sql } = await import("drizzle-orm");
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

        return { ruleId };
      },
    );

    return r;
  };
}
