/**
 * server.ts — Bun HTTP server entrypoint for apps/api.
 * Exports AppType for Hono RPC client (apps/web).
 */
import { boot } from "./boot";
import { createApp, type AppType } from "./app";

const deps = await boot();
const app = createApp(deps);

export { app };
export type { AppType };

export default { fetch: app.fetch, port: 4000 };
