/**
 * demo-suppression.test.ts — nothing the demo does may reach a real person.
 *
 * The demo is a shared login handed to strangers. Every outbound path
 * (email via the outbox, push via subscriptions) must be inert for demo
 * tenants, and untouched for everyone else.
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";

const DEMO_TENANT = "eeeeeeee-0000-4000-8000-000000000001";
const REAL_TENANT = "ffffffff-0000-4000-8000-000000000002";
const USER = "eeeeeeee-0000-4000-8000-0000000000aa";

let pool: Pool;
/** The outbox is worker territory: app_role has INSERT and nothing else. */
let workerPoolConn: Pool;

function setDemoEnv(on: boolean) {
  if (on) {
    process.env.DEMO_SOURCE_TENANT_IDS = "src";
    process.env.DEMO_TENANT_IDS = DEMO_TENANT;
    process.env.DEMO_USER_ID = USER;
  } else {
    delete process.env.DEMO_SOURCE_TENANT_IDS;
    delete process.env.DEMO_TENANT_IDS;
    delete process.env.DEMO_USER_ID;
  }
}

beforeAll(async () => {
  const { urlApp, urlWorker } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  workerPoolConn = new Pool({ connectionString: urlWorker });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${DEMO_TENANT},${REAL_TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      USER,
    ]);
    let i = 0;
    for (const id of [DEMO_TENANT, REAL_TENANT]) {
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, $2, 'b', 'PLN', $3, now()) ON CONFLICT (id) DO NOTHING`,
        [id, `supp-${i++}`, USER],
      );
      await c.query(
        `INSERT INTO shared_kernel.push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'https://push.example/' || $3::text, 'k', 'a', now())`,
        [id, USER, id],
      );
    }
  } finally {
    c.release();
  }
}, 180_000);

afterEach(() => setDemoEnv(false));

afterAll(async () => {
  await pool?.end();
  await workerPoolConn?.end();
});

describe("push suppression", () => {
  test("a demo tenant has no deliverable subscriptions", async () => {
    setDemoEnv(true);
    const { getSubscriptionsForBudget } = await import("../src/push/push-repo");
    const subs = await getSubscriptionsForBudget(
      DEMO_TENANT,
      DEMO_TENANT,
      "TASK_CREATED" as never,
      USER,
    );
    expect(subs).toEqual([]);
  });

  test("a real tenant's subscriptions are untouched", async () => {
    // The half that matters for production: suppression must not leak into
    // ordinary budgets.
    setDemoEnv(true);
    const { getSubscriptionsForBudget } = await import("../src/push/push-repo");
    const subs = await getSubscriptionsForBudget(
      REAL_TENANT,
      REAL_TENANT,
      "TASK_CREATED" as never,
      USER,
    );
    expect(subs.length).toBeGreaterThan(0);
  });

  test("with the demo unconfigured, nothing is suppressed at all", async () => {
    setDemoEnv(false);
    const { getSubscriptionsForBudget } = await import("../src/push/push-repo");
    const subs = await getSubscriptionsForBudget(
      DEMO_TENANT,
      DEMO_TENANT,
      "TASK_CREATED" as never,
      USER,
    );
    expect(subs.length).toBeGreaterThan(0);
  });
});

describe("outbox suppression", () => {
  test("demo events are retired without dispatching, real ones still go", async () => {
    setDemoEnv(true);
    const c = await pool.connect();
    try {
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${DEMO_TENANT},${REAL_TENANT}}`,
      ]);
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        USER,
      ]);
      for (const t of [DEMO_TENANT, REAL_TENANT]) {
        await c.query(
          `INSERT INTO shared_kernel.outbox
             (id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb, created_at)
           VALUES (gen_random_uuid(), $1, 'x', 'y', 'demo.suppression.probe', '{}'::jsonb, now())`,
          [t],
        );
      }
    } finally {
      c.release();
    }

    const { dispatchOutboxBatch } = await import("../src/outbox/dispatcher");
    await dispatchOutboxBatch();

    // Retired, not left pending: a skipped row would be re-selected every tick
    // forever and the queue would never drain.
    const { rows } = await workerPoolConn.query(
      `SELECT tenant_id, dispatched_at IS NOT NULL AS done
         FROM shared_kernel.outbox
        WHERE event_type = 'demo.suppression.probe'`,
    );
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.done).toBe(true);
  });
});
