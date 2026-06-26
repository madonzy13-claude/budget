// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createIdentityModule() from contracts/factory.ts (PC-02, PC-15).
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { appPool, LibsodiumKeyStore, withUserContext } from "@budget/platform";
import { loadEnv, UserId } from "@budget/shared-kernel";
import type { EmailLocale, EmailSender } from "@budget/shared-kernel";
import { users, sessions, accounts, verifications } from "./schema";

export interface CreateAuthOptions {
  emailSender: EmailSender;
  keyStore: LibsodiumKeyStore;
  additionalPlugins?: BetterAuthOptions["plugins"];
  additionalSchema?: Record<string, unknown>;
}

function pickLocale(value?: string): EmailLocale {
  if (value === "pl" || value === "uk" || value === "en") return value;
  return "en";
}

export function buildTrustedOrigins(
  appUrl: string,
  trustedOriginsEnv?: string,
): string[] {
  return [
    appUrl,
    ...(trustedOriginsEnv
      ?.split(",")
      .map((o) => o.trim())
      .filter(Boolean) ?? []),
  ];
}

/**
 * Recompute identity.users.email_hash from the plain email.
 *
 * email_hash is a deterministic BLAKE2b(email) backing the users_email_hash_uq
 * UNIQUE index. Better Auth writes only the PLAIN email column on create AND on
 * changeEmail-confirm — so both the create-after and update-after hooks call this
 * to keep the hash in sync. Without it, an email change leaves a stale hash
 * (broken uniqueness + lookup). Runs inside withUserContext so RLS permits the
 * self-row UPDATE (PC-03).
 */
export async function recomputeEmailHash(
  keyStore: LibsodiumKeyStore,
  userId: UserId,
  email: string,
): Promise<void> {
  const hash = await keyStore.emailHash(email);
  const r = await withUserContext(userId, async (tx) => {
    await tx.execute(
      sql`UPDATE identity.users SET email_hash = ${Buffer.from(hash)} WHERE id = ${userId as string}::uuid`,
    );
  });
  if (r.isErr()) throw r.error;
}

