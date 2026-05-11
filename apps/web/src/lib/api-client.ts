import { hc } from "hono/client";
// PC-02 + PC-15: type-only import — AppType is apps/api's public RPC contract.
// apps/web only imports this type for compile-time type safety.
// No runtime code from apps/api is bundled here.
// Do NOT import from @budget/*/src/{adapters,domain,application,ports} or /dist/ paths.
// Import via local shim type to prevent cascading api type errors (see src/types/api-type.d.ts).
import type { AppType } from "@/types/api-type";
import { extractWorkspaceIdFromPath } from "@/lib/workspace-fetch";

type AnyApi = any;

// Server-side: use internal Docker URL; browser: same-origin via Next.js rewrite /api/*
const _apiBase =
  typeof window !== "undefined"
    ? "/api"
    : (process.env["API_INTERNAL_URL"] ?? "http://api:4000");

export const api: AnyApi = hc<AppType>(_apiBase, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (typeof window !== "undefined") {
      const wsId = extractWorkspaceIdFromPath(window.location.pathname);
      if (wsId && !headers.has("X-Workspace-ID")) {
        headers.set("X-Workspace-ID", wsId);
      }
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });
  },
});

export type { AppType };
