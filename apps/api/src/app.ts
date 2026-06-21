/**
 * app.ts — composes the Hono application with middleware stack and routes.
 *
 * Middleware order:
 * 1. errorMiddleware (catches all thrown errors)
 * 2. /auth/* (Better Auth handler — public)
 * 3. authMiddleware (resolves session into context for everything else)
 * 4. tenantGuard (resolves active_workspace_ids → tenantIds)
 * 5. requireAuth → 401 if session missing (mounted per-route below)
 * 6. requireWorkspace → 403 if no active budget (mounted on budget-scoped routes only)
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
import { budgetsRoutesFactory } from "./routes/budgets";
import { settingsRoutesFactory } from "./routes/settings";
import { createFxRoute } from "./routes/fx";
import { createWalletsRoute } from "./routes/wallets";
import { createCategoriesRoute } from "./routes/categories";
import { createCategoryLimitsRoute } from "./routes/category-limits";
import { createBudgetTemplatesRoute } from "./routes/budget-templates";
import { createShareOverridesRoute } from "./routes/share-overrides";
import { createBudgetSettingsRoute } from "./routes/budget-settings";
import { createTransactionsRoute } from "./routes/transactions";
import { createCurrenciesRoute } from "./routes/currencies";
import { createRecurringRulesRoute } from "./routes/recurring-rules";
import { createTasksRoute } from "./routes/tasks";
import { createInvestmentsRoute } from "./routes/investments";
import { createPushRoute } from "./routes/push";
import { createIdempotencyMiddleware } from "./middleware/idempotency";
import { createShareJoinRoute } from "./routes/share-join";
import { createSpendingsSummaryRoute } from "./routes/spendings-summary";
import { budgetMembersRoutesFactory } from "./routes/budget-members";
import { budgetArchiveRoutesFactory } from "./routes/budget-archive";
import { onboardingRoutesFactory } from "./routes/onboarding";
import { createTestClockRoute } from "./routes/test-clock";
import { testClockEnabled } from "@budget/shared-kernel";
import type { BootedDeps } from "./boot";

export function createApp(deps: BootedDeps) {
  const app = new Hono();

  // 1. Error handler — wraps everything
  app.use(errorMiddleware);

  // 2. Health probe — public, no session resolution needed
  app.get("/health", (c) => c.json({ ok: true, region: deps.env.REGION }));

  // Gated test clock — mounted ONLY in a non-prod process explicitly opted in via
  // ALLOW_TEST_CLOCK=1. In production this branch is dead → the route 404s and the
  // server clock is always real. Used by the E2E reserve golden walk (May→June).
  if (testClockEnabled()) {
    app.route("/test/clock", createTestClockRoute());
    deps.logger.warn(
      "TEST CLOCK ENABLED — /test/clock mounted; serverNow() can be overridden (non-prod only)",
    );
  }

  // 3. Better Auth handler — public
  app.route("/auth", authRoutes(deps));

  // 4-5. Session resolution + tenant resolution for everything below
  app.use(authMiddleware(deps));
  app.use(tenantGuard);
  app.use(createIdempotencyMiddleware()); // Pitfall 2: AFTER tenantGuard, BEFORE routes
  app.use(i18nMiddleware);

  // 6a-onboarding: /onboarding routes — auth-required, user-scoped progress (ONBD-07)
  app.use("/onboarding/*", requireAuth);
  app.route("/onboarding", onboardingRoutesFactory(deps));

  // 6a-share: /budgets/join routes registered BEFORE the broad requireAuth fence.
  //     GET /budgets/join/:token is PUBLIC (no auth — recipient may not have account).
  //     POST /budgets/join/:token/accept requires auth, checked inline in the handler.
  //     Hono evaluates middleware in registration order — registering BEFORE requireAuth
  //     on /budgets/* ensures the public GET sub-route bypasses the fence.
  app.route("/budgets/join", createShareJoinRoute(deps));

  // 6a. Auth-only routes (signed-in, but no active budget required)
  //     /budgets  — caller may be creating their first budget
  //     /currencies — supported-currency catalogue (signed-in users only)
  //     /settings   — per-user settings independent of budget
  app.use("/budgets/*", requireAuth);
  app.use("/currencies/*", requireAuth);
  app.use("/settings/*", requireAuth);
  app.use("/push/*", requireAuth);
  // SETT-05/07: budget members sub-router mounted BEFORE budgetsRoutesFactory
  // so /:id/members is not swallowed by the /:id param handler in budgetsRoutesFactory.
  app.route("/budgets", budgetMembersRoutesFactory(deps));
  // SETT-08 (D-09/D-10): archive/delete sub-router mounted BEFORE budgetsRoutesFactory
  // so /:id/archive and /:id/delete are matched before the generic /:id param handler.
  app.route("/budgets", budgetArchiveRoutesFactory(deps));
  app.route("/budgets", budgetsRoutesFactory(deps));
  // BDP-03: tasks sub-router mounted under /budgets/:budgetId/tasks. The
  // /budgets/* requireAuth fence above already covers this prefix; the route
  // handler itself asserts c.get("tenantIds").includes(budgetId) → 404 on
  // cross-tenant attempts. Phase 7 will extend this sub-router with POST/
  // PATCH/DELETE without reshaping the read surface.
  app.route("/budgets/:budgetId/tasks", createTasksRoute(deps));
  // Phase 9: Investments — CRUD + search + reorder + on-add fetch under the budget namespace.
  app.route("/budgets/:budgetId/investments", createInvestmentsRoute(deps));

  // Phase 4: budget-scoped routes under /budgets/:budgetId/
  // /budgets/* requireAuth fence (line 68) already covers these prefixes.
  // requireWorkspace added per sub-route via middleware below.
  app.use("/budgets/:budgetId/spendings-summary/*", requireWorkspace);
  app.use("/budgets/:budgetId/categories/*", requireWorkspace);
  app.use("/budgets/:budgetId/recurring-rules/*", requireWorkspace);
  app.use("/budgets/:budgetId/transactions/*", requireWorkspace);

  app.route(
    "/budgets/:budgetId/spendings-summary",
    createSpendingsSummaryRoute(deps),
  );
  app.route("/budgets/:budgetId/categories", createCategoriesRoute(deps));
  // UAT Defect 5: category-limits were only mounted at root /categories, not
  // under the budget-scoped path. CategorySlider POSTs to
  // /budgets/:budgetId/categories/:id/limits on create/edit.
  app.route("/budgets/:budgetId/categories", createCategoryLimitsRoute(deps));
  app.route(
    "/budgets/:budgetId/recurring-rules",
    createRecurringRulesRoute(deps),
  );
  // UAT Defect 1: transactions were only mounted at /transactions (cross-budget root),
  // not under /budgets/:budgetId/transactions. Phase 4 hooks call the nested path.
  app.route("/budgets/:budgetId/transactions", createTransactionsRoute(deps));

  app.route("/settings", settingsRoutesFactory(deps));
  app.route("/push", createPushRoute(deps));
  app.route("/currencies", createCurrenciesRoute(deps));

  // 6b. Budget-scoped routes — every handler reads tenantIds; we MUST 403
  //     when no active budget is bound, otherwise tenantId="" reaches Drizzle
  //     and bubbles a raw SQL error to the client (see UAT 02 finding T3).
  for (const path of [
    "/fx/*",
    "/wallets/*",
    "/categories/*",
    "/budget-templates/*",
    "/budget-settings/*",
    "/transactions/*",
    "/recurring-rules/*",
  ]) {
    app.use(path, requireAuth, requireWorkspace);
  }
  app.route("/fx", createFxRoute(deps));
  app.route("/wallets", createWalletsRoute(deps));
  app.route("/categories", createCategoriesRoute(deps));
  app.route("/categories", createCategoryLimitsRoute(deps));
  app.route("/categories", createShareOverridesRoute(deps));
  app.route("/budget-templates", createBudgetTemplatesRoute(deps));
  app.route("/budget-settings", createBudgetSettingsRoute(deps));
  app.route("/transactions", createTransactionsRoute(deps));
  app.route("/recurring-rules", createRecurringRulesRoute(deps));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
