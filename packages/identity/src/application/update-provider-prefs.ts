import { ok, err, type Result } from "@budget/shared-kernel";
import type { UserId } from "@budget/shared-kernel";
import type { LLMProviderName, STTProviderName } from "../contracts/api";
import type { UserRepo } from "../ports/user-repo";

export async function updateProviderPrefs(
  deps: { userRepo: UserRepo },
  userId: UserId,
  prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null },
): Promise<Result<void, Error>> {
  try {
    await deps.userRepo.updateProviderPrefs(userId, prefs);
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
