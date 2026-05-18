/**
 * reorder-wallets.ts — Application use case: persist the new intra-section
 * ordering for a tenant's wallets of a given walletType.
 *
 * UAT-PH5-T3-1x.
 *
 * The route hands us {walletType, orderedIds}. We verify every id actually
 * belongs to this tenant and to the supplied walletType (defence in depth +
 * RLS), then ask the repo to assign sort_order=1..N.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { WalletType } from "../domain/wallet";

export interface ReorderWalletsDeps {
  repo: WalletRepo & {
    reorderWithinType?: (
      tenantId: string,
      actorUserId: string,
      orderedIds: string[],
    ) => Promise<void>;
  };
}

export interface ReorderWalletsInput {
  tenantId: string;
  actorUserId: string;
  walletType: WalletType;
  orderedIds: string[];
}

export function reorderWallets(deps: ReorderWalletsDeps) {
  return async (
    input: ReorderWalletsInput,
  ): Promise<Result<{ ok: true }, Error>> => {
    if (input.orderedIds.length === 0) return ok({ ok: true });
    try {
      const wallets = await deps.repo.list(input.tenantId, false);
      const inType = new Map(
        wallets
          .filter((w) => w.walletType === input.walletType)
          .map((w) => [w.id, w]),
      );
      for (const id of input.orderedIds) {
        if (!inType.has(id)) {
          return err(new Error("wallet_id_not_in_section"));
        }
      }
      if (typeof deps.repo.reorderWithinType !== "function") {
        return err(new Error("reorder_not_supported"));
      }
      await deps.repo.reorderWithinType(
        input.tenantId,
        input.actorUserId,
        input.orderedIds,
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}
