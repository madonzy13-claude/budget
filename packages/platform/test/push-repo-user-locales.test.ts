/**
 * push-repo-user-locales.test.ts — regression for the push-handler outage where
 * getUserLocales/getUserTimezones died with `malformed array literal: "<uuid>"`.
 *
 * The drizzle `sql` template expands a JS array param inline, so
 * `WHERE id::text = ANY(${userIds})` binds a bare scalar uuid where Postgres
 * expects an array — every push dispatch failed at the locale fetch.
 */
import { test, expect, describe, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withBootstrapUserContext } from "../src/db/tx";
import { UserId } from "@budget/shared-kernel";
import { getUserLocales, getUserTimezones } from "../src/push/push-repo";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

async function seedUser(locale: string, timezone?: string): Promise<string> {
  const id = crypto.randomUUID();
  const r = await withBootstrapUserContext(UserId(id), async (tx) => {
    await tx.execute(
      sql`INSERT INTO identity.users (id, email, email_hash, name, locale, timezone)
          VALUES (${id}, ${`${id}@push-locale.test`}, ${Buffer.from(id)},
                  'Push Locale Test', ${locale}, ${timezone ?? null})`,
    );
  });
  if (r.isErr()) throw r.error;
  return id;
}

describe("Push locale resolution", () => {
  test("resolves the live locale for a single subscriber", async () => {
    const id = await seedUser("pl");
    const locales = await getUserLocales([id]);
    expect(locales[id]).toBe("pl");
  });

  test("resolves locales for multiple subscribers at once", async () => {
    const a = await seedUser("uk");
    const b = await seedUser("en");
    const locales = await getUserLocales([a, b]);
    expect(locales[a]).toBe("uk");
    expect(locales[b]).toBe("en");
  });

  test("resolves the saved timezone for a single subscriber", async () => {
    const id = await seedUser("en", "Europe/Warsaw");
    const tz = await getUserTimezones([id]);
    expect(tz[id]).toBe("Europe/Warsaw");
  });
});
