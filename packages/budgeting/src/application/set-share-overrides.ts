/**
 * set-share-overrides.ts — Application use case: set per-category share overrides
 * BDGT-08: validates shares sum to 100 via validateShares before calling repo.
 * DEFERRABLE trigger provides DB-level guarantee.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { validateShares } from "../domain/share-validation";
import type { ShareOverrideRepo } from "../ports/share-override-repo";
import type { SetShareOverridesInput, ShareOverrideDto } from "../contracts/api";

export interface SetShareOverridesDeps {
  shareRepo: ShareOverrideRepo;
}

export interface SetShareOverridesFullInput extends SetShareOverridesInput {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
}

export function setShareOverrides(deps: SetShareOverridesDeps) {
  return async (
    input: SetShareOverridesFullInput,
  ): Promise<Result<ShareOverrideDto[], Error>> => {
    // Validate shares sum to 100 before hitting DB
    const entries = input.entries.map((e) => ({
      userId: e.userId,
      percentage: e.percentage,
    }));

    const validation = validateShares(entries);
    if (validation.isErr()) return err(validation.error);

    return deps.shareRepo.setOverrides({
      tenantId: input.tenantId,
      categoryId: input.categoryId,
      entries: input.entries,
      actorUserId: input.actorUserId,
    });
  };
}
