/**
 * Test helpers for tenancy integration tests.
 * Avoids importing application layer from other packages (dep-cruiser + TS resolution).
 */
import { ok, err, type Result } from "@budget/shared-kernel";

type AnyAuth = {
  api: {
    signUpEmail: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ user: { id: string } }>;
  };
};

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  locale: string;
  displayCurrency: string;
}

/**
 * Helper matching the signature of identity's signUp application service.
 * Accepts { auth } deps object to match existing call-sites.
 */
export async function signUpHelper(
  deps: { auth: AnyAuth },
  input: SignUpInput,
): Promise<Result<{ userId: string }, Error>> {
  try {
    const r = await deps.auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        locale: input.locale,
        display_currency: input.displayCurrency,
      },
    });
    return ok({ userId: r.user.id });
  } catch (e) {
    return err(e as Error);
  }
}
