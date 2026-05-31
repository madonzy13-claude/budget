/**
 * create-wallet.ts — Application use case: create a new wallet (renamed from create-account.ts)
 * Validates currency against budgeting.supported_currencies (SQL seed from plan 02-02).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import { Wallet, type WalletType } from "../domain/wallet";
import type { WalletDto, CreateWalletInput } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import { recomputeCushionTask } from "./recompute-cushion-task";
import type { FxProviderLike } from "./recurring-engine-fx";

export interface CreateWalletDeps {
  repo: WalletRepo;
  /** Phase 7 (D-PH7-19): when provided alongside fxProvider, recompute the
   *  CUSHION_BELOW_TARGET task in a follow-up tx after a new CUSHION wallet
   *  lands. Optional so legacy callers (tests, alternate boot paths) keep
   *  compiling. */
  taskRepo?: TaskRepo;
  fxProvider?: FxProviderLike;
}

export interface CreateWalletFullInput extends CreateWalletInput {
  tenantId: string;
  actorUserId: string;
}

export function createWallet(deps: CreateWalletDeps) {
  return async (
    input: CreateWalletFullInput,
  ): Promise<Result<WalletDto, Error>> => {
    // Validate currency is in supported_currencies (DB seed from plan 02-02 post-migration.sql)
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
    const wallet = new Wallet(
      id,
      input.tenantId,
      input.name,
      input.walletType as WalletType,
      input.currency,
      Money.of("0", input.currency as any),
      null,
      now,
      input.actorUserId,
    );
    // UAT-PH5-T3-1x: carry optional presentation customization into INSERT.
    wallet.color = (input as any).color ?? null;
    wallet.icon = (input as any).icon ?? null;

    try {
      await deps.repo.create(wallet);
    } catch (e) {
      return err(e as Error);
    }

    // Phase 7 (D-PH7-19): CUSHION_BELOW_TARGET recompute hook.
    // Gate on the new wallet being CUSHION-type — adding a cushion wallet
    // bumps the actual cushion amount and may resolve an open shortfall task.
    // A2 fallback: separate withTenantTx after the wallet write lands.
    if (input.walletType === "CUSHION" && deps.taskRepo && deps.fxProvider) {
      const taskRepo = deps.taskRepo;
      const fxProvider = deps.fxProvider;
      const recomputeR = await withTenantTx(
        TenantId(input.tenantId),
        UserId(input.actorUserId),
        async (tx) => {
          await recomputeCushionTask(
            tx as unknown as TenantTx,
            { tenantId: input.tenantId, budgetId: input.tenantId },
            { taskRepo, fxProvider },
          );
        },
      );
      // Don't fail the create on a recompute glitch — surface via log instead.
      if (recomputeR.isErr()) {
        console.error(
          "[create-wallet] cushion recompute failed:",
          recomputeR.error,
        );
      }
    }

    return ok({
      id: wallet.id,
      name: wallet.name,
      walletType: wallet.walletType,
      currency: wallet.currency,
      currentBalanceCents: "0",
      archivedAt: null,
      createdAt: now.toISOString(),
      color: wallet.color,
      icon: wallet.icon,
      // Repo computes the real sortOrder on INSERT; the DTO's sortOrder
      // matters only after the subsequent list refetch, so 0 here is fine.
      sortOrder: 0,
    });
  };
}
