/**
 * share-override-repo.ts — ShareOverrideRepo port
 */
import type { Result } from "@budget/shared-kernel";

export interface ShareOverrideEntry {
  userId: string;
  percentage: string; // decimal string e.g. "60.0000"
}

export interface SetShareOverridesInput {
  tenantId: string;
  categoryId: string;
  entries: ShareOverrideEntry[];
  actorUserId: string;
}

export interface ShareOverrideDto {
  categoryId: string;
  userId: string;
  percentage: string;
}

export interface ShareOverrideRepo {
  setOverrides(input: SetShareOverridesInput): Promise<Result<ShareOverrideDto[], Error>>;
  listOverrides(tenantId: string, categoryId: string): Promise<ShareOverrideDto[]>;
}
