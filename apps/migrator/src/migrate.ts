import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const connectionString = process.env.DATABASE_URL_MIGRATOR;
  if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR required");

  const pool = new Pool({
    connectionString,
    application_name: "budget-migrator",
  });
  const db = drizzle(pool);

  console.log("[migrator] acquiring advisory lock...");
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('budget-migrations'))`);
  console.log("[migrator] lock acquired");

  try {
    console.log("[migrator] running drizzle migrations...");
    await migrate(db, {
      migrationsFolder: resolve(import.meta.dir, "../../../drizzle"),
    });
    console.log(
      "[migrator] applying post-migration.sql (Pitfall 6 — FORCE RLS, REVOKE, NOBYPASSRLS)",
    );
    const post = readFileSync(
      resolve(import.meta.dir, "../post-migration.sql"),
      "utf8",
    );
    // Run as one transaction — fail fast if any statement errors
    await db.execute(sql.raw(post));
    console.log("[migrator] complete");
  } finally {
    await db.execute(
      sql`SELECT pg_advisory_unlock(hashtext('budget-migrations'))`,
    );
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[migrator] FAILED", e);
    process.exit(1);
  });
