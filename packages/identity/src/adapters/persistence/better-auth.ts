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
        preferredLlmProvider: {
          type: "string",
          input: true,
          required: false,
        },
        preferredSttProvider: {
          type: "string",
          input: true,
          required: false,
        },
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
            const [hash, wrapped] = await Promise.all([
              opts.keyStore.emailHash(user.email as string),
              opts.keyStore.generateUserDek(user.id as never),
            ]);
            const r = await withUserContext(
              UserId(user.id as string),
              async (tx) => {
                await tx.execute(sql`
                  UPDATE identity.users SET email_hash = ${Buffer.from(hash)} WHERE id = ${user.id}::uuid
                `);
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
      },
    },
    plugins: opts.additionalPlugins ?? [],
    rateLimit: {
      enabled: true,
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
