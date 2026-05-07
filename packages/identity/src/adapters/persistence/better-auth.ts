// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createIdentityModule() from contracts/factory.ts (PC-02, PC-15).
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { appPool, LibsodiumKeyStore, withUserContext } from "@budget/platform";
import { loadEnv, UserId } from "@budget/shared-kernel";
import type { EmailSender } from "@budget/shared-kernel";
import { users, sessions, accounts, verifications } from "./schema";

export interface CreateAuthOptions {
  emailSender: EmailSender;
  keyStore: LibsodiumKeyStore;
  additionalPlugins?: BetterAuthOptions["plugins"];
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
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/auth",
    trustedOrigins: [
      env.APP_URL,
      ...(env.TRUSTED_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) ?? []),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // D-13 grace login
      minPasswordLength: 10,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        await opts.emailSender.send({
          to: user.email,
          template: "reset-password",
          vars: { url },
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
        });
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 86400,
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
              },
            );
            if (r.isErr()) {
              // Log but do NOT throw — Phase 6 reconciliation backstop covers the gap.
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
