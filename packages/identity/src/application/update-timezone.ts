import { ok, err, type Result } from "@budget/shared-kernel";
import type { UserId } from "@budget/shared-kernel";
import type { UserRepo } from "../ports/user-repo";

/** True for a valid IANA zone id (e.g. "Europe/Warsaw"). Uses the runtime's tz db. */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateTimezone(
  deps: { userRepo: UserRepo },
  userId: UserId,
  timezone: string,
): Promise<Result<void, Error>> {
  if (!isValidTimezone(timezone)) {
    return err(new Error(`Invalid timezone: ${timezone}`));
  }
  try {
    await deps.userRepo.updateTimezone(userId, timezone);
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