export function createAuth(opts: CreateAuthOptions) {
  const env = loadEnv();
  const db = drizzle(appPool(), { casing: "snake_case" });
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: false,
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        ...(opts.additionalSchema ?? {}),
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/auth",
    trustedOrigins: buildTrustedOrigins(env.APP_URL, env.TRUSTED_ORIGINS),
    // All Better Auth-managed primary keys live in `uuid` columns (identity.users,
    // tenancy.workspaces, tenancy.workspace_members, tenancy.workspace_invitations).
    // Default IDs are 32-char nanoids which fail the uuid cast at INSERT — generate
    // v4 UUIDs everywhere instead.
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    emailAndPassword: {
      enabled: true,
      // Strict gate: user must click the verification link before any sign-in
      // creates a session. autoSignIn is disabled so sign-up never returns a
      // session cookie. After the user clicks the link, autoSignInAfterVerification
      // (set below) issues the session.
      requireEmailVerification: true,
      minPasswordLength: 10,
      autoSignIn: false,
      sendResetPassword: async ({ user, url }) => {
        await opts.emailSender.send({
          to: user.email,
          template: "reset-password",
          vars: { url },
          locale: pickLocale((user as { locale?: string }).locale),
        });
      },
      resetPasswordTokenExpiresIn: 1800,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await opts.emailSender.send({
          to: user.email,
          template: "verify-email",
          vars: { url },
          locale: pickLocale((user as { locale?: string }).locale),
        });
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 86400,
    },
    // 260613-hig T3: short-TTL signed cookie cache to avoid a DB session lookup
    // on EVERY API request. A spendings nav fires ~8 parallel fetches — each
    // previously hit identity.sessions. With cookieCache enabled, getSession reads
    // the signed session snapshot from the cookie instead of querying the DB.
    //
    // maxAge 60s: session revocation (logout / expiry) takes effect within one
    // minute — acceptable UX (session cookie itself is also expired on sign-out
    // so the browser stops sending it immediately; only a manually crafted
    // request within the 60s window would get the cached session).
    //
    // refreshCache is intentionally omitted: in the stateful DB setup, setting
    // refreshCache=true triggers a warning + no-op. Without it, Better Auth uses
    // the cookieRefreshCache=false path — reads from the signed cookie only,
    // no DB round-trip. Session DB is still the source of truth for new sessions
    // and token rotation; the cache is a read-time optimisation only.
    session: {
      // 260615-e8s: effectively never expire. An installed offline PWA must not
      // bounce the user to /sign-in just because time passed — offline they
      // cannot sign in, so a lapsed session = a dead app. Browsers AND Better
      // Auth (better-call) HARD-CAP a cookie Max-Age at 400 days (34560000s) —
      // anything larger throws "Cookies Max-Age SHOULD NOT be greater than 400
      // days". So 400 days is the hard ceiling; we use 365 days (safely under it)
      // + a sliding updateAge so EVERY use slides the expiry forward to a full
      // year out. An active session therefore never expires; only ~365 days of
      // zero use would lapse it.
      //
      // SECURITY TRADEOFF (accepted for this self-hosted, single-household app):
      // a stolen session cookie stays valid up to a year with no periodic forced
      // re-auth. Revocation is still immediate via logout (clears the cookie +
      // the DB session row); the cookieCache window below bounds how long a
      // revoked-but-cached session can linger to 60s.
      expiresIn: 60 * 60 * 24 * 365, // 365 days — under the 400-day cookie cap
      updateAge: 60 * 60 * 24, // slide the expiry forward at most once/day on use
      cookieCache: {
        enabled: true,
        maxAge: 60, // 60s TTL — revocation effective within one minute
      },
    },
    user: {
      additionalFields: {
        locale: {
          type: "string",
          input: true,
          required: true,
          defaultValue: "en",
        },
        displayCurrency: {
          type: "string",
          input: true,
          required: true,
          defaultValue: "USD",
        },
      },
      // USET-04: let a signed-in user change their login email. Because the
      // current email is verified (requireEmailVerification), Better Auth first
      // sends a confirm link to the OLD address; on click the plain email column
      // updates, email_verified flips false, and the existing
      // emailVerification.sendVerificationEmail re-verifies the NEW address.
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({
          user,
          newEmail,
          url,
        }: {
          user: { email: string; locale?: string };
          newEmail: string;
          url: string;
        }) => {
          await opts.emailSender.send({
            to: user.email, // OLD address — the confirm link
            template: "change-email",
            vars: { url, newEmail },
            locale: pickLocale(user.locale),
          });
        },
        updateEmailWithoutVerification: false,
      },
    },
    // D-16 wiring: email hash + DEK written in create-after via withUserContext (PC-03).
    // email_hash cannot be set in create-before because Better Auth's Drizzle adapter only
    // includes fields it knows about (core + additionalFields) — bytea fields from the schema
    // are silently dropped from the INSERT payload. We set it via UPDATE in the after hook
    // where withUserContext has already established the user context GUC.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            return {
              data: {
                ...user,
                id: crypto.randomUUID(),
              } as typeof user,
            };
          },
          // PC-03: use withUserContext (Plan 02 Task 2) — raw pool.connect() is forbidden here (CI gate)
          // PC-09: best-effort write; user row commits before this hook fires. A reconciliation
          // worker (Phase 6) detects users with no user_keys row and back-fills.
          after: async (user) => {
            // email_hash seed via the shared helper (same path update.after uses).
            await recomputeEmailHash(
              opts.keyStore,
              UserId(user.id as string),
              user.email as string,
            ).catch((e) =>
              console.error(
                "[identity] email_hash seed failed for user",
                user.id,
                e,
              ),
            );
            const wrapped = await opts.keyStore.generateUserDek(
              user.id as never,
            );
            const r = await withUserContext(
              UserId(user.id as string),
              async (tx) => {
                await tx.execute(sql`
                  INSERT INTO shared_kernel.user_keys (user_id, cipher_dek, nonce)
                  VALUES (${user.id}, ${Buffer.from(wrapped.cipherDek)}, ${Buffer.from(wrapped.nonce)})
                  ON CONFLICT (user_id) DO NOTHING
                `);
                // ONBD-01: Seed onboarding_progress row so the Task-2 layout guard
                // fires on the user's first authenticated request and redirects them
                // to /budgets/new. Idempotent — a re-fired hook never overwrites progress.
                await tx.execute(sql`
                  INSERT INTO tenancy.onboarding_progress (user_id, step, completed_at)
                  VALUES (${user.id}::uuid, 1, NULL)
                  ON CONFLICT (user_id) DO NOTHING
                `);
              },
            );
            if (r.isErr()) {
              // Log but do NOT throw — signup must never fail because of this hook.
              console.error(
                "[identity] post-create setup failed for user",
                user.id,
                r.error,
              );
            }
          },
        },
        update: {
          // USET-04: keep email_hash in sync after any user update. Better Auth
          // fires update.after for any field change; recomputing from the current
          // email is cheap + idempotent (a RAW SQL UPDATE, so it does NOT
          // re-trigger this hook). The changeEmail-confirm path is the one that
          // actually moves the email — without this the hash would stale and break
          // the users_email_hash_uq uniqueness + lookups.
          after: async (user: { id: string; email: string }) => {
            await recomputeEmailHash(
              opts.keyStore,
              UserId(user.id),
              user.email,
            ).catch((e) =>
              console.error(
                "[identity] email_hash recompute failed for user",
                user.id,
                e,
              ),
            );
          },
        },
      },
    },
    plugins: opts.additionalPlugins ?? [],
    rateLimit: {
      // Disabled ONLY when AUTH_RATE_LIMIT_DISABLED=true (set in the CI e2e
      // compose env — see .github/workflows/ci.yml). The Playwright suite creates
      // a fresh verified user PER SCENARIO across all six viewport projects, so it
      // fires hundreds of sign-up/sign-in calls from the single web-container IP.
      // The global 100/60s bucket throttles those into a multi-hour run (the
      // fixture retries through the 429s, so it still passes — just absurdly slow).
      // The limiter is a production anti-brute-force control and stays ON in
      // dev/prod (flag unset → enabled).
      enabled: process.env["AUTH_RATE_LIMIT_DISABLED"] !== "true",
      // 260619 SPURIOUS-LOGOUT ROOT CAUSE: the web (app) layout validates the
      // session on EVERY navigation via a server-side `fetch` to
      // /auth/get-session. Better Auth treats that as a client-initiated request
      // and rate-limits it by IP — but ALL server-side calls share the web
      // container's single IP, so the global 100/60s bucket was exhausted under
      // normal browsing (160 `get-session: 429` in 10 min observed) → the layout
      // read null → bounced the user to /sign-in mid-session ("randomly logged
      // out"). get-session only validates an EXISTING session cookie (no
      // credential guessing), so it is not a brute-force vector — exempt it.
      // Sensitive endpoints (sign-in/up, reset-password) keep the global limit.
      customRules: {
        "/get-session": false,
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
