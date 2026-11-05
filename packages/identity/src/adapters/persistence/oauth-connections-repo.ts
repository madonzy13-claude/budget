import { sql } from "drizzle-orm";
import { withUserContext } from "@budget/platform";
import { UserId } from "@budget/shared-kernel";

/**
 * oauth-connections-repo.ts — Settings → Connected apps (D-21) over the
 * oauth-provider tables. Token/consent tables are USER-SCOPED (RLS on
 * app.current_user_id); oauth_client has no RLS and only its name and
 * redirect hosts ever leave this file.
 */
export interface Connection {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  connectedAt: Date;
  /** Stamped on every /mcp call (touchConsent); newest refresh-token issue
   *  covers rows from before 0107. */
  lastUsedAt: Date | null;
}

function unwrap<T>(r: { isErr(): boolean; error?: unknown; value?: T }): T {
  if (r.isErr()) throw r.error;
  return r.value as T;
}

export async function listConnections(userId: string): Promise<Connection[]> {
  const r = await withUserContext(UserId(userId), (tx) =>
    tx.execute(sql`
      SELECT c.client_id AS "clientId", oc.name AS "clientName", c.scopes,
             COALESCE(c.updated_at, c.created_at) AS "connectedAt",
             GREATEST(c.last_used_at,
               (SELECT max(t.created_at) FROM identity.oauth_refresh_token t
                 WHERE t.user_id = c.user_id AND t.client_id = c.client_id)) AS "lastUsedAt"
        FROM identity.oauth_consent c
        LEFT JOIN identity.oauth_client oc ON oc.client_id = c.client_id
       WHERE c.user_id = ${userId}::uuid
       ORDER BY "connectedAt" DESC
    `),
  );
  return unwrap(r).rows as unknown as Connection[];
}

/** Removes every token and the consent for (user, client) in one tx. */
export async function disconnect(userId: string, clientId: string): Promise<number> {
  const r = await withUserContext(UserId(userId), async (tx) => {
    let n = 0;
    for (const table of [
      sql`identity.oauth_refresh_token`,
      sql`identity.oauth_access_token`,
      sql`identity.oauth_consent`,
    ]) {
      const d = await tx.execute(
        sql`DELETE FROM ${table} WHERE user_id = ${userId}::uuid AND client_id = ${clientId}`,
      );
      n += d.rowCount ?? 0;
    }
    return n;
  });
  return unwrap(r);
}

/** True while (user, client) still holds consent; stamps last_used_at. */
export async function touchConsent(
  userId: string,
  clientId: string,
): Promise<boolean> {
  const r = await withUserContext(UserId(userId), (tx) =>
    tx.execute(sql`
      UPDATE identity.oauth_consent SET last_used_at = now()
       WHERE user_id = ${userId}::uuid AND client_id = ${clientId}
      RETURNING 1
    `),
  );
  return unwrap(r).rows.length > 0;
}

/** Name + redirect hosts for the consent screen. Read as the signed-in user. */
export async function getClientPublicInfo(
  userId: string,
  clientId: string,
): Promise<{ clientId: string; name: string | null; redirectHosts: string[] } | null> {
  const r = await withUserContext(UserId(userId), (tx) =>
    tx.execute(sql`
      SELECT name, redirect_uris AS "redirectUris" FROM identity.oauth_client
       WHERE client_id = ${clientId} LIMIT 1
    `),
  );
  const row = unwrap(r).rows[0] as
    | { name: string | null; redirectUris: string[] }
    | undefined;
  if (!row) return null;
  const hosts = row.redirectUris.flatMap((u) => {
    try {
      return [new URL(u).hostname];
    } catch {
      return [];
    }
  });
  return { clientId, name: row.name, redirectHosts: [...new Set(hosts)] };
}
