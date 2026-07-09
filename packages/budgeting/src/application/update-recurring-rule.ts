/**
 * update-recurring-rule.ts — Update a recurring rule use case.
 *
 * D-01-d compliance:
 * - applyToFuture has NO default in the function signature — caller MUST pass it explicitly.
 * - When applyToFuture=true: UPDATE future PENDING drafts in place in the SAME withTenantTx.
 * - When applyToFuture=false: leave drafts untouched.
 * - Zod schema declares applyToFuture: z.boolean() (no .default()) so missing field → 422.
 */
import { type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextDueDateAfter, type Cadence } from "../domain/cadence";
import type {
  RecurringRuleRepo,
  RecurringRuleEdits,
} from "../ports/recurring-rule-repo";
import type { RecurringDraftRepo } from "../ports/recurring-draft-repo";

export interface UpdateRecurringRuleInput {
  tenantId: string;
  ruleId: string;
  edits: RecurringRuleEdits;
  /** REQUIRED — no default. Caller must pass explicitly. */
  applyToFuture: boolean;
  actorUserId: string;
}

export class RuleNotFoundError extends Error {
  readonly kind = "RuleNotFound" as const;
  constructor(public readonly ruleId: string) {
    super(`Recurring rule ${ruleId} not found`);
    this.name = "RuleNotFoundError";
  }
}

export function updateRecurringRule(deps: {
  ruleRepo: RecurringRuleRepo;
  draftRepo: RecurringDraftRepo;
}) {
  return async (
    input: UpdateRecurringRuleInput,
  ): Promise<Result<{ affectedPendingDraftIds: string[] }, Error>> => {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const { sql } = await import("drizzle-orm");

        // SELECT FOR UPDATE on the rule row (serializes concurrent edits)
        const ruleResult = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_rules
         WHERE id = ${input.ruleId}::uuid AND tenant_id = ${input.tenantId}::uuid
         FOR UPDATE
      `);
        if (!ruleResult.rows[0]) {
          throw new RuleNotFoundError(input.ruleId);
        }
        const before = ruleResult.rows[0];

        // UPDATE the rule's mutable fields
        await deps.ruleRepo.update(
          tx,
          input.ruleId,
          input.tenantId,
          input.edits,
        );

        // Cadence/day change → recompute next_due_date from the MERGED spec
        // (edits over the existing row) so the next draft fires on the new
        // schedule. Mirrors the create/engine seed: first occurrence strictly
        // after today.
        const cadenceChanged =
          input.edits.cadence !== undefined ||
          input.edits.cadenceAnchor !== undefined ||
          input.edits.weeklyDow !== undefined ||
          input.edits.yearlyMonth !== undefined;
        if (cadenceChanged) {
          const merged = {
            cadence: (input.edits.cadence ?? before.cadence) as Cadence,
            anchorDay:
              (input.edits.cadenceAnchor ??
                (before.cadence_anchor as number | null)) ?? undefined,
            weeklyDow:
              (input.edits.weeklyDow ??
                (before.weekly_dow as number | null)) ?? undefined,
            yearlyMonth:
              (input.edits.yearlyMonth ??
                (before.yearly_month as number | null)) ?? undefined,
          };
          const nextDue = nextDueDateAfter(merged, Temporal.Now.plainDateISO());
          await deps.ruleRepo.advanceNextDueDate(
            tx,
            input.ruleId,
            nextDue.toString(),
          );
        }

        // Build draft edits (subset of rule edits applicable to expense_ledger drafts)
        const draftEdits: Parameters<
          RecurringDraftRepo["regenerateFuturePending"]
        >[2] = {};
        if (input.edits.amount !== undefined) {
          // Convert decimal amount to cents for expense_ledger
          draftEdits.amountOriginalCents = String(
            Math.round(Number(input.edits.amount) * 100),
          );
        }
        if (input.edits.currency !== undefined)
          draftEdits.currency = input.edits.currency;
        if (input.edits.categoryId !== undefined)
          draftEdits.categoryId = input.edits.categoryId;
        if (input.edits.note !== undefined) draftEdits.note = input.edits.note;

        let affectedPendingDraftIds: string[] = [];

        if (input.applyToFuture) {
          if (cadenceChanged) {
            // Schedule moved: the future PENDING drafts are stale-dated and
            // can't be updated in place (their transaction_date no longer
            // matches the cadence). Soft-delete them; the generation engine
            // recreates drafts from the recomputed next_due_date on the new
            // schedule (amount/category/note edits ride along because the
            // engine reads the just-updated rule).
            affectedPendingDraftIds = await deps.draftRepo.deleteFuturePending(
              tx,
              input.ruleId,
            );
          } else {
            // UPDATE future PENDING drafts in place (NOT delete-and-recreate — preserves draft.id)
            affectedPendingDraftIds =
              await deps.draftRepo.regenerateFuturePending(
                tx,
                input.ruleId,
                draftEdits,
              );
          }
        }
        // If applyToFuture === false: leave drafts untouched (D-01-d)

        await writeAudit(tx, {
          tenantId: TenantId(input.tenantId),
          actorUserId: UserId(input.actorUserId),
          entityType: "recurring_rule",
          entityId: input.ruleId,
          action: "update" as const,
          before,
          after: { ...input.edits, applyToFuture: input.applyToFuture },
        });

        await writeOutbox(tx, {
          tenantId: TenantId(input.tenantId),
          aggregateType: "recurring_rule",
          aggregateId: input.ruleId,
          eventType: "budgeting.recurring.rule.updated",
          payload: {
            ruleId: input.ruleId,
            tenantId: input.tenantId,
            appliedToFuture: input.applyToFuture,
            affectedPendingDraftIds,
          },
        });

        return { affectedPendingDraftIds };
      },
    );

    return r;
  };
}
