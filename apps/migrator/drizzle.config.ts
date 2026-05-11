import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_MIGRATOR;
if (!url) throw new Error("DATABASE_URL_MIGRATOR required");

export default defineConfig({
  dialect: "postgresql",
  out: "../../drizzle",
  // v1.1 (Phase 1, plan 01-01): accounts-schema.ts → wallets-schema.ts,
  // workspace-budget-mode-history-schema.ts → budget-mode-history-schema.ts,
  // tasks-schema.ts added (NEW).
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
    "../../packages/budgeting/src/adapters/persistence/wallets-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/categories-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/category-limits-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/budget-templates-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/category-share-overrides-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/budget-mode-history-schema.ts",
    "../../packages/platform/src/idempotency/schema.ts",
    "../../packages/budgeting/src/adapters/persistence/spending-projection-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts",
    "../../packages/budgeting/src/adapters/persistence/tasks-schema.ts",
  ],
  dbCredentials: { url },
  casing: "snake_case",
});
