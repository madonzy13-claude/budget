import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error("DATABASE_URL_MIGRATOR required");

export default defineConfig({
  dialect: "postgresql",
  out: "../../drizzle",
  // Plans 3, 5, 6 extend this to an array as more table files appear.
  schema: [
    "../../packages/platform/src/db/expense-ledger.ts",
    "../../packages/platform/src/audit/schema.ts",
    "../../packages/platform/src/outbox/schema.ts",
    "../../packages/platform/src/crypto/user-keys-schema.ts",
    "../../packages/identity/src/adapters/persistence/schema.ts",
    "../../packages/identity/src/adapters/persistence/user-preferences.ts",
    "../../packages/tenancy/src/adapters/persistence/schema.ts",
    "../../packages/tenancy/src/adapters/persistence/shares-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/fx-rates-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/accounts-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/categories-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/category-limits-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/budget-templates-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/category-share-overrides-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts",
    "../../packages/platform/src/idempotency/schema.ts",
  ],
  dbCredentials: { url },
  casing: "snake_case",
});
