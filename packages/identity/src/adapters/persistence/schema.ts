import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  boolean,
  timestamp,
  customType,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { identity, appRole, workerRole } from "@budget/platform";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(v) {
    return Buffer.from(v);
  },
  fromDriver(v) {
    return new Uint8Array(v);
  },
});

/**
 * Better Auth manages this table; additionalFields appended:
 *   locale, display_currency, preferred_llm_provider, preferred_stt_provider
 * D-16 PII at rest: email_hash + email_encrypted + email_nonce columns.
 * Phase 1 keeps Better Auth's plain `email` text column for compatibility;
 * Phase 6 TODO: drop plain email, route lookups exclusively via email_hash.
 */
export const users = identity.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    emailHash: bytea("email_hash"),
    emailEncrypted: bytea("email_encrypted"),
    emailNonce: bytea("email_nonce"),
    emailVerified: boolean("email_verified").default(false).notNull(),
    name: text("name").notNull(),
    nameEncrypted: bytea("name_encrypted"),
    nameNonce: bytea("name_nonce"),
    image: text("image"),
    locale: text("locale").notNull().default("en"),
    displayCurrency: text("display_currency").notNull().default("USD"),
    preferredLlmProvider: text("preferred_llm_provider"),
    preferredSttProvider: text("preferred_stt_provider"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("users_email_hash_uq").on(t.emailHash),
    // Server inserts during sign-up have no GUC yet; permissive OR means true wins.
    pgPolicy("users_insert_open", {
      as: "permissive",
      for: "insert",
      to: [appRole, workerRole],
      withCheck: sql`true`,
    }),
    pgPolicy("users_self_visible", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.id} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.id} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);

export const sessions = identity.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("sessions_insert_open", {
      as: "permissive",
      for: "insert",
      to: [appRole, workerRole],
      withCheck: sql`true`,
    }),
    pgPolicy("sessions_owner_only", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);

export const accounts = identity.table(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("accounts_insert_open", {
      as: "permissive",
      for: "insert",
      to: [appRole, workerRole],
      withCheck: sql`true`,
    }),
    pgPolicy("accounts_owner_only", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);

export const verifications = identity.table(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  () => [
    // Verifications are short-lived tokens managed server-side; no user context required.
    pgPolicy("verifications_server_access", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
);
