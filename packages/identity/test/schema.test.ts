/**
 * Task 2 TDD RED: Schema structure tests
 */
import { test, expect } from "bun:test";
import {
  users,
  sessions,
  accounts,
  verifications,
} from "../src/adapters/persistence/schema";
import { userPreferences } from "../src/adapters/persistence/user-preferences";

test("identity.users table is declared", () => {
  expect(users).toBeDefined();
});

test("identity.sessions table is declared", () => {
  expect(sessions).toBeDefined();
});

test("identity.accounts table is declared", () => {
  expect(accounts).toBeDefined();
});

test("identity.verifications table is declared", () => {
  expect(verifications).toBeDefined();
});

test("identity.user_preferences table is declared", () => {
  expect(userPreferences).toBeDefined();
});

// 15-04: every field the OAuth-provider + JWT plugins declare must have a
// Drizzle column, or Better Auth 1.7 refuses sign-up ("Drizzle schema mismatch").
test("oauthBetterAuthSchema covers every OAuth/JWT plugin model and field", async () => {
  const { getTableColumns } = await import("drizzle-orm");
  const { oauthProvider } = await import("@better-auth/oauth-provider");
  const { jwt } = await import("better-auth/plugins");
  const { oauthBetterAuthSchema } = await import(
    "../src/adapters/persistence/oauth-schema"
  );
  const plugins = [
    jwt(),
    oauthProvider({ loginPage: "/sign-in", consentPage: "/oauth/consent" }),
  ] as unknown as Array<{
    schema: Record<string, { fields: Record<string, unknown> }>;
  }>;
  const declared = Object.assign({}, ...plugins.map((p) => p.schema));

  expect(Object.keys(oauthBetterAuthSchema).sort()).toEqual(
    Object.keys(declared).sort(),
  );
  for (const [model, def] of Object.entries(declared)) {
    const cols = getTableColumns(
      (oauthBetterAuthSchema as Record<string, never>)[model]!,
    );
    for (const field of [
      "id",
      ...Object.keys((def as { fields: object }).fields),
    ]) {
      expect(`${model}.${field}:${field in cols}`).toBe(`${model}.${field}:true`);
    }
  }
});
