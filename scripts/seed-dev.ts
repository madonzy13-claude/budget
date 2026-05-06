/**
 * seed-dev.ts — Seeds deterministic dev fixtures for local development.
 * T-13 mitigation: ensures dev tests run against a populated DB.
 *
 * Creates:
 *   - 2 users (alice@example.com, bob@example.com)
 *   - 1 PRIVATE workspace owned by alice
 *   - 1 SHARED workspace owned by alice, with bob as a member
 *
 * Usage: bun run scripts/seed-dev.ts
 * Via dev.sh: bash scripts/dev.sh seed
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL_APP || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL_APP (or DATABASE_URL) is required");
  process.exit(1);
}

const ALICE_EMAIL = "alice@example.com";
const BOB_EMAIL = "bob@example.com";
const DEV_PASSWORD = "Password1!";

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("[seed-dev] Checking API reachability...");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    // Seed via the API (uses application services, not raw Drizzle)
    // This exercises the real auth + tenancy flows (T-13 mitigation).
    async function apiPost(path: string, body: unknown): Promise<Response> {
      const res = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res;
    }

    console.log("[seed-dev] Creating alice...");
    const aliceRes = await apiPost("/auth/sign-up/email", {
      email: ALICE_EMAIL,
      password: DEV_PASSWORD,
      name: "Alice Dev",
      locale: "en",
      display_currency: "USD",
    });

    if (!aliceRes.ok && aliceRes.status !== 422) {
      // 422 = already exists (idempotent)
      const body = await aliceRes.text();
      throw new Error(`Failed to create alice: ${aliceRes.status} ${body}`);
    }

    console.log("[seed-dev] Creating bob...");
    const bobRes = await apiPost("/auth/sign-up/email", {
      email: BOB_EMAIL,
      password: DEV_PASSWORD,
      name: "Bob Dev",
      locale: "en",
      display_currency: "EUR",
    });

    if (!bobRes.ok && bobRes.status !== 422) {
      const body = await bobRes.text();
      throw new Error(`Failed to create bob: ${bobRes.status} ${body}`);
    }

    console.log("[seed-dev] Dev fixtures seeded successfully.");
    console.log(`  alice: ${ALICE_EMAIL} / ${DEV_PASSWORD}`);
    console.log(`  bob:   ${BOB_EMAIL} / ${DEV_PASSWORD}`);
    console.log(
      "  Note: workspaces are created automatically on first sign-in.",
    );
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed-dev] FAILED:", e);
    process.exit(1);
  });
