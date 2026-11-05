import type { Context } from "hono";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { verifyMcpAccessToken, hasActiveConsent } from "@budget/identity";
import { UserId } from "@budget/shared-kernel";
import type { BootedDeps } from "../boot";
import type { McpCtx } from "./tools/define";
import { buildMcpServer } from "./server";

type App = McpCtx["app"];

/**
 * handler.ts — the /mcp Streamable HTTP endpoint (Phase 15).
 *
 * Mounted before the cookie session middleware: the only credential here is
 * an OAuth bearer issued by our own AS for the /mcp resource. Tools then reach
 * data through dispatch(), i.e. through the normal auth → tenantGuard →
 * idempotency → route stack, as the token's user (D-03).
 */
export function mcpRoute(deps: BootedDeps, app: App) {
  const base = deps.env.BETTER_AUTH_URL;
  const challenge = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`;
  const unauthorized = () =>
    new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": challenge,
      },
    });

  // JSON responses only: the public host reaches the API through a Next
  // rewrite, which buffers — SSE would gain nothing (Pitfall 5).
  const mcp = createMcpHandler(
    ({ authInfo }) => {
      const extra = authInfo!.extra as Pick<McpCtx["who"], "userId" | "email" | "locale">;
      return buildMcpServer({
        who: { ...extra, clientId: authInfo!.clientId },
        scopes: authInfo!.scopes,
        deps,
        app,
      });
    },
    { responseMode: "json" },
  );

  return async (c: Context) => {
    const header = c.req.header("authorization") ?? "";
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    if (!token) return unauthorized();

    let claims: Record<string, unknown>;
    try {
      claims = await verifyMcpAccessToken(deps.identity.auth as any, token, base);
    } catch {
      return unauthorized();
    }
    const userId = typeof claims.sub === "string" ? claims.sub : null;
    const clientId = typeof claims.azp === "string" ? claims.azp : null;
    if (!userId || !clientId) return unauthorized();
    // Disconnect deletes the consent; a still-unexpired JWT must die with it.
    if (!(await hasActiveConsent(userId, clientId))) return unauthorized();
    const user = await deps.identity.userRepo.findById(UserId(userId));
    if (!user) return unauthorized();

    const authInfo: AuthInfo = {
      token,
      clientId,
      scopes: String(claims.scope ?? "").split(" ").filter(Boolean),
      extra: { userId, email: user.email, locale: user.locale },
    };
    return mcp.fetch(c.req.raw, { authInfo });
  };
}
