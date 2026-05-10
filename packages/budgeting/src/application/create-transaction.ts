/**
 * create-transaction.ts — Application use case: create EXPENSE / INCOME / TRANSFER ledger rows.
 *
 * Validation gates (in order):
 * 1. currency_orig in supported_currencies allowlist
 * 2. workspace_share_dirty = true → 409 WorkspaceSharesDirty (D-02-c)
 * 3. account must not be archived
 * 4. FX rate: if client provides fxPreview, validate <60 min freshness (D-02-d / EXPN-13);
 *    else call fxProvider.rateAsOf(currencyOrig, defaultCurrency, transactionDate)
 * 5. TRANSFER: split into two rows sharing transfer_group_id; each leg's own FX
 * 6. delegate to repo.create() (opens withTenantTx atomically)
 *
 * rateAsOf is called in this use case, NOT in the repo — MONY-06 adapter boundary.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";
import type { TransactionRepo, TransactionRow } from "../ports/transaction-repo";
import { isSupportedCurrency } from "../adapters/persistence/supported-currencies-repo";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

export class FxRateStaleError extends Error {
  readonly kind = "FxRateStale" as const;
  constructor(
    public readonly freshRate: {
      rate: string;
      fxRateDate: string;
      provider: string;
      isStale: boolean;
    },
  ) {
    super("FX rate is stale — server fetched a fresh rate");
    this.name = "FxRateStaleError";
  }
}

export class WorkspaceSharesDirtyError extends Error {
  readonly kind = "WorkspaceSharesDirty" as const;
  constructor() {
    super("Workspace shares are dirty — re-run share allocation before transacting");
    this.name = "WorkspaceSharesDirtyError";
  }
}

export class AccountArchivedError extends Error {
  readonly kind = "AccountArchived" as const;
  constructor(public readonly accountId: string) {
    super(`Account ${accountId} is archived`);
    this.name = "AccountArchivedError";
  }
}

export class CurrencyNotSupportedError extends Error {
  readonly kind = "CurrencyNotSupported" as const;
  constructor(public readonly currency: string) {
    super(`Currency ${currency} is not in the supported currencies list`);
    this.name = "CurrencyNotSupportedError";
  }
}

export interface FxPreview {
  rate: string;
  fxRateDate: string; // ISO date string 'YYYY-MM-DD' or ISO timestamp
}

export interface CreateTransactionInput {
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  amountOrig: string;
  currencyOrig: string;
  transactionDate: string; // ISO 'YYYY-MM-DD'
  accountId: string;
  categoryId?: string | null;
  note?: string | null;
  /** For TRANSFER only: destination account */
  toAccountId?: string;
  /** Client-provided FX preview (EXPN-13) — server validates freshness */
  fxPreview?: FxPreview | null;
  tenantId: string;
  actorUserId: string;
}

export interface CreateTransactionResult {
  ledgerId: string;
  transferGroupId?: string;
  fxRateUsed: {
    rate: string;
    fxRateDate: string;
    provider: string;
    isStale: boolean;
  };
}

export interface CreateTransactionDeps {
  transactionRepo: TransactionRepo;
  accountRepo: AccountRepo;
  fxProvider: {
    rateAsOf(
      from: string,
      to: string,
      date: Date,
    ): Promise<{ rate: string; provider: string; isStale: boolean }>;
  };
  /** Workspace default currency resolver */
  getWorkspaceDefaultCurrency(tenantId: string): Promise<string>;
}

/** 60-minute freshness window (EXPN-13 / D-02-d) */
const FX_STALE_MINUTES = 60;

function parseFxRateDate(fxRateDate: string): Date {
  // fxRateDate may be ISO date ('YYYY-MM-DD') or ISO timestamp
  return new Date(fxRateDate);
}

