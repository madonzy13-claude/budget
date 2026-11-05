import { sql } from "drizzle-orm";

/**
 * mcp/repo.ts — raw-SQL repository for the MCP write log (D-08) and import
 * previews (D-15). Every function takes a tx from withUserContext: both tables
 * are USER-SCOPED, so RLS on app.current_user_id is the isolation, and the
 * explicit user_id/client_id predicates narrow to one connection.
 */
type Tx = any;

/** How far back agent undo reaches (D-11, Claude's discretion). */
export const UNDO_WINDOW_DAYS = 7;
/** How long a checked import waits for its commit (D-15). */
export const PREVIEW_TTL_MINUTES = 60;

export interface WriteLogInsert {
  tenantId: string;
  userId: string;
  clientId: string;
  callId: string;
  batchId: string | null;
  tool: string;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  before: unknown;
  after: unknown;
  entryCount: number;
  /** Tests only — defaults to now(). */
  createdAt?: Date;
}

export interface WriteLogRow {
  id: string;
  tenantId: string;
  callId: string;
  batchId: string | null;
  tool: string;
  entityType: string;
  entityId: string;
  op: "create" | "update" | "delete";
  before: unknown;
  after: unknown;
  entryCount: number;
  createdAt: Date;
  revertedAt: Date | null;
}

const ROW_COLUMNS = sql`id, tenant_id AS "tenantId", call_id AS "callId",
  batch_id AS "batchId", tool, entity_type AS "entityType",
  entity_id AS "entityId", op, before_jsonb AS "before", after_jsonb AS "after",
  entry_count AS "entryCount", created_at AS "createdAt",
  reverted_at AS "revertedAt"`;

const json = (v: unknown) =>
  v === null || v === undefined ? sql`NULL::jsonb` : sql`${JSON.stringify(v)}::jsonb`;

export async function insertWriteLog(
  tx: Tx,
  rows: WriteLogInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) => sql`(${r.tenantId}::uuid, ${r.userId}::uuid, ${r.clientId},
      ${r.callId}::uuid, ${r.batchId}::uuid, ${r.tool}, ${r.entityType},
      ${r.entityId}, ${r.op}, ${json(r.before)}, ${json(r.after)},
      ${r.entryCount}, COALESCE(${r.createdAt?.toISOString() ?? null}::timestamptz, now()))`,
  );
  await tx.execute(sql`
    INSERT INTO shared_kernel.mcp_write_log
      (tenant_id, user_id, client_id, call_id, batch_id, tool, entity_type,
       entity_id, op, before_jsonb, after_jsonb, entry_count, created_at)
    VALUES ${sql.join(values, sql`, `)}
  `);
}

/** Newest first, inside the undo window. */
export async function listRecentWrites(
  tx: Tx,
  q: { userId: string; clientId: string; limit: number },
): Promise<WriteLogRow[]> {
  const r = await tx.execute(sql`
    SELECT ${ROW_COLUMNS} FROM shared_kernel.mcp_write_log
     WHERE user_id = ${q.userId}::uuid AND client_id = ${q.clientId}
       AND created_at > now() - make_interval(days => ${UNDO_WINDOW_DAYS})
     ORDER BY created_at DESC, id DESC
     LIMIT ${q.limit}
  `);
  return r.rows as WriteLogRow[];
}

/** All rows of one tool call or one import batch. */
export async function findWritesByCallOrBatch(
  tx: Tx,
  q: { userId: string; clientId: string; id: string },
): Promise<WriteLogRow[]> {
  const r = await tx.execute(sql`
    SELECT ${ROW_COLUMNS} FROM shared_kernel.mcp_write_log
     WHERE user_id = ${q.userId}::uuid AND client_id = ${q.clientId}
       AND (call_id = ${q.id}::uuid OR batch_id = ${q.id}::uuid)
     ORDER BY created_at DESC, id DESC
  `);
  return r.rows as WriteLogRow[];
}

/** Returns how many rows flipped; already-reverted rows are left alone. */
export async function markReverted(
  tx: Tx,
  ids: string[],
  revertedByCallId: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await tx.execute(sql`
    UPDATE shared_kernel.mcp_write_log
       SET reverted_at = now(), reverted_by_call_id = ${revertedByCallId}::uuid
     WHERE id IN (${sql.join(
       ids.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
       AND reverted_at IS NULL
  `);
  return r.rowCount ?? 0;
}

/** D-25: entries written by this connection in the last 24h. */
export async function dailyEntryCount(
  tx: Tx,
  q: { userId: string; clientId: string },
): Promise<number> {
  const r = await tx.execute(sql`
    SELECT COALESCE(SUM(entry_count), 0)::int AS n
      FROM shared_kernel.mcp_write_log
     WHERE user_id = ${q.userId}::uuid AND client_id = ${q.clientId}
       AND created_at > now() - interval '24 hours'
  `);
  return (r.rows[0] as { n: number }).n;
}

export interface PreviewInsert {
  id: string;
  tenantId: string;
  userId: string;
  clientId: string;
  kind: string;
  payloadHash: string;
  rows: unknown;
  issues: unknown;
  /** Defaults to now() + PREVIEW_TTL_MINUTES. */
  expiresAt?: Date;
}

export interface PreviewRow {
  id: string;
  tenantId: string;
  kind: string;
  payloadHash: string;
  rows: unknown;
  issues: unknown;
  expiresAt: Date;
}

/** Also sweeps this user's expired previews — no cleanup job needed. */
export async function savePreview(tx: Tx, p: PreviewInsert): Promise<void> {
  await tx.execute(sql`
    DELETE FROM shared_kernel.mcp_import_previews
     WHERE user_id = ${p.userId}::uuid AND expires_at <= now()
  `);
  const expires = p.expiresAt
    ? sql`${p.expiresAt.toISOString()}::timestamptz`
    : sql`now() + make_interval(mins => ${PREVIEW_TTL_MINUTES})`;
  await tx.execute(sql`
    INSERT INTO shared_kernel.mcp_import_previews
      (id, tenant_id, user_id, client_id, kind, payload_hash, rows_jsonb,
       issues_jsonb, expires_at)
    VALUES (${p.id}::uuid, ${p.tenantId}::uuid, ${p.userId}::uuid, ${p.clientId},
      ${p.kind}, ${p.payloadHash}, ${JSON.stringify(p.rows)}::jsonb,
      ${JSON.stringify(p.issues)}::jsonb, ${expires})
  `);
}

export async function getPreview(
  tx: Tx,
  q: { id: string; userId: string; clientId: string },
): Promise<PreviewRow | null> {
  const r = await tx.execute(sql`
    SELECT id, tenant_id AS "tenantId", kind, payload_hash AS "payloadHash",
           rows_jsonb AS "rows", issues_jsonb AS "issues", expires_at AS "expiresAt"
      FROM shared_kernel.mcp_import_previews
     WHERE id = ${q.id}::uuid AND user_id = ${q.userId}::uuid
       AND client_id = ${q.clientId} AND expires_at > now()
  `);
  return (r.rows[0] as PreviewRow) ?? null;
}

export async function deletePreview(
  tx: Tx,
  q: { id: string; userId: string },
): Promise<void> {
  await tx.execute(sql`
    DELETE FROM shared_kernel.mcp_import_previews
     WHERE id = ${q.id}::uuid AND user_id = ${q.userId}::uuid
  `);
}
