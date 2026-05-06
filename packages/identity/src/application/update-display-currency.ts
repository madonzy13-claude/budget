import { ok, err, type Result } from "@budget/shared-kernel";
import type { UserId } from "@budget/shared-kernel";
import type { UserRepo } from "../ports/user-repo";

export async function updateDisplayCurrency(
  deps: { userRepo: UserRepo },
  userId: UserId,
  currency: string,
): Promise<Result<void, Error>> {
  try {
    await deps.userRepo.updateDisplayCurrency(userId, currency);
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
