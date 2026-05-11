/**
 * confirm-recurring-draft.ts — Confirm a PENDING draft, inserting a ledger row.
 *
 * Cross-plan contract (plan 02-06): calls transactionRepo.createInTx so the ledger INSERT
 * and draft UPDATE share ONE withTenantTx (Pitfall 7 / D-05-e / EXPN-11).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringDraftRepo } from "../ports/recurring-draft-repo";
import type { TransactionRepo } from "../ports/transaction-repo";

export interface ConfirmRecurringDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export class AlreadyConfirmedError extends Error {
  readonly kind = "AlreadyConfirmed" as const;
  constructor(public readonly draftId: string) {
    super(`Draft ${draftId} is already confirmed or skipped`);
    this.name = "AlreadyConfirmedError";
  }
}

export class DraftNotFoundError extends Error {
  readonly kind = "DraftNotFound" as const;
  constructor(public readonly draftId: string) {
    super(`Draft ${draftId} not found`);
    this.name = "DraftNotFoundError";
  }
}

export function confirmRecurringDraft(deps: {
  draftRepo: RecurringDraftRepo;
  transactionRepo: TransactionRepo;
}) {
  return async (input: ConfirmRecurringDraftInput): Promise<Result<{ ledgerId: string }, Error>> => {
    const r = await withTenantTx(TenantId(input.tenantId), UserId(input.actorUserId), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      const { sql } = await import("drizzle-orm");

      // SELECT FOR UPDATE to prevent concurrent confirms
      const draftResult = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_drafts
         WHERE id = ${input.draftId}::uuid AND tenant_id = ${input.tenantId}::uuid
         FOR UPDATE
      `);

      if (!draftResult.rows[0]) {
        throw new DraftNotFoundError(input.draftId);
      }

      const draft = draftResult.rows[0] as Record<string, unknown>;

      if (draft.status !== "PENDING") {
        throw new AlreadyConfirmedError(input.draftId);
      }

      // Generate ledger row id
      const idResult = await drizzleTx.execute(sql`SELECT gen_random_uuid() AS id`);
      const ledgerId = (idResult.rows[0] as Record<string, unknown>).id as string;

      // Call transactionRepo.createInTx (defined in plan 02-06) — same tx
      // Fetch workspace default currency
      const wsResult = await drizzleTx.execute(sql`
        SELECT default_currency FROM tenancy.budgets WHERE id = ${input.tenantId}::uuid LIMIT 1
      `);
      const defaultCurrency = ((wsResult.rows[0] as Record<string, unknown> | undefined)?.default_currency as string) ?? "USD";
      const amountStr = String(draft.amount);
      const currency = draft.currency as string;

      await deps.transactionRepo.createInTx(
        tx,
        [
          {
            id: ledgerId,
            tenantId: input.tenantId,
            kind: draft.kind as "EXPENSE" | "INCOME" | "TRANSFER",
            amountOrig: amountStr,
            currencyOrig: currency,
            amountDefault: amountStr,
            currencyDefault: defaultCurrency,
            fxRate: "1",
            fxRateDate: draft.due_date as string,
            fxProvider: "recurring",
            transactionDate: draft.due_date as string,
            note: (draft.note as string | null) ?? null,
            accountId: draft.wallet_id as string,
            categoryId: (draft.category_id as string | null) ?? null,
            transferGroupId: null,
            correctsId: null,
            balanceDeltaSign: draft.kind === "INCOME" ? 1 : -1,
          },
        ],
        input.actorUserId,
        input.tenantId,
      );

      // Mark draft CONFIRMED in same tx
      await deps.draftRepo.markConfirmed(tx, input.draftId, input.actorUserId);

      await writeAudit(tx, {
        tenantId: TenantId(input.tenantId),
        actorUserId: UserId(input.actorUserId),
        entityType: "recurring_draft",
        entityId: input.draftId,
        action: "update" as const,
        before: { status: "PENDING" },
        after: { status: "CONFIRMED", ledgerId },
      });

      await writeOutbox(tx, {
        tenantId: TenantId(input.tenantId),
        aggregateType: "recurring_draft",
        aggregateId: input.draftId,
        eventType: "budgeting.recurring.confirmed",
        payload: { draftId: input.draftId, ledgerId, tenantId: input.tenantId },
      });

      return { ledgerId };
    });

    return r;
  };
}
