import { createAuthClient } from "better-auth/client";

// D-15: Session is Postgres-backed — use cookies, never localStorage.
// T-10: SameSite=Lax cookie + CSRF header on POST/PUT/PATCH/DELETE.
// The Better Auth client handles CSRF token injection automatically.
export const authClient = createAuthClient({
  baseURL: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001",
});

export const { signIn, signUp, signOut, useSession, sendVerificationEmail } =
  authClient;

// Better Auth uses forgetPassword (not "forgot") — available via the client object
export const forgetPassword = (authClient as unknown as Record<string, unknown>)
  .forgetPassword as (opts: {
  email: string;
  redirectTo: string;
}) => Promise<unknown>;

export const resetPassword = (authClient as unknown as Record<string, unknown>)
  .resetPassword as (opts: {
  token: string;
  newPassword: string;
}) => Promise<unknown>;