export function createTransaction(deps: CreateTransactionDeps) {
  return async (
    input: CreateTransactionInput,
  ): Promise<
    Result<
      CreateTransactionResult,
      FxRateStaleError | WorkspaceSharesDirtyError | AccountArchivedError | CurrencyNotSupportedError | Error
    >
  > => {
    // Gate 1: currency allowlist
    const supported = await isSupportedCurrency(input.currencyOrig);
    if (!supported) {
      return err(new CurrencyNotSupportedError(input.currencyOrig));
    }

    // Gate 2: share_dirty check (D-02-c)
    const shareDirtyCheck = await withInfraTx(async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Array<{ dirty: boolean }> }> };
      const rs = await drizzleTx.execute(
        sql`SELECT dirty FROM budgeting.workspace_share_dirty
             WHERE workspace_id = ${input.tenantId}::uuid LIMIT 1`,
      );
      return rs.rows[0]?.dirty ?? false;
    });
    if (shareDirtyCheck.isOk() && shareDirtyCheck.value === true) {
      return err(new WorkspaceSharesDirtyError());
    }

    // Gate 3: account not archived
    const account = await deps.accountRepo.findById(input.tenantId, input.accountId);
    if (!account) {
      return err(new Error(`Account ${input.accountId} not found`));
    }
    if (account.archivedAt !== null) {
      return err(new AccountArchivedError(input.accountId));
    }

    // Get workspace default currency
    const defaultCurrency = await deps.getWorkspaceDefaultCurrency(input.tenantId);

    // Gate 4: FX rate
    let fxRateUsed: { rate: string; fxRateDate: string; provider: string; isStale: boolean };

    if (input.currencyOrig === defaultCurrency) {
      // Same currency — no conversion needed
      fxRateUsed = {
        rate: "1",
        fxRateDate: input.transactionDate,
        provider: "internal",
        isStale: false,
      };
    } else if (input.fxPreview) {
      // Client provided a previewed rate — validate freshness (EXPN-13 / D-02-d)
      const rateAge = Date.now() - parseFxRateDate(input.fxPreview.fxRateDate).getTime();
      const ageMinutes = rateAge / (1000 * 60);

      if (ageMinutes > FX_STALE_MINUTES) {
        // Rate too old — fetch fresh and return 409
        const freshRateResult = await deps.fxProvider.rateAsOf(
          input.currencyOrig,
          defaultCurrency,
          new Date(input.transactionDate),
        );
        const freshRateDate = input.transactionDate; // use transaction date for fresh lookup
        return err(
          new FxRateStaleError({
            rate: freshRateResult.rate,
            fxRateDate: freshRateDate,
            provider: freshRateResult.provider,
            isStale: freshRateResult.isStale,
          }),
        );
      }

      // Rate is fresh enough — use client's previewed rate
      fxRateUsed = {
        rate: input.fxPreview.rate,
        fxRateDate: input.fxPreview.fxRateDate.slice(0, 10), // normalize to YYYY-MM-DD
        provider: "frankfurter",
        isStale: input.fxPreview.fxRateDate.slice(0, 10) < input.transactionDate,
      };
    } else {
      // No preview — fetch from provider
      const fetched = await deps.fxProvider.rateAsOf(
        input.currencyOrig,
        defaultCurrency,
        new Date(input.transactionDate),
      );
      fxRateUsed = {
        rate: fetched.rate,
        fxRateDate: input.transactionDate,
        provider: fetched.provider,
        isStale: fetched.isStale,
      };
    }

    // Compute amountDefault
    const amountDefault = (
      parseFloat(input.amountOrig) * parseFloat(fxRateUsed.rate)
    ).toFixed(4);

    if (input.kind === "TRANSFER") {
      // EXPN-03: two linked rows sharing transfer_group_id
      const transferGroupId = crypto.randomUUID();
      const fromLegId = crypto.randomUUID();
      const toLegId = crypto.randomUUID();
      const toAccountId = input.toAccountId ?? input.accountId;

      // Validate to-account
      if (input.toAccountId) {
        const toAccount = await deps.accountRepo.findById(input.tenantId, input.toAccountId);
        if (!toAccount || toAccount.archivedAt !== null) {
          return err(new AccountArchivedError(input.toAccountId));
        }
      }

      const rows: TransactionRow[] = [
        {
          id: fromLegId,
          tenantId: input.tenantId,
          kind: "TRANSFER",
          amountOrig: input.amountOrig,
          currencyOrig: input.currencyOrig,
          amountDefault,
          currencyDefault: defaultCurrency,
          fxRate: fxRateUsed.rate,
          fxRateDate: fxRateUsed.fxRateDate,
          fxProvider: fxRateUsed.provider,
          transactionDate: input.transactionDate,
          note: input.note ?? null,
          accountId: input.accountId,
          categoryId: null, // TRANSFER has no category
          transferGroupId,
          correctsId: null,
          balanceDeltaSign: -1, // debit from-account
        },
        {
          id: toLegId,
          tenantId: input.tenantId,
          kind: "TRANSFER",
          amountOrig: input.amountOrig,
          currencyOrig: input.currencyOrig,
          amountDefault,
          currencyDefault: defaultCurrency,
          fxRate: fxRateUsed.rate,
          fxRateDate: fxRateUsed.fxRateDate,
          fxProvider: fxRateUsed.provider,
          transactionDate: input.transactionDate,
          note: input.note ?? null,
          accountId: toAccountId,
          categoryId: null,
          transferGroupId,
          correctsId: null,
          balanceDeltaSign: 1, // credit to-account
        },
      ];

      try {
        await deps.transactionRepo.create(rows, input.actorUserId, input.tenantId);
      } catch (e) {
        return err(e as Error);
      }

      return ok({
        ledgerId: fromLegId,
        transferGroupId,
        fxRateUsed,
      });
    } else {
      // EXPENSE or INCOME
      const ledgerId = crypto.randomUUID();
      const row: TransactionRow = {
        id: ledgerId,
        tenantId: input.tenantId,
        kind: input.kind,
        amountOrig: input.amountOrig,
        currencyOrig: input.currencyOrig,
        amountDefault,
        currencyDefault: defaultCurrency,
        fxRate: fxRateUsed.rate,
        fxRateDate: fxRateUsed.fxRateDate,
        fxProvider: fxRateUsed.provider,
        transactionDate: input.transactionDate,
        note: input.note ?? null,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        transferGroupId: null,
        correctsId: null,
        balanceDeltaSign: input.kind === "INCOME" ? 1 : -1,
      };

      try {
        await deps.transactionRepo.create([row], input.actorUserId, input.tenantId);
      } catch (e) {
        return err(e as Error);
      }

      return ok({
        ledgerId,
        fxRateUsed,
      });
    }
  };
}
