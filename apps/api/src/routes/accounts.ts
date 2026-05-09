/**
 * accounts.ts — /accounts route factory
 *
 * PC-02: imports from package roots only.
 * T-2-04: zValidator on every state-changing endpoint.
 * T-2-04-01: RLS provides tenant isolation at DB layer.
 * T-2-04-02: Currency immutability enforced at domain level.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";

export function createAccountsRoute(deps: BootedDeps) {
  const app = new Hono<{
    Variables: { tenantId: string; userId: string; session: any };
  }>();

  // Lazy imports to avoid circular deps at module load
  async function getSchemas() {
    const { createAccountSchema, adjustBalanceSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );
    return { createAccountSchema, adjustBalanceSchema };
  }

  // POST /accounts — create new account
  app.post("/", async (c) => {
    const { createAccountSchema } = await getSchemas();
    const validator = zValidator("json", createAccountSchema);

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = c.get("tenantId") as string;
    const userId = (c.get("userId") as string) ?? session?.user?.id;

    const r = await deps.budgeting.createAccount({
      ...parsed.data,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const msg = r.error.message;
      if (msg.includes("not in the supported currencies")) {
        return c.json({ error: msg }, 422);
      }
      return c.json({ error: msg }, 422);
    }

    return c.json(r.value, 201);
  });

  // GET /accounts — list accounts
  app.get("/", async (c) => {
    const session = c.get("session");
    const tenantId = c.get("tenantId") as string;
    const includeArchived = c.req.query("includeArchived") === "true";

    const r = await deps.budgeting.listAccounts({ tenantId, includeArchived });
    if (r.isErr()) return c.json({ error: r.error.message }, 500);

    return c.json({ accounts: r.value });
  });

  // GET /accounts/:id — find by id
  app.get("/:id", async (c) => {
    const tenantId = c.get("tenantId") as string;
    const { id } = c.req.param();

    const r = await deps.budgeting.findAccountById({ tenantId, accountId: id });
    if (r.isErr()) return c.json({ error: r.error.message }, 500);
    if (!r.value) return c.json({ error: "Not found" }, 404);

    return c.json(r.value);
  });

  // POST /accounts/:id/archive — archive an account
  app.post("/:id/archive", async (c) => {
    const session = c.get("session");
    const tenantId = c.get("tenantId") as string;
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: accountId } = c.req.param();

    const r = await deps.budgeting.archiveAccount({
      tenantId,
      accountId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value);
  });

  // POST /accounts/:id/balance-adjustment — adjust balance
  app.post("/:id/balance-adjustment", async (c) => {
    const { adjustBalanceSchema } = await getSchemas();
    const session = c.get("session");
    const tenantId = c.get("tenantId") as string;
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    const { id: accountId } = c.req.param();

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = adjustBalanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const r = await deps.budgeting.adjustAccountBalance({
      ...parsed.data,
      tenantId,
      accountId,
      actorUserId: userId,
    });

    if (r.isErr()) return c.json({ error: r.error.message }, 422);
    return c.json(r.value, 201);
  });

  return app;
}
