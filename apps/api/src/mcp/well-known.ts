import { Hono } from "hono";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import type { BootedDeps } from "../boot";

/**
 * well-known.ts — MCP discovery (Phase 15). The AS lives under /auth, so its
 * RFC 8414 metadata and the RFC 9728 protected-resource metadata are served
 * from the root here. Both paths of each (bare + path-inserted) are answered,
 * because clients differ in which they probe.
 */
export function wellKnownRoutes(deps: BootedDeps) {
  const r = new Hono();
  const auth = deps.identity.auth as any;
  const base = deps.env.BETTER_AUTH_URL;
  const asMetadata = oauthProviderAuthServerMetadata(auth);
  const resourceClient = oauthProviderResourceClient(auth).getActions();

  const protectedResource = async () =>
    Response.json(
      await resourceClient.getProtectedResourceMetadata({
        resource: `${base}/mcp`,
        authorization_servers: [`${base}/auth`],
        scopes_supported: ["read", "write"],
        bearer_methods_supported: ["header"],
      }),
    );

  r.get("/oauth-protected-resource", protectedResource);
  r.get("/oauth-protected-resource/mcp", protectedResource);
  r.get("/oauth-authorization-server", (c) => asMetadata(c.req.raw));
  r.get("/oauth-authorization-server/auth", (c) => asMetadata(c.req.raw));
  return r;
}
