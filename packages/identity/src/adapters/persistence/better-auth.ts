// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createIdentityModule() from contracts/factory.ts (PC-02, PC-15).
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import {
  betterAuthPool,
  LibsodiumKeyStore,
  withUserContext,
} from "@budget/platform";
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

/**
 * Tenant-scoped tables (have a `tenant_id` column) purged per solely-owned budget
 * during account deletion. Enumerated from the live DB (information_schema), NOT
 * guessed — a missed table leaves orphaned PII. `category_reserve_adjustments` is
 * deleted FIRST (FK → categories is NO ACTION) so it is omitted from this list.
 *
 * Three tenant-scoped tables are deliberately NOT listed:
 *  - tenancy.budget_share_links — ON DELETE CASCADE from budgets (auto-purged), and
 *    app_role has no DELETE grant on it anyway.
 *  - shared_kernel.audit_history + shared_kernel.outbox — app_role has no DELETE
 *    grant (audit is append-only, outbox is infra-transient). Their sensitive
 *    content is DEK-encrypted, so destroying the user's DEK below (crypto-shred)
 *    renders it undecryptable — GDPR-erased without a row delete.
 */
const TENANT_TABLES = [
  "budgeting.budget_mode_history",
  "budgeting.budget_template_items",
  "budgeting.budget_templates",
  "budgeting.categories",
  "budgeting.category_limits",
  "budgeting.category_share_overrides",
  "budgeting.expense_ledger",
  "budgeting.investments",
  "budgeting.recurring_rules",
  "budgeting.spending_by_category_month",
  "budgeting.tasks",
  "budgeting.wallets",
  "shared_kernel.idempotency_keys",
  "shared_kernel.notification_prefs",
  "shared_kernel.push_subscriptions",
] as const;

/**
 * USET-06 GDPR right-to-delete cascade. tenancy/shared_kernel have NO DB FK to
 * identity.users, so deleting a user cascades nothing — this is the application
 * cascade run from user.deleteUser.beforeDelete (so it executes only when the
 * emailed confirmation link is consumed). All work is in ONE withUserContext tx
 * so a partial cascade can't leave orphans; app role has no BYPASSRLS.
 *
 * Steps: (1) read the user's memberships via the budget_members_self policy and
 * widen app.tenant_ids to those budgets; (2) BLOCK if the user solely owns a
 * SHARED budget that still has other members (T-10-10 — no cross-member loss);
 * (3) purge each solely-owned budget + all its tenant data (T-10-09); (4) at the
 * user level, anonymise reserve adjustments the user authored in OTHER budgets
 * (created_by → NULL — keep the household's data), then drop remaining
 * memberships, sent invitations, and the DEK. Better Auth removes the user +
 * sessions + accounts AFTER this returns.
 */
