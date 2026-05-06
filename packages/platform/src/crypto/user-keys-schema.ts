import { sql } from "drizzle-orm";
import { customType, pgPolicy, timestamp, uuid } from "drizzle-orm/pg-core";

import { appRole, workerRole } from "../db/roles";
import { sharedKernel } from "../db/schemas";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(v) {
    return Buffer.from(v);
  },
  fromDriver(v) {
    return new Uint8Array(v);
  },
});

/**
 * D-16: per-user DEK encrypted with KEK (from env BUDGET_KEK).
 *
 * PC-12: user_keys is USER-SCOPED, NOT tenant-scoped. The table has no tenant_id
 * column. RLS keys off `app.current_user_id` GUC (NOT `app.tenant_ids`).
 * One DEK per user crosses every workspace they belong to.
 *
 * PC-07: All writes/reads to this table MUST use the `withUserContext(userId, fn)`
 * primitive from packages/platform/src/db/tx.ts — never `withTenantTx` (wrong primitive
 * for user-scoped tables).
 *
 * Phase 1 ships the table + wrap/unwrap. Phase 6 adds destroyed_at flow + cipher_dek
 * overwrite for right-to-delete.
 * Pitfall 11: at destruction, also overwrite email_hash on identity.users to a tombstone.
 */
export const userKeys = sharedKernel.table(
  "user_keys",
  {
    userId: uuid("user_id").primaryKey(),
    cipherDek: bytea("cipher_dek").notNull(),
    nonce: bytea("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  },
  (t) => [
    pgPolicy("user_keys_owner_only", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
      withCheck: sql`${t.userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`,
    }),
  ],
);
