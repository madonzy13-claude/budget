/**
 * edit-and-confirm-recurring-draft.ts — Edit draft fields then confirm in one atomic tx.
 * Same single-tx pattern as confirm-recurring-draft.
 */
import { err, type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringDraftRepo, DraftEdits } from "../ports/recurring-draft-repo";
import type { TransactionRepo } from "../ports/transaction-repo";
import { AlreadyConfirmedError, DraftNotFoundError } from "./confirm-recurring-draft";

export interface EditAndConfirmInput {
  tenantId: string;
  draftId: string;
  edits: DraftEdits & { fxPreview?: { rate: string; fxRateDate: string } | null };
  actorUserId: string;
}

export function editAndConfirmRecurringDraft(deps: {
  draftRepo: RecurringDraftRepo;
  transactionRepo: TransactionRepo;
}) {
  return async (input: EditAndConfirmInput): Promise<Result<{ ledgerId: string }, Error>> => {
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

      // Apply edits to draft in-place
      const idResult = await drizzleTx.execute(sql`SELECT gen_random_uuid() AS id`);
      const ledgerId = (idResult.rows[0] as Record<string, unknown>).id as string;

      // Resolved values: edit overrides draft
      const resolvedAmount = input.edits.amount ?? String(draft.amount);
      const resolvedCurrency = input.edits.currency ?? (draft.currency as string);
      const resolvedAccountId = input.edits.accountId ?? (draft.account_id as string);
      const resolvedCategoryId = input.edits.categoryId !== undefined
        ? input.edits.categoryId
        : (draft.category_id as string | null);
      const resolvedKind = input.edits.kind ?? (draft.kind as "EXPENSE" | "INCOME" | "TRANSFER");
      const resolvedNote = input.edits.note !== undefined ? input.edits.note : (draft.note as string | null);

      const wsResult = await drizzleTx.execute(sql`
        SELECT default_currency FROM tenancy.workspaces WHERE id = ${input.tenantId}::uuid LIMIT 1
      `);
      const defaultCurrency = ((wsResult.rows[0] as Record<string, unknown> | undefined)?.default_currency as string) ?? "USD";

      let amountDefault = resolvedAmount;
      let fxRate = "1";
      let fxRateDate = draft.due_date as string;
      let fxProvider = "recurring";

      if (input.edits.fxPreview) {
        fxRate = input.edits.fxPreview.rate;
        fxRateDate = input.edits.fxPreview.fxRateDate;
        amountDefault = String(parseFloat(resolvedAmount) * parseFloat(fxRate));
        fxProvider = "fx-preview";
      }

      await deps.transactionRepo.createInTx(
        tx,
        [
          {
            id: ledgerId,
            tenantId: input.tenantId,
            kind: resolvedKind,
            amountOrig: resolvedAmount,
            currencyOrig: resolvedCurrency,
            amountDefault,
            currencyDefault: defaultCurrency,
            fxRate,
            fxRateDate,
            fxProvider,
            transactionDate: draft.due_date as string,
            note: resolvedNote,
            accountId: resolvedAccountId,
            categoryId: resolvedCategoryId,
            transferGroupId: null,
            correctsId: null,
            balanceDeltaSign: resolvedKind === "INCOME" ? 1 : -1,
          },
        ],
        input.actorUserId,
        input.tenantId,
      );

      await deps.draftRepo.markConfirmed(tx, input.draftId, input.actorUserId);

      await writeAudit(tx, {
        tenantId: TenantId(input.tenantId),
        actorUserId: UserId(input.actorUserId),
        entityType: "recurring_draft",
        entityId: input.draftId,
        action: "update" as const,
        before: { status: "PENDING", amount: draft.amount },
        after: { status: "CONFIRMED", ledgerId, edits: input.edits },
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
