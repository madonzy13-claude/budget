/**
 * list-share-overrides.ts — Application use case: list per-category share overrides.
 */
import type { ShareOverrideRepo } from "../ports/share-override-repo";
import type { ShareOverrideDto } from "../contracts/api";

export interface ListShareOverridesDeps {
  shareRepo: ShareOverrideRepo;
}

export function listShareOverrides(deps: ListShareOverridesDeps) {
  return async (tenantId: string, categoryId: string): Promise<ShareOverrideDto[]> => {
    return deps.shareRepo.listOverrides(tenantId, categoryId);
  };
}