export async function purgeUserData(uid: string): Promise<void> {
  const r = await withUserContext(UserId(uid), async (tx) => {
    const mem = await tx.execute(
      sql`SELECT budget_id FROM tenancy.budget_members WHERE user_id = ${uid}::uuid`,
    );
    const budgetIds = (mem.rows as Array<{ budget_id: string }>).map(
      (m) => m.budget_id,
    );
    if (budgetIds.length > 0) {
      // UUIDs from the DB — safe to inline (SET LOCAL takes no parameters).
      await tx.execute(
        sql.raw(`SET LOCAL app.tenant_ids = '{${budgetIds.join(",")}}'`),
      );
    }

    const owned = await tx.execute(
      sql`SELECT b.id, b.kind,
            (SELECT count(*) FROM tenancy.budget_members m WHERE m.budget_id = b.id) AS member_count
          FROM tenancy.budgets b
          WHERE b.owner_user_id = ${uid}::uuid`,
    );
    const ownedRows = owned.rows as Array<{
      id: string;
      kind: string;
      member_count: number | string;
    }>;

    const blocked = ownedRows.find(
      (b) => b.kind === "SHARED" && Number(b.member_count) > 1,
    );
    if (blocked) {
      throw new APIError("BAD_REQUEST", {
        message:
          "Transfer ownership or remove the other members from your shared budget before deleting your account.",
      });
    }

    for (const b of ownedRows) {
      const bid = b.id;
      // FK → categories is NO ACTION, so adjustments must go before categories.
      await tx.execute(
        sql`DELETE FROM budgeting.category_reserve_adjustments WHERE tenant_id = ${bid}::uuid`,
      );
      for (const tbl of TENANT_TABLES) {
        await tx.execute(
          sql.raw(`DELETE FROM ${tbl} WHERE tenant_id = '${bid}'`),
        );
      }
      // Membership/invitation/share rows (NO ACTION FKs to budgets) before the budget.
      await tx.execute(
        sql`DELETE FROM tenancy.shared_budget_member_shares WHERE budget_id = ${bid}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM tenancy.budget_invitations WHERE budget_id = ${bid}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM tenancy.budget_members WHERE budget_id = ${bid}::uuid`,
      );
      await tx.execute(
        sql`DELETE FROM tenancy.budgets WHERE id = ${bid}::uuid`,
      );
    }

    await tx.execute(
      sql`UPDATE budgeting.category_reserve_adjustments SET created_by = NULL WHERE created_by = ${uid}::uuid`,
    );
    await tx.execute(
      sql`DELETE FROM tenancy.budget_invitations WHERE inviter_id = ${uid}::uuid`,
    );
    await tx.execute(
      sql`DELETE FROM tenancy.budget_members WHERE user_id = ${uid}::uuid`,
    );
    // Crypto-shred the user's DEK (app_role has UPDATE, not DELETE, on user_keys —
    // the design erases by destroying key material, not row deletion). Any DEK-
    // encrypted PII left anywhere becomes undecryptable (T-10-09).
    await tx.execute(
      sql`UPDATE shared_kernel.user_keys
          SET cipher_dek = ''::bytea, nonce = ''::bytea, destroyed_at = now()
          WHERE user_id = ${uid}::uuid AND destroyed_at IS NULL`,
    );
  });
  if (r.isErr()) throw r.error;
}

export function createAuth(opts: CreateAuthOptions) {
  const env = loadEnv();
  // betterAuthPool (NOT appPool): every connection carries app.better_auth=on so
  // the accounts/sessions RLS UPDATE/DELETE bypass is scoped to Better Auth's own
  // pool — see betterAuthPool() + post-migration.sql. withUserContext (email_hash
  // recompute, DEK seed) still uses appPool independently.
  const db = drizzle(betterAuthPool(), { casing: "snake_case" });
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
        // Optional + no default: a fresh signup leaves display_currency NULL so
        // the first budget's currency can seed it (Phase 10 UAT). A null/unset
        // value reads back as "USD" at the repo boundary.
        displayCurrency: {
          type: "string",
          input: true,
          required: false,
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
      // USET-06: GDPR right-to-delete. Email-gated (checkpoint decision): the
      // request emails a confirmation link; beforeDelete runs the app-level
      // cascade (purgeUserData) only when that link is consumed, then Better Auth
      // removes the user + sessions + accounts. A beforeDelete throw (sole owner
      // of a SHARED budget with other members) aborts the whole deletion.
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({
          user,
          url,
        }: {
          user: { email: string; locale?: string };
          url: string;
        }) => {
          await opts.emailSender.send({
            to: user.email,
            template: "delete-account",
            vars: { url },
            locale: pickLocale(user.locale),
          });
        },
        beforeDelete: async (user: { id: string }) => {
          await purgeUserData(user.id);
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
          // USET-04: keep email_hash in sync after any user update (Better Auth
          // fires update.after for any field change, incl. the changeEmail-verify
          // step that writes the new plain email). Raw SQL UPDATE, so it does NOT
          // re-trigger this hook. Without it the hash would stale and break the
          // users_email_hash_uq uniqueness + lookups. We do NOT revoke sessions
          // here: Better Auth's change-email flow re-issues a session cookie for
          // the new address on the verify step (auto-login), so the user stays
          // signed in as the new email — the library's intended behaviour.
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
