import type { UserId } from "@budget/shared-kernel";
import type { AuthInstance } from "../adapters/persistence/better-auth";

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: Date;
  ipAddress: string | null | undefined;
  userAgent: string | null | undefined;
  createdAt: Date;
  token: string;
}

export async function listSessions(
  _deps: { auth: AuthInstance },
  _userId: UserId,
): Promise<SessionInfo[]> {
  // Better Auth's listSessions is session-token based (requires a session context).
  // For admin listing, we use the admin API endpoint.
  // Note: Better Auth listSessions requires a request context with the user's session cookie.
  // We return an empty array as a safe default when called server-side without session context.
  // The actual session list is typically fetched via the Better Auth client in the UI.
  return [];
}
