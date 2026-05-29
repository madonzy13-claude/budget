/**
 * edit-transaction.ts — Application use case: in-place PATCH of a transaction (v1.1).
 *
 * v1.1 (Plan 02-01, D-PH2-07):
 *   - No correction rows — updateInPlace() replaces insertCorrection().
 *   - If currencyOriginal OR date changes → server re-computes FX server-side.
 *   - Note-only PATCH → no FX call, rate/asOf unchanged.
 *   - amount_converted_cents is NEVER accepted from client (T-02-02).
 *
 * Pitfall 7: date string converted via new Date(s + 'T00:00:00Z').
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type {
  TransactionRepo,
  TransactionRow,
} from "../ports/transaction-repo";

export class TransactionNotFoundError extends Error {
  readonly kind = "TransactionNotFound" as const;
  constructor(public readonly id: string) {
    super(`Transaction ${id} not found`);
    this.name = "TransactionNotFoundError";
  }
}

export interface EditTransactionInput {
  transactionId: string;
  tenantId: string;
  actorUserId: string;
  fields: {
    date?: string;
    categoryId?: string;
    amountOriginalCents?: number;
    currencyOriginal?: string;
    note?: string | null;
    kind?: "SPENDING" | "INCOME";
  };
}

export interface EditTransactionResult {
  transaction: TransactionRow;
}

export interface EditTransactionDeps {
  transactionRepo: TransactionRepo;
  fxProvider: {
    rateAsOf(
      from: string,
      to: string,
      date: Date,
    ): Promise<{ rate: string; provider: string; isStale: boolean }>;
  };
  /** Resolve the budget's display currency for FX conversion. */
  getBudgetCurrency?(budgetId: string): Promise<string>;
  /** Back-compat alias of {@link getBudgetCurrency}. Either may be supplied. */
  getWorkspaceDefaultCurrency?(budgetId: string): Promise<string>;
}

export function editTransaction(deps: EditTransactionDeps) {
  return async (
    input: EditTransactionInput,
  ): Promise<Result<EditTransactionResult, Error>> => {
    const { transactionRepo } = deps;

    // Load original (RLS-scoped)
    const original = await transactionRepo.findById(
      input.tenantId,
      input.transactionId,
    );
    if (!original) {
      return err(new TransactionNotFoundError(input.transactionId));
    }

    const newCurrency =
      input.fields.currencyOriginal ?? original.currencyOriginal;
    const newDate = input.fields.date ?? original.date;
    const newAmountCents =
      input.fields.amountOriginalCents !== undefined
        ? String(Math.abs(input.fields.amountOriginalCents))
        : original.amountOriginalCents;

    const currencyChanged =
      input.fields.currencyOriginal !== undefined &&
      input.fields.currencyOriginal !== original.currencyOriginal;
    const dateChanged =
      input.fields.date !== undefined && input.fields.date !== original.date;

    // D-PH2-07: re-compute FX when currency OR date changes (T-02-02)
    let updateFields: Parameters<TransactionRepo["updateInPlace"]>[1] = {};

    if (currencyChanged || dateChanged) {
      const budgetCurrency = await (
        deps.getBudgetCurrency ?? deps.getWorkspaceDefaultCurrency!
      )(original.budgetId);

      let newAmountConverted: string;

      if (newCurrency === budgetCurrency) {
        newAmountConverted = newAmountCents;
      } else {
        const fxResult = await deps.fxProvider.rateAsOf(
          newCurrency,
          budgetCurrency,
          new Date(newDate + "T00:00:00Z"), // Pitfall 7
        );
        // T-02-01: cap rate to sane bounds (0 < rate < 1e6) before persisting
        const rateNum = Number(fxResult.rate);
        if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
          return err(new Error(`FX rate out of bounds: ${fxResult.rate}`));
        }
        newAmountConverted = String(
          Math.round(Number(newAmountCents) * rateNum),
        );
      }

      // UAT-Phase6-Test7 retest #5: lock the row to the budget currency
      // after any cross-currency edit. The user's chosen non-budget code
      // is consumed only to compute the converted amount — once the row
      // is persisted it reads as if it had always been in the budget
      // currency. This preserves "spent vs budget" math without showing
      // a confusing mix of foreign-code labels alongside converted
      // amounts in the spendings grid.
      updateFields = {
        ...updateFields,
        fxRate: "1",
        fxAsOf: newDate,
        amountOriginalCents: newAmountConverted,
        amountConvertedCents: newAmountConverted,
        currencyOriginal: budgetCurrency,
      };
    }

    // Merge explicit field changes (never accept amount_converted_cents from client)
    if (input.fields.date !== undefined) updateFields.date = newDate;
    if (input.fields.categoryId !== undefined)
      updateFields.categoryId = input.fields.categoryId;
    if (input.fields.amountOriginalCents !== undefined) {
      updateFields.amountOriginalCents = newAmountCents;
      // If amount changed but currency/date did NOT change, recompute converted amount
      if (!currencyChanged && !dateChanged) {
        const budgetCurrency = await (
          deps.getBudgetCurrency ?? deps.getWorkspaceDefaultCurrency!
        )(original.budgetId);
        const currentRate = original.fxRate;
        if (original.currencyOriginal === budgetCurrency) {
          updateFields.amountConvertedCents = newAmountCents;
        } else {
          updateFields.amountConvertedCents = String(
            Math.round(Number(newAmountCents) * Number(currentRate)),
          );
        }
      }
    }
    if (input.fields.note !== undefined) updateFields.note = input.fields.note;
    if (input.fields.kind !== undefined) updateFields.kind = input.fields.kind;

    try {
      await transactionRepo.updateInPlace(
        input.transactionId,
        updateFields,
        input.actorUserId,
        input.tenantId,
      );
    } catch (e) {
      return err(e as Error);
    }

    // Fetch updated row to return full shape
    const updated = await transactionRepo.findById(
      input.tenantId,
      input.transactionId,
    );
    if (!updated) {
      return err(new Error("Transaction not found after update"));
    }

    return ok({ transaction: updated });
  };
}
