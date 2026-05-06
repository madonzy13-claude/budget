import { ok, err, type Result } from "@budget/shared-kernel";
import type { UserId } from "@budget/shared-kernel";
import type { AuthInstance } from "../adapters/persistence/better-auth";

export async function revokeSession(
  deps: { auth: AuthInstance },
  _userId: UserId,
  sessionToken: string,
): Promise<Result<void, Error>> {
  try {
    await deps.auth.api.revokeSession({
      body: { token: sessionToken },
      headers: new Headers(),
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
