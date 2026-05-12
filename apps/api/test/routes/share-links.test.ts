/**
 * share-links.test.ts — Integration tests for share-link routes
 *
 * Tests:
 *   1. Happy path: create → resolve → accept → 2nd accept 409
 *   2. Expired link: GET returns isExpired=true, POST accept 410
 *   3. Revoked link: DELETE, GET returns isRevoked=true, POST accept 410
 *   4. Single-use exhaustion: second user accept 409
 *   5. Cross-tenant probe: token from tenant A resolves to A's budget name
 *   6. Non-owner cannot create or revoke (403)
 *   7. Token format: nanoid(32) URL-safe alphabet
 *
 * TDD: RED commit — routes do not exist yet.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

// ── Fixtures ───────────────────────────────────────────────────────────────

interface Fixture {
  ownerId: string;
  memberId: string;
  budgetId: string;
  budgetName: string;
}

async function createFixture(nameSuffix = ""): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const ownerId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const budgetName = `ShareTest${nameSuffix || budgetId.slice(0, 8)}`;

  try {
    await client.query("BEGIN");
    // Create owner user
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Owner User', true, now(), now())`,
      [ownerId, `share-owner-${ownerId.slice(0, 8)}@example.com`],
    );
    // Create member user
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Member User', true, now(), now())`,
      [memberId, `share-member-${memberId.slice(0, 8)}@example.com`],
    );
    // Create budget
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'SHARED', 'EUR', $4, 1, now())`,
      [budgetId, `ws-sh-${budgetId.slice(0, 8)}`, budgetName, ownerId],
    );
    // Add owner as member with role=owner
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, ownerId],
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

async function addMember(budgetId: string, userId: string): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'member', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Seed an already-expired share link directly bypassing the create service (which enforces ttlDays>=1). */
async function seedExpiredLink(
  budgetId: string,
  tenantId: string,
  createdBy: string,
  token: string,
): Promise<string> {
  // Use app_role with GUC set so RLS is satisfied
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Set app.tenant_ids GUC so RLS policy is satisfied
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${createdBy}', true)`);
    const r = await client.query<{ id: string }>(
      `INSERT INTO tenancy.budget_share_links
         (id, budget_id, tenant_id, token, created_by, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, now() - interval '1 day', now())
       RETURNING id`,
      [crypto.randomUUID(), budgetId, tenantId, token, createdBy],
    );
    await client.query("COMMIT");
    return r.rows[0]!.id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

// ── App Builder ─────────────────────────────────────────────────────────────

async function buildApp(
  userId: string,
  tenantId: string,
  authenticated = true,
) {
  const { createShareJoinRoute } = await import(
    "../../src/routes/share-join"
  );
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");

  // Minimal deps stub for share-link routes
  const deps = {
    env: { APP_URL: "http://localhost:3000" },
    tenancy: {
      budgetRepo: {
        findById: async (id: string) => {
          const pool = new Pool({ connectionString: DB_URL });
          const r = await pool.query<{ id: string; name: string }>(
            `SELECT id, name FROM tenancy.budgets WHERE id = $1`,
            [id],
          );
          await pool.end();
          const row = r.rows[0];
          if (!row) return null;
          return { id: row.id, name: row.name };
        },
      },
      budgetShareLinkRepo: null, // constructed inside route via adapter
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: {
        api: {
          addMember: async (opts: {
            body: { organizationId: string; userId: string; role: string };
          }) => {
            // In tests, simulate addMember by inserting budget_members row
            const pool = new Pool({ connectionString: DB_URL });
            const client = await pool.connect();
            try {
              await client.query(
                `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
                 VALUES ($1, $2, $3, $4, now())
                 ON CONFLICT DO NOTHING`,
                [
                  crypto.randomUUID(),
                  opts.body.organizationId,
                  opts.body.userId,
                  opts.body.role,
                ],
              );
            } finally {
              client.release();
              await pool.end();
            }
          },
        },
      },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
    budgeting: {
      reserveBalanceRepo: {
        getForBudget: async () => new Map(),
      },
    },
  } as any;

  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    if (authenticated) {
      c.set("session", { user: { id: userId } });
    }
    c.set("tenantIds", tenantId ? [tenantId] : []);
    await next();
  });

  // Register share-join BEFORE the requireAuth fence (public GET)
  app.route("/budgets/join", createShareJoinRoute(deps));
  app.route("/budgets", budgetsRoutesFactory(deps));

  return app;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Share-link: happy path (create → resolve → accept → 2nd accept 409)", () => {
  let fix: Fixture;
  let token: string;
  let linkId: string;

  beforeAll(async () => {
    fix = await createFixture("Happy");
  });

  it("POST /budgets/:id/share as owner returns 201 with url + expiresAt + id", async () => {
    const app = await buildApp(fix.ownerId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: 7 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.url).toMatch(/\/budgets\/join\//);
    expect(body.expiresAt).toBeDefined();
    expect(body.id).toBeDefined();
    token = body.url.split("/budgets/join/")[1];
    linkId = body.id;
  });

  it("GET /budgets/join/:token (no auth) returns 200 with budget name + state flags", async () => {
    const app = await buildApp("", "", false);
    const res = await app.request(`/budgets/join/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.budgetName).toBe(fix.budgetName);
    expect(body.isExpired).toBe(false);
    expect(body.isRevoked).toBe(false);
    expect(body.isUsed).toBe(false);
  });

  it("POST /budgets/join/:token/accept (auth: member user) returns 200 with budgetId", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/join/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.budgetId).toBe(fix.budgetId);
  });

  it("Second accept returns 409 AlreadyUsed", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/join/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error).toBe("AlreadyUsed");
  });
});

describe("Share-link: expired link", () => {
  let fix: Fixture;
  let expiredToken: string;

  beforeAll(async () => {
    fix = await createFixture("Expired");
    expiredToken = `expired-${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 32);
    await seedExpiredLink(fix.budgetId, fix.budgetId, fix.ownerId, expiredToken);
  });

  it("GET /budgets/join/:token returns isExpired=true", async () => {
    const app = await buildApp("", "", false);
    const res = await app.request(`/budgets/join/${expiredToken}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.isExpired).toBe(true);
  });

  it("POST /budgets/join/:token/accept returns 410 Expired", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/join/${expiredToken}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(410);
    const body = await res.json() as any;
    expect(body.error).toBe("Expired");
  });
});

describe("Share-link: revoked link", () => {
  let fix: Fixture;
  let token: string;
  let linkId: string;

  beforeAll(async () => {
    fix = await createFixture("Revoked");
  });

  it("POST /budgets/:id/share creates link", async () => {
    const app = await buildApp(fix.ownerId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: 7 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    token = body.url.split("/budgets/join/")[1];
    linkId = body.id;
  });

  it("DELETE /budgets/share/:linkId as owner returns 204", async () => {
    const app = await buildApp(fix.ownerId, fix.budgetId);
    const res = await app.request(`/budgets/share/${linkId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("GET /budgets/join/:token returns isRevoked=true after revoke", async () => {
    const app = await buildApp("", "", false);
    const res = await app.request(`/budgets/join/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.isRevoked).toBe(true);
  });

  it("POST /budgets/join/:token/accept returns 410 Revoked after revoke", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/join/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(410);
    const body = await res.json() as any;
    expect(body.error).toBe("Revoked");
  });
});

describe("Share-link: cross-tenant probe (T-02-08)", () => {
  let tenantA: Fixture;
  let tokenA: string;

  beforeAll(async () => {
    tenantA = await createFixture("TenantA");
  });

  it("Token from tenant A resolves to tenant A budget name (token is the credential)", async () => {
    // Create link as tenant A owner
    const app = await buildApp(tenantA.ownerId, tenantA.budgetId);
    const createRes = await app.request(
      `/budgets/${tenantA.budgetId}/share`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlDays: 7 }),
      },
    );
    expect(createRes.status).toBe(201);
    const body = await createRes.json() as any;
    tokenA = body.url.split("/budgets/join/")[1];
  });

  it("GET /budgets/join/:tokenA (no auth) returns tenant A budget name, not 404", async () => {
    // Token IS the credential — public resolve returns the budget the token belongs to
    const app = await buildApp("", "", false);
    const res = await app.request(`/budgets/join/${tokenA}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    // Must return tenant A's budget name (not some other tenant)
    expect(body.budgetName).toBe(tenantA.budgetName);
    expect(body.isExpired).toBe(false);
    expect(body.isRevoked).toBe(false);
  });
});

describe("Share-link: non-owner cannot create or revoke (403)", () => {
  let fix: Fixture;
  let linkId: string;

  beforeAll(async () => {
    fix = await createFixture("NonOwner");
    // Add memberId as a 'member' (not owner)
    await addMember(fix.budgetId, fix.memberId);
    // Owner creates a link first so we have a linkId to try revoking
    const app = await buildApp(fix.ownerId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: 7 }),
    });
    const body = await res.json() as any;
    linkId = body.id;
  });

  it("POST /budgets/:id/share as member returns 403", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: 7 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe("Forbidden");
  });

  it("DELETE /budgets/share/:linkId as member returns 403", async () => {
    const app = await buildApp(fix.memberId, fix.budgetId);
    const res = await app.request(`/budgets/share/${linkId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe("Forbidden");
  });
});

describe("Share-link: token format validation", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("TokenFmt");
  });

  it("Created token matches nanoid(32) URL-safe alphabet /^[A-Za-z0-9_-]{32}$/", async () => {
    const app = await buildApp(fix.ownerId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttlDays: 7 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    const token = body.url.split("/budgets/join/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
