/**
 * app.ts — composes the Hono application with middleware stack and routes.
 *
 * Middleware order:
 * 1. errorMiddleware (catches all thrown errors)
 * 2. /auth/* (Better Auth handler — public)
 * 3. authMiddleware (resolves session into context for everything else)
 * 4. tenantGuard (resolves active_workspace_ids → tenantIds)
 * 5. requireAuth → 401 if session missing (mounted per-route below)
 * 6. requireWorkspace → 403 if no active workspace (mounted on workspace-scoped routes only)
 * 7. i18nMiddleware (resolves locale from session)
 * 8. /health (lightweight liveness probe — public)
 */
import { Hono } from "hono";
import { errorMiddleware } from "./middleware/error";
import { authMiddleware } from "./middleware/auth";
import { tenantGuard } from "./middleware/tenant-guard";
import { i18nMiddleware } from "./middleware/i18n";
import { requireAuth } from "./middleware/require-auth";
import { requireWorkspace } from "./middleware/require-workspace";
import { authRoutes } from "./routes/auth";
import { workspacesRoutesFactory } from "./routes/workspaces";
import { settingsRoutesFactory } from "./routes/settings";
import { createFxRoute } from "./routes/fx";
import { createAccountsRoute } from "./routes/accounts";
import { createCategoriesRoute } from "./routes/categories";
import { createCategoryLimitsRoute } from "./routes/category-limits";
import { createBudgetTemplatesRoute } from "./routes/budget-templates";
import { createShareOverridesRoute } from "./routes/share-overrides";
import { createWorkspaceSettingsRoute } from "./routes/workspace-settings";
import { createTransactionsRoute } from "./routes/transactions";
import { createCurrenciesRoute } from "./routes/currencies";
import { createRecurringRulesRoute } from "./routes/recurring-rules";
import { createRecurringDraftsRoute } from "./routes/recurring-drafts";
import { createIdempotencyMiddleware } from "./middleware/idempotency";
import type { BootedDeps } from "./boot";

export function createApp(deps: BootedDeps) {
  const app = new Hono();

  // 1. Error handler — wraps everything
  app.use(errorMiddleware);

  // 2. Health probe — public, no session resolution needed
  app.get("/health", (c) => c.json({ ok: true, region: deps.env.REGION }));

  // 3. Better Auth handler — public
  app.route("/auth", authRoutes(deps));

  // 4-5. Session resolution + tenant resolution for everything below
  app.use(authMiddleware(deps));
  app.use(tenantGuard);
  app.use(createIdempotencyMiddleware()); // Pitfall 2: AFTER tenantGuard, BEFORE routes
  app.use(i18nMiddleware);

  // 6a. Auth-only routes (signed-in, but no active workspace required)
  //     /workspaces — caller may be creating their first workspace
  //     /currencies — supported-currency catalogue (signed-in users only)
  //     /settings   — per-user settings independent of workspace
  app.use("/workspaces/*", requireAuth);
  app.use("/currencies/*", requireAuth);
  app.use("/settings/*", requireAuth);
  app.route("/workspaces", workspacesRoutesFactory(deps));
  app.route("/settings", settingsRoutesFactory(deps));
  app.route("/currencies", createCurrenciesRoute(deps));

  // 6b. Workspace-scoped routes — every handler reads tenantIds; we MUST 403
  //     when no active workspace is bound, otherwise tenantId="" reaches Drizzle
  //     and bubbles a raw SQL error to the client (see UAT 02 finding T3).
  for (const path of [
    "/fx/*",
    "/accounts/*",
    "/categories/*",
    "/budget-templates/*",
    "/workspace-settings/*",
    "/transactions/*",
    "/recurring-rules/*",
    "/recurring-drafts/*",
  ]) {
    app.use(path, requireAuth, requireWorkspace);
  }
  app.route("/fx", createFxRoute(deps));
  app.route("/accounts", createAccountsRoute(deps));
  app.route("/categories", createCategoriesRoute(deps));
  app.route("/categories", createCategoryLimitsRoute(deps));
  app.route("/categories", createShareOverridesRoute(deps));
  app.route("/budget-templates", createBudgetTemplatesRoute(deps));
  app.route("/workspace-settings", createWorkspaceSettingsRoute(deps));
  app.route("/transactions", createTransactionsRoute(deps));
  app.route("/recurring-rules", createRecurringRulesRoute(deps));
  app.route("/recurring-drafts", createRecurringDraftsRoute(deps));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
