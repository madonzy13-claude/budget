/**
 * onboarding-progress-schema.ts — Drizzle schema for tenancy.onboarding_progress (NEW, Phase 6)
 * D-06 / ONBD-07: tracks 5-step wizard progress, one row per user.
 * USER-SCOPED (keyed by user_id, NOT tenant_id) — RLS predicate uses app.current_user_id.
 * No domain imports — adapters only.
 */
import { sql } from "drizzle-orm";
import { pgPolicy, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";

export const onboardingProgress = tenancy.table(
  "onboarding_progress",
  {
    userId: uuid("user_id").primaryKey(),
    step: integer("step").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    pgPolicy("onboarding_progress_owner_only", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);
