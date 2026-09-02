/**
 * update-scheduled-payment.ts — Update a scheduled rule use case.
 *
 * D-01-d compliance:
 * - applyToFuture has NO default in the function signature — caller MUST pass it explicitly.
 * - When applyToFuture=true: UPDATE future PENDING drafts in place in the SAME withTenantTx.
 * - When applyToFuture=false: leave drafts untouched.
 * - Zod schema declares applyToFuture: z.boolean() (no .default()) so missing field → 422.
 */
import { sql } from "drizzle-orm";
import { type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextDueDateAfter, type Cadence } from "../domain/cadence";
import type {
  ScheduledPaymentRepo,
  ScheduledPaymentEdits,
} from "../ports/scheduled-payment-repo";
import type { ScheduledDraftRepo } from "../ports/scheduled-draft-repo";
import {
  materialiseDueDrafts,
  type ConfirmDraftEmitter,
  type MaterialiseDueDraftsDeps,
} from "./materialise-due-drafts";

export interface UpdateScheduledPaymentInput {
  tenantId: string;
  ruleId: string;
  edits: ScheduledPaymentEdits;
  /** REQUIRED — no default. Caller must pass explicitly. */
  applyToFuture: boolean;
  actorUserId: string;
}

export class RuleNotFoundError extends Error {
  readonly kind = "RuleNotFound" as const;
  constructor(public readonly ruleId: string) {
    super(`Scheduled rule ${ruleId} not found`);
    this.name = "RuleNotFoundError";
  }
}

export function updateScheduledPayment(deps: {
  ruleRepo: ScheduledPaymentRepo;
  draftRepo: ScheduledDraftRepo;
  /** Present = an edit that brings a payment DUE materialises its draft on
   *  save. Absent = the nightly engine remains the only path, which is what it
   *  was until 260902. Optional so existing wiring keeps compiling. */
  fxProvider?: MaterialiseDueDraftsDeps["fxProvider"];
  taskRepo?: ConfirmDraftEmitter;
}) {
  return async (
    input: UpdateScheduledPaymentInput,
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
        SELECT * FROM budgeting.scheduled_payments
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
          input.edits.yearlyMonth !== undefined ||
          input.edits.nextDueDate !== undefined;
        const mergedCadence = (input.edits.cadence ??
          before.cadence) as Cadence;
        if (cadenceChanged && mergedCadence === "ONCE") {
          // A one-time payment has no pattern to recompute from, and its
          // DEADLINE is its date — so both move together or the payment ends up
          // either never firing or never retiring (260807). The household's
          // pick wins; falling back to the stored date keeps an amount-only
          // edit from silently rescheduling it.
          const when =
            input.edits.nextDueDate ?? (before.next_due_date as string);
          const date = String(when).slice(0, 10);
          await deps.ruleRepo.advanceNextDueDate(tx, input.ruleId, date);
          await deps.ruleRepo.update(tx, input.ruleId, input.tenantId, {
            endDate: date,
          });
        } else if (cadenceChanged) {
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
          ScheduledDraftRepo["regenerateFuturePending"]
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

        // Moving a payment TO a date that has arrived makes it due NOW. The
        // nightly engine would find it at 06:00 tomorrow, which is what made a
        // payment edited to today simply not appear (user, 260902). Creating a
        // rule has always caught up inline; editing one now does the same.
        //
        // Re-read rather than trusting the merged edits: the ONCE branch above
        // rewrites both the date and the end_date, and the cadence branch
        // recomputes the pointer, so the row is the only thing that knows where
        // the walk starts. Best-effort — a failure here must not lose the edit
        // the user just made, and the engine remains the backstop.
        if (deps.fxProvider && deps.taskRepo) {
          try {
            const fresh = await drizzleTx.execute(sql`
              SELECT r.next_due_date::text AS next_due_date,
                     r.end_date::text AS end_date,
                     r.cadence, r.cadence_anchor, r.weekly_dow, r.yearly_month,
                     r.category_id::text AS category_id, r.note,
                     r.amount::text AS amount, r.currency, r.active,
                     b.default_currency AS budget_currency
                FROM budgeting.scheduled_payments r
                JOIN tenancy.budgets b ON b.id = r.tenant_id
               WHERE r.id = ${input.ruleId}::uuid
            `);
            const row = fresh.rows[0] as Record<string, unknown> | undefined;
            if (row && row.active === true) {
              const { nextDueDate, draftsGenerated } =
                await materialiseDueDrafts(
                  tx,
                  {
                    tenantId: input.tenantId,
                    ruleId: input.ruleId,
                    fromDate: String(row.next_due_date),
                    endDate: (row.end_date as string | null) ?? null,
                    cadence: String(row.cadence),
                    cadenceAnchor: row.cadence_anchor as number | null,
                    weeklyDow: row.weekly_dow as number | null,
                    yearlyMonth: row.yearly_month as number | null,
                    categoryId: (row.category_id as string | null) ?? null,
                    note: (row.note as string | null) ?? null,
                    amount: String(row.amount),
                    currency: String(row.currency),
                    budgetCurrency: String(row.budget_currency),
                  },
                  { fxProvider: deps.fxProvider, taskRepo: deps.taskRepo },
                );
              // Advance the pointer past what was just drafted, so neither this
              // path nor the engine walks the same dates again.
              if (draftsGenerated > 0) {
                await deps.ruleRepo.advanceNextDueDate(
                  tx,
                  input.ruleId,
                  nextDueDate,
                );
              }
            }
          } catch (e) {
            console.error(
              `[scheduled-payment] catch-up after edit failed for rule ${input.ruleId}:`,
              e,
            );
          }
        }

        await writeAudit(tx, {
          tenantId: TenantId(input.tenantId),
          actorUserId: UserId(input.actorUserId),
          entityType: "scheduled_rule",
          entityId: input.ruleId,
          action: "update" as const,
          before,
          after: { ...input.edits, applyToFuture: input.applyToFuture },
        });

        await writeOutbox(tx, {
          tenantId: TenantId(input.tenantId),
          aggregateType: "scheduled_rule",
          aggregateId: input.ruleId,
          eventType: "budgeting.scheduled.rule.updated",
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
