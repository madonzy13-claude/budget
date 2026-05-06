import { ok, err, type Result } from "@budget/shared-kernel";
import type { AuthInstance } from "../adapters/persistence/better-auth";

export async function verifyEmail(
  deps: { auth: AuthInstance },
  token: string,
): Promise<Result<void, Error>> {
  try {
    await deps.auth.api.verifyEmail({ query: { token } });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
