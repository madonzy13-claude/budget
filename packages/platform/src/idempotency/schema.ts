import { sql } from "drizzle-orm";
import {
  char,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";
import { appRole, workerRole } from "../db/roles";

export const idempotencyKeys = sharedKernel.table(
  "idempotency_keys",
  {
    scopeHash: char("scope_hash", { length: 64 }).primaryKey(),
    bodyHash: char("body_hash", { length: 64 }).notNull(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    route: text("route").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBodyJsonb: jsonb("response_body_jsonb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Policy 1: tenant-scoped lookup/insert during request handling
    // Combines with OR for worker_role (which also holds Policy 2)
    pgPolicy("idempotency_keys_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
    // Policy 2: tenant-agnostic DELETE for the hourly cleanup job (worker_role only, expired rows only).
    // RLS combines permissive policies with OR — worker holds both, but the cleanup job runs
    // without GUC so only this policy admits it. Worker can ONLY DELETE expired rows;
    // cannot SELECT/UPDATE/INSERT cross-tenant via this policy.
    pgPolicy("idempotency_keys_cleanup", {
      as: "permissive",
      for: "delete",
      to: [workerRole],
      using: sql`${t.expiresAt} < now()`,
    }),
  ],
);
