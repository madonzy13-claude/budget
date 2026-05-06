import { ok, err, type Result } from "@budget/shared-kernel";
import type { AuthInstance } from "../adapters/persistence/better-auth";

export async function requestPasswordReset(
  deps: { auth: AuthInstance },
  email: string,
): Promise<Result<void, Error>> {
  try {
    await deps.auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}

export async function confirmPasswordReset(
  deps: { auth: AuthInstance },
  token: string,
  newPassword: string,
): Promise<Result<void, Error>> {
  try {
    await deps.auth.api.resetPassword({
      body: { token, newPassword },
    });
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}
