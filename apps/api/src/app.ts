/**
 * app.ts — composes the Hono application with middleware stack and routes.
 *
 * Middleware order:
 * 1. errorMiddleware (catches all thrown errors)
 * 2. /auth/* (Better Auth handler — no auth middleware needed for auth routes)
 * 3. authMiddleware (resolves session for all other routes)
 * 4. tenantGuard (resolves active_workspace_ids → tenantIds, sets GUC)
 * 5. i18nMiddleware (resolves locale from session)
 * 6. /workspaces/*, /settings/*, /fx/* routes
 * 7. /health (lightweight liveness probe)
 */
import { Hono } from "hono";
import { errorMiddleware } from "./middleware/error";
import { authMiddleware } from "./middleware/auth";
import { tenantGuard } from "./middleware/tenant-guard";
import { i18nMiddleware } from "./middleware/i18n";
import { authRoutes } from "./routes/auth";
import { workspacesRoutesFactory } from "./routes/workspaces";
import { settingsRoutesFactory } from "./routes/settings";
import { createFxRoute } from "./routes/fx";
import { createAccountsRoute } from "./routes/accounts";
import { createIdempotencyMiddleware } from "./middleware/idempotency";
import type { BootedDeps } from "./boot";

export function createApp(deps: BootedDeps) {
  const app = new Hono();

  // 1. Error handler — wraps everything
  app.use(errorMiddleware);

  // 2. Better Auth handler (no session resolution needed for /auth/* itself)
  app.route("/auth", authRoutes(deps));

  // 3-5. Auth → tenant-guard → i18n pipeline for all other routes
  app.use(authMiddleware(deps));
  app.use(tenantGuard);
  app.use(createIdempotencyMiddleware()); // Pitfall 2: AFTER tenantGuard, BEFORE routes
  app.use(i18nMiddleware);

  // 6. Domain routes
  app.route("/workspaces", workspacesRoutesFactory(deps));
  app.route("/settings", settingsRoutesFactory(deps));
  app.route("/fx", createFxRoute(deps));
  app.route("/accounts", createAccountsRoute(deps));

  // 7. Health probe
  app.get("/health", (c) => c.json({ ok: true, region: deps.env.REGION }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
