/**
 * server.ts — Bun HTTP server entrypoint for apps/api.
 * Exports AppType for Hono RPC client (apps/web).
 */
import { startTracing } from "@budget/platform/otel";
import { boot } from "./boot";
import { createApp, type AppType } from "./app";

// Before boot(): boot() constructs the pg Pools, and PgInstrumentation has to be
// registered first to patch node-postgres. No-op unless OTEL_EXPORTER_OTLP_ENDPOINT
// is set, so dev and CI are untouched.
startTracing({ serviceName: "budget-api" });

const deps = await boot();
const app = createApp(deps);

export { app };
export type { AppType };

export default { fetch: app.fetch, port: 4000 };
