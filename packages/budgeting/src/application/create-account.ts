/**
 * create-account.ts — Application use case: create a new account
 * Validates currency against budgeting.supported_currencies (SQL seed from plan 02-02).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";
import { Account, type AccountKind, type AccountScope } from "../domain/account";
import type { AccountDto, CreateAccountInput } from "../contracts/api";

export interface CreateAccountDeps {
  repo: AccountRepo;
}

export interface CreateAccountFullInput extends CreateAccountInput {
  tenantId: string;
  actorUserId: string;
}

export function createAccount(deps: CreateAccountDeps) {
  return async (
    input: CreateAccountFullInput,
  ): Promise<Result<AccountDto, Error>> => {
    // Validate currency is in supported_currencies (DB seed from plan 02-02 post-migration.sql)
    // NOT using runtime bootstrapSupportedCurrencies — that is opportunistic only.
    const { withTenantTx } = await import("@budget/platform");
    const { TenantId, UserId } = await import("@budget/shared-kernel");

    const currencyCheck = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const { sql } = await import("drizzle-orm");
        const r = await tx.execute<{ iso_code: string }>(
          sql`SELECT iso_code FROM budgeting.supported_currencies WHERE iso_code = ${input.currency} LIMIT 1`,
        );
        return r.rows.length > 0;
      },
    );

    if (currencyCheck.isErr()) return err(currencyCheck.error);
    if (!currencyCheck.value) {
      return err(
        new Error(
          `Currency ${input.currency} is not in the supported currencies list`,
        ),
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const account = new Account(
      id,
      input.tenantId,
      input.name,
      input.kind as AccountKind,
      input.scope as AccountScope,
      input.currency,
      Money.of("0", input.currency as any),
      null,
      now,
      input.actorUserId,
    );

    try {
      await deps.repo.create(account);
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: account.id,
      name: account.name,
      kind: account.kind,
      scope: account.scope,
      currency: account.currency,
      currentBalance: "0",
      archivedAt: null,
      createdAt: now.toISOString(),
    });
  };
}
