import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

/**
 * oauth-provider.ts — Better Auth as the OAuth 2.1 authorization server for
 * MCP clients (Phase 15). Any client may register (D-05); consent covers all
 * the user's budgets, so there is no consentReferenceId (D-01).
 */
export const MCP_SCOPES = ["read", "write"] as const;

/**
 * The provider only issues a refresh token when the client registered the
 * `refresh_token` grant AND `offline_access` is in scope. MCP clients often
 * send neither — without this a connection would die with its first access
 * token. D-06: the connection lives until the user disconnects.
 */
const ensureOfflineAccess: BetterAuthPlugin = {
  id: "mcp-ensure-offline-access",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/oauth2/register",
        handler: createAuthMiddleware(async (ctx) => {
          const body = (ctx.body ?? {}) as { grant_types?: string[] };
          const grants = body.grant_types ?? ["authorization_code"];
          if (grants.includes("refresh_token")) return;
          return {
            context: {
              body: { ...body, grant_types: [...grants, "refresh_token"] },
            },
          };
        }),
      },
      {
        matcher: (ctx) => ctx.path === "/oauth2/authorize",
        handler: createAuthMiddleware(async (ctx) => {
          const scope = String(ctx.query?.scope ?? "read");
          if (scope.split(" ").includes("offline_access")) return;
          return {
            context: {
              query: { ...ctx.query, scope: `${scope} offline_access` },
            },
          };
        }),
      },
    ],
  },
};

export function mcpOAuthPlugins({ baseUrl }: { baseUrl: string }) {
  return [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      scopes: ["read", "write", "offline_access"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: ["read", "offline_access"],
      clientRegistrationAllowedScopes: ["read", "write", "offline_access"],
      clientRegistrationRequirePKCE: true,
      // Plugin rules: "web" clients https-only; "native" (inferred from a
      // loopback or custom-scheme redirect) per RFC 8252.
      clientRegistrationDefaultApplicationType: "infer",
      resources: [`${baseUrl}/mcp`],
      clientRegistrationDefaultResources: [`${baseUrl}/mcp`],
      accessTokenExpiresIn: 600,
      refreshTokenExpiresIn: 60 * 60 * 24 * 365 * 10,
      rateLimit: {
        register: { window: 60, max: 10 },
        token: { window: 60, max: 120 },
      },
    }),
    ensureOfflineAccess,
  ];
}
