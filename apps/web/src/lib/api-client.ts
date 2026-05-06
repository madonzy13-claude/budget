import { hc } from "hono/client";
// PC-02 + PC-15: type-only import — AppType is apps/api's public RPC contract.
// apps/web only imports this type for compile-time type safety.
// No runtime code from apps/api is bundled here.
// Do NOT import from @budget/*/src/{adapters,domain,application,ports} or /dist/ paths.
// Import via local shim type to prevent cascading api type errors (see src/types/api-type.d.ts).
import type { AppType } from "@/types/api-type";

type AnyApi = any;

export const api: AnyApi = hc<AppType>(
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001",
  {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        credentials: "include",
      }),
  },
);

export type { AppType };
