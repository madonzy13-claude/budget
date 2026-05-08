import { ok, err, type Result } from "@budget/shared-kernel";
import type { Locale } from "../contracts/api";
import type { AuthInstance } from "../adapters/persistence/better-auth";

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  locale: Locale;
  displayCurrency: string;
}

export async function signUp(
  deps: { auth: AuthInstance },
  input: SignUpInput,
): Promise<Result<{ userId: string }, Error>> {
  try {
    const r = await deps.auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        locale: input.locale,
        displayCurrency: input.displayCurrency,
      },
    });
    return ok({ userId: r.user.id });
  } catch (e) {
    return err(e as Error);
  }
}
