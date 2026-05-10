/**
 * edit-transaction.ts — Application use case: edit a transaction via correction row.
 *
 * Editing a transaction NEVER updates the original row (UPDATE is REVOKE'd at SQL layer).
 * Instead, this use case inserts a NEW ledger row with corrects_id = original.id.
 *
 * Gates (in order):
 * 1. Load original via repo.findById — err if not found
 * 2. Reject edits to kind or transfer_group_id (immutable post-creation)
 * 3. If amount/currency/date changed, re-fetch FX via fxProvider.rateAsOf
 *    (or use fxPreview if provided + 60-min freshness valid — same gate as create-transaction)
 * 4. Compute amountDefault from new rate if FX re-fetched
 * 5. Call repo.insertCorrection (which opens withTenantTx + SELECT FOR UPDATE)
 * 6. Return Result<{correctionId, originalId}, Error>
 *
 * D-01-a/b, EXPN-06, T-2-07-01..06.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TransactionRepo } from "../ports/transaction-repo";
import { computeDiff, type CorrectionEdits } from "../domain/correction";
import { FxRateStaleError } from "./create-transaction";

export interface EditTransactionInput {
  transactionId: string;
  edits: CorrectionEdits;
  fxPreview?: { rate: string; fxRateDate: string } | null;
  actorUserId: string;
  tenantId: string;
}

export interface EditTransactionResult {
  correctionId: string;
  originalId: string;
}

export interface EditTransactionDeps {
  transactionRepo: TransactionRepo;
  fxProvider?: {
    rateAsOf(from: string, to: string, date: Date): Promise<{ rate: string; provider: string; isStale: boolean }>;
  };
  getWorkspaceDefaultCurrency?: (tenantId: string) => Promise<string>;
}

/** 60-minute freshness window (EXPN-13 / D-02-d) */
const FX_STALE_MINUTES = 60;

function parseFxDate(fxRateDate: string): Date {
  return new Date(fxRateDate);
}

export function editTransaction(deps: EditTransactionDeps) {
  return async (
    input: EditTransactionInput,
  ): Promise<Result<EditTransactionResult, Error>> => {
    const { transactionRepo } = deps;

    // Gate 1: load original
    const original = await transactionRepo.findById(input.tenantId, input.transactionId);
    if (!original) {
      const { TransactionNotFoundError } = await import("../adapters/persistence/transaction-repo");
      return err(new TransactionNotFoundError(input.transactionId));
    }

    // Gate 2: reject kind / transfer_group_id edits (immutable — T-2-07-05, T-2-07-06)
    const edits = { ...input.edits } as CorrectionEdits & { kind?: unknown; transferGroupId?: unknown };
    if ("kind" in edits && edits.kind !== undefined) {
      return err(new Error("Cannot change transaction kind — create a new transaction instead"));
    }
    if ("transferGroupId" in edits && edits.transferGroupId !== undefined) {
      return err(new Error("Cannot change transfer_group_id — legs are permanently linked"));
    }

    let finalEdits: CorrectionEdits = input.edits;

    // Gate 3: FX re-fetch if amount/currency/date changed
    const needsFxRefresh = (
      (input.edits.amountOrig !== undefined && input.edits.amountOrig !== original.amountOrig) ||
      (input.edits.currencyOrig !== undefined && input.edits.currencyOrig !== original.currencyOrig) ||
      (input.edits.transactionDate !== undefined && input.edits.transactionDate !== original.transactionDate)
    );

    if (needsFxRefresh && deps.fxProvider && deps.getWorkspaceDefaultCurrency) {
      const newCurrencyOrig = input.edits.currencyOrig ?? original.currencyOrig;
      const newDate = input.edits.transactionDate ?? original.transactionDate;
      const defaultCurrency = await deps.getWorkspaceDefaultCurrency(input.tenantId);

      if (newCurrencyOrig !== defaultCurrency) {
        if (input.fxPreview) {
          // Validate freshness (EXPN-13 / D-02-d)
          const ageMinutes = (Date.now() - parseFxDate(input.fxPreview.fxRateDate).getTime()) / (1000 * 60);
          if (ageMinutes > FX_STALE_MINUTES) {
            const fresh = await deps.fxProvider.rateAsOf(newCurrencyOrig, defaultCurrency, new Date(newDate));
            return err(new FxRateStaleError({
              rate: fresh.rate,
              fxRateDate: newDate,
              provider: fresh.provider,
              isStale: fresh.isStale,
            }));
          }
          const newAmount = input.edits.amountOrig ?? original.amountOrig;
          finalEdits = {
            ...input.edits,
            amountDefault: (parseFloat(newAmount) * parseFloat(input.fxPreview.rate)).toFixed(4),
            fxRate: input.fxPreview.rate,
            fxRateDate: input.fxPreview.fxRateDate.slice(0, 10),
            fxProvider: "frankfurter",
          };
        } else {
          // Fetch fresh rate from provider
          const fetched = await deps.fxProvider.rateAsOf(newCurrencyOrig, defaultCurrency, new Date(newDate));
          const newAmount = input.edits.amountOrig ?? original.amountOrig;
          finalEdits = {
            ...input.edits,
            amountDefault: (parseFloat(newAmount) * parseFloat(fetched.rate)).toFixed(4),
            fxRate: fetched.rate,
            fxRateDate: newDate,
            fxProvider: fetched.provider,
          };
        }
      } else {
        // Same currency as default — rate is 1
        const newAmount = input.edits.amountOrig ?? original.amountOrig;
        finalEdits = {
          ...input.edits,
          amountDefault: newAmount,
          fxRate: "1",
          fxRateDate: newDate,
          fxProvider: "internal",
        };
      }
    }

    // Compute diff for audit_history
    const diff = computeDiff(original, finalEdits);

    try {
      const result = await transactionRepo.insertCorrection(
        input.transactionId,
        finalEdits,
        input.actorUserId,
        input.tenantId,
        diff,
      );

      return ok({
        correctionId: result.ledgerId,
        originalId: input.transactionId,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
