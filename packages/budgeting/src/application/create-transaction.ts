/**
 * create-transaction.ts — Application use case: create categorical transaction (v1.1).
 *
 * v1.1 changes (Plan 02-01, TXN-01..08):
 *   - No account/wallet linkage, no TRANSFER kind, no correction surface.
 *   - Negative amount_original_cents → flip kind to INCOME, store positive (D-PH2-09).
 *   - FX: server calls rateAsOf(currencyOriginal, budget.currency, date) on every create.
 *   - Quick-entry path: sets confirmed_at = now() immediately.
 *   - amountOriginalCents and amountConvertedCents are bigint strings.
 *
 * T-02-01: currency_original validated as 3-char ISO.
 * T-02-02: amount_converted_cents is NEVER read from client body — computed server-side.
 * Pitfall 7: date string converted via new Date(s + 'T00:00:00Z').
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type {
  TransactionRepo,
  TransactionRow,
} from "../ports/transaction-repo";

export class CurrencyNotSupportedError extends Error {
  readonly kind = "CurrencyNotSupported" as const;
  constructor(public readonly currency: string) {
    super(`Currency ${currency} is not in the supported currencies list`);
    this.name = "CurrencyNotSupportedError";
  }
}

export interface CreateTransactionInput {
  date: string; // 'YYYY-MM-DD'
  categoryId: string;
  /** Signed: negative value → kind flipped to INCOME (D-PH2-09) */
  amountOriginalCents: number;
  /** ISO-4217 3-char code; defaults to budget.currency when omitted */
  currencyOriginal?: string | null;
  note?: string | null;
  budgetId: string;
  tenantId: string;
  actorUserId: string;
}

export interface CreateTransactionResult {
  transaction: TransactionRow;
}

export interface CreateTransactionDeps {
  transactionRepo: TransactionRepo;
  /** Account/wallet repo, retained for back-compat wiring. Not consumed by the use case. */
  accountRepo?: unknown;
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

export function createTransaction(deps: CreateTransactionDeps) {
  return async (
    input: CreateTransactionInput,
  ): Promise<Result<CreateTransactionResult, Error>> => {
    const budgetCurrency = await (
      deps.getBudgetCurrency ?? deps.getWorkspaceDefaultCurrency!
    )(input.budgetId);

    // D-PH2-09: negative amount → INCOME with positive storage
    const rawCents = input.amountOriginalCents;
    const kind = rawCents < 0 ? "INCOME" : "SPENDING";
    const absCents = Math.abs(rawCents);
    const amountOriginalCents = String(absCents);

    // Resolve currency (default to budget currency)
    const currencyOriginal = (
      input.currencyOriginal ?? budgetCurrency
    ).toUpperCase();

    // T-02-01: validate 3-char ISO
    if (!/^[A-Z]{3}$/.test(currencyOriginal)) {
      return err(new CurrencyNotSupportedError(currencyOriginal));
    }

    // FX computation (T-02-02: NEVER from client; Pitfall 7: date string via T00:00:00Z)
    let fxRate: string;
    let fxAsOf: string;
    let amountConvertedCents: string;

    if (currencyOriginal === budgetCurrency) {
      fxRate = "1";
      fxAsOf = input.date;
      amountConvertedCents = amountOriginalCents;
    } else {
      const fxResult = await deps.fxProvider.rateAsOf(
        currencyOriginal,
        budgetCurrency,
        new Date(input.date + "T00:00:00Z"),
      );
      fxRate = fxResult.rate;
      fxAsOf = input.date;
      amountConvertedCents = String(Math.round(absCents * Number(fxRate)));
    }

    // T-02-01: cap rate to sane bounds (0 < rate < 1e6)
    const rateNum = Number(fxRate);
    if (rateNum <= 0 || rateNum >= 1e6) {
      return err(new Error(`FX rate out of bounds: ${fxRate}`));
    }

    const id = crypto.randomUUID();
    const row: TransactionRow = {
      id,
      tenantId: input.tenantId,
      budgetId: input.budgetId,
      categoryId: input.categoryId,
      date: input.date,
      amountOriginalCents,
      currencyOriginal,
      amountConvertedCents,
      fxRate,
      fxAsOf,
      note: input.note ?? null,
      recurringRuleId: null,
      // Quick-entry path: auto-confirm immediately
      confirmedAt: new Date(),
      kind: kind as "SPENDING" | "INCOME",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    try {
      await deps.transactionRepo.create(row, input.actorUserId, input.tenantId);
    } catch (e) {
      return err(e as Error);
    }

    return ok({ transaction: row });
  };
}
