import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error("DATABASE_URL_MIGRATOR required");

export default defineConfig({
  dialect: "postgresql",
  out: "../../drizzle",
  // Plans 3, 5, 6 extend this to an array as more table files appear.
  schema: ["../../packages/platform/src/db/expense-ledger.ts"],
  dbCredentials: { url },
  casing: "snake_case",
});
