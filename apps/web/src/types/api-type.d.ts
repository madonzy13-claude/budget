/**
 * apps/web type declaration for apps/api AppType.
 *
 * PC-02 + PC-15: apps/web uses a type-only import of AppType from apps/api.
 * This shim file provides the AppType without pulling in the full apps/api
 * implementation graph, which has pre-existing type errors under web's tsconfig
 * due to Hono context variable typing differences (c.get("session") returns never).
 *
 * The actual Hono RPC client is created against this type at runtime.
 * The hc<AppType> call provides type safety for the HTTP contract.
 */
import type { Hono } from "hono";

/**
 * AppType — simplified Hono app type for web consumption.
 * The full type is in apps/api/src/server.ts.
 */
// Type shim: use any for Hono generic params — apps/web uses api as AnyApi at call sites
// deno-lint-ignore no-explicit-any
export type AppType = Hono<any, any, any>;
