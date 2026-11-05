import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";
import { appRole, workerRole } from "../db/roles";

/**
 * MCP persistence (Phase 15). USER-SCOPED, not tenant: undo (D-11) and the
 * daily write cap (D-25) are per connection across ALL the user's budgets (D-01).
 */
const ownUser = (userId: unknown) =>
  sql`${userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`;

/** D-08: hidden record of every MCP write — feeds agent undo + daily cap. */
export const mcpWriteLog = sharedKernel.table(
  "mcp_write_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    clientId: text("client_id").notNull(),
    callId: uuid("call_id").notNull(),
    batchId: uuid("batch_id"),
    tool: text("tool").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** 'create' | 'update' | 'delete' (CHECK in 0106). */
    op: text("op").notNull(),
    beforeJsonb: jsonb("before_jsonb"),
    afterJsonb: jsonb("after_jsonb"),
    entryCount: integer("entry_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    revertedByCallId: uuid("reverted_by_call_id"),
  },
  (t) => [
    pgPolicy("mcp_write_log_owner", {
      for: "all",
      to: [appRole, workerRole],
      using: ownUser(t.userId),
      withCheck: ownUser(t.userId),
    }),
  ],
);

/** D-15: server-checked import rows awaiting commit. */
export const mcpImportPreviews = sharedKernel.table(
  "mcp_import_previews",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    clientId: text("client_id").notNull(),
    kind: text("kind").notNull(),
    payloadHash: text("payload_hash").notNull(),
    rowsJsonb: jsonb("rows_jsonb").notNull(),
    issuesJsonb: jsonb("issues_jsonb").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    pgPolicy("mcp_import_previews_owner", {
      for: "all",
      to: [appRole, workerRole],
      using: ownUser(t.userId),
      withCheck: ownUser(t.userId),
    }),
  ],
);
