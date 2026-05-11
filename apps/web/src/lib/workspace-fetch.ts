/**
 * workspace-fetch.ts — CLIENT-safe helpers shared with server code.
 * Anything requiring next/headers lives in workspace-fetch.server.ts.
 */

const WORKSPACE_PATH_RE = /^\/[a-z]{2}\/workspaces\/([0-9a-fA-F-]{8,})/;

export function extractWorkspaceIdFromPath(pathname: string): string | null {
  const m = WORKSPACE_PATH_RE.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * Browser-side fetch wrapper. Reads the wsId from window.location.pathname
 * (`/[locale]/workspaces/[wsId]/...`) and attaches it to every API call as
 * the X-Workspace-ID header. Returns the raw Response.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const wsId = extractWorkspaceIdFromPath(window.location.pathname);
    if (wsId && !headers.has("X-Workspace-ID")) {
      headers.set("X-Workspace-ID", wsId);
    }
  }
  return fetch(`/api${path}`, { ...init, headers });
}
