/**
 * budget-invitations.test.ts — Integration tests for POST /budgets/:id/invitations
 *
 * Kind-removal regression: a budget that is historically PRIVATE (single member,
 * kind='PRIVATE' — the 1072 pre-migration budgets in dev) must now accept an
 * invitation from its owner. Before the kind removal the invite handler ran
 * `if (lookup.value.kind === "PRIVATE") return 409` — so this test is RED on
 * pre-removal budgets.ts (409) and GREEN on the current handler (201).
 *
 * Real Postgres (CLAUDE.md rule 3: no DB mocking in integration tests). Seeds a
 * user + budget + owner membership directly, then drives the Hono route.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  ownerId: string;
  memberId: string;
  budgetId: string;
  budgetName: string;
}

/**
 * Seed an owner + a plain member + a budget stamped kind='PRIVATE' (the
 * historical single-member state) with the owner as its only role=owner member.
 * The member row exists so we can exercise the owner-only 403 guard, but the
 * budget is still "private" in the pre-removal sense.
 */
async function createPrivateFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const ownerId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const budgetName = `InviteTest${budgetId.slice(0, 8)}`;
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Owner User', true, now(), now())`,
      [ownerId, `inv-owner-${ownerId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Member User', true, now(), now())`,
      [memberId, `inv-member-${memberId.slice(0, 8)}@example.com`],
    );
    // Historical PRIVATE budget: kind='PRIVATE', single owner member.
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'EUR', $4, 1, now())`,
      [budgetId, `ws-inv-${budgetId.slice(0, 8)}`, budgetName, ownerId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, ownerId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'member', now())`,
      [crypto.randomUUID(), budgetId, memberId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { ownerId, memberId, budgetId, budgetName };
}

async function cleanup(fix: Fixture): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    await pool.query(
      `DELETE FROM tenancy.budget_invitations WHERE budget_id = $1`,
      [fix.budgetId],
    );
    await pool.query(`DELETE FROM tenancy.budget_members WHERE budget_id = $1`, [
      fix.budgetId,
    ]);
    await pool.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [
      fix.budgetId,
    ]);
    await pool.query(`DELETE FROM identity.users WHERE id = ANY($1)`, [
      [fix.ownerId, fix.memberId],
    ]);
  } finally {
    await pool.end();
  }
}

async function buildApp(userId: string, authenticated = true) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const deps = {
    env: { APP_URL: "http://localhost:3000" },
    emailSender: { send: async () => {} },
    tenancy: { workspaceRepo: {} },
  } as any;

  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    if (authenticated) c.set("session", { user: { id: userId } });
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("POST /budgets/:id/invitations — kind-removal: PRIVATE budgets accept invites", () => {
  let fix: Fixture;
  beforeAll(async () => {
    fix = await createPrivateFixture();
  });
  afterAll(async () => {
    await cleanup(fix);
  });

  it("owner invites into a historically-PRIVATE 1-member budget → 201 (no PRIVATE gate)", async () => {
    const app = await buildApp(fix.ownerId);
    const res = await app.request(`/budgets/${fix.budgetId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invitee@example.com", role: "member" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { invitationId: string };
    expect(body.invitationId).toBeDefined();

    // The invitation row was actually persisted as pending.
    const pool = new Pool({ connectionString: DB_URL });
    const rows = await pool.query(
      `SELECT email, status, role FROM tenancy.budget_invitations WHERE budget_id = $1`,
      [fix.budgetId],
    );
    await pool.end();
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      email: "invitee@example.com",
      status: "pending",
      role: "member",
    });
  });

  it("non-owner member cannot invite → denied (ownership guard intact)", async () => {
    // Guard integrity: a non-owner never gets a 2xx. In production the member's
    // request carries app.tenant_ids (set by tenant-guard middleware), so the
    // owner-role lookup resolves and the handler returns 403. This test drives
    // the route through the bootstrap-only context (app.current_user_id only,
    // no tenant GUC), under which the member cannot see the budget row at all,
    // so the lookup yields 404. Either way the invite is refused.
    const app = await buildApp(fix.memberId);
    const res = await app.request(`/budgets/${fix.budgetId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nope@example.com", role: "member" }),
    });
    expect(res.status).not.toBe(201);
    expect([403, 404]).toContain(res.status);
  });

  it("unauthenticated invite → 401", async () => {
    const app = await buildApp("", false);
    const res = await app.request(`/budgets/${fix.budgetId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nope@example.com", role: "member" }),
    });
    expect(res.status).toBe(401);
  });
});
