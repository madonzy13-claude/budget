import { ok, err, type Result } from "@budget/shared-kernel";
import type { UserId } from "@budget/shared-kernel";
import type { Locale } from "../contracts/api";
import type { UserRepo } from "../ports/user-repo";

export async function updateLocale(
  deps: { userRepo: UserRepo },
  userId: UserId,
  locale: Locale,
): Promise<Result<void, Error>> {
  try {
    await deps.userRepo.updateLocale(userId, locale);
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
