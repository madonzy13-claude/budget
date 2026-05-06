import { pgRole } from "drizzle-orm/pg-core";

/**
 * D-18: roles managed in post-migration SQL (createRole: false here — roles are pre-created by infra).
 * NOBYPASSRLS enforced via ALTER ROLE in apps/migrator/post-migration.sql.
 */
export const appRole = pgRole("app_role", { createRole: false, inherit: true });
export const workerRole = pgRole("worker_role", {
  createRole: false,
  inherit: true,
});
export const migratorRole = pgRole("migrator", {
  createRole: false,
  inherit: true,
});
