/**
 * budget-template-apply.test.ts — Integration tests for budget template bulk apply.
 * TDD RED phase: written before implementation.
 * Requires real Postgres (DATABASE_URL_APP env).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

import { DrizzleBudgetTemplateRepo } from "../src/adapters/persistence/budget-template-repo";
import { DrizzleCategoryLimitRepo } from "../src/adapters/persistence/category-limit-repo";
import { DrizzleCategoryRepo } from "../src/adapters/persistence/category-repo";

const TEST_TENANT = crypto.randomUUID();
const TEST_USER = crypto.randomUUID();
let templateId: string;
let cat1Id: string;
let cat2Id: string;
let cat3Id: string;
let templateRepo: DrizzleBudgetTemplateRepo;
let limitRepo: DrizzleCategoryLimitRepo;

async function getRawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

beforeAll(async () => {
  const { db, pool } = await getRawDb();
  // Insert tenant workspace
  await db.execute(sql`
    INSERT INTO tenancy.workspaces (id, name, kind, default_currency, created_by_user_id)
    VALUES (${TEST_TENANT}::uuid, 'Template Test Workspace', 'SHARED', 'EUR', ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  // Insert 3 categories
  cat1Id = crypto.randomUUID();
  cat2Id = crypto.randomUUID();
  cat3Id = crypto.randomUUID();
  for (const [id, name] of [[cat1Id, "Housing"], [cat2Id, "Transport"], [cat3Id, "Utilities"]]) {
    await db.execute(sql`
      INSERT INTO budgeting.categories (id, tenant_id, name, scope, actor_user_id)
      VALUES (${id}::uuid, ${TEST_TENANT}::uuid, ${name}, 'SHARED', ${TEST_USER}::uuid)
      ON CONFLICT DO NOTHING
    `);
  }
  await pool.end();

  templateRepo = new DrizzleBudgetTemplateRepo();
  limitRepo = new DrizzleCategoryLimitRepo();
});

afterAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql`DELETE FROM budgeting.category_limits WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM budgeting.budget_template_items WHERE template_id IN (SELECT id FROM budgeting.budget_templates WHERE tenant_id = ${TEST_TENANT}::uuid)`);
  await db.execute(sql`DELETE FROM budgeting.budget_templates WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM tenancy.workspaces WHERE id = ${TEST_TENANT}::uuid`);
  await pool.end();
});

describe("BudgetTemplate apply use case", () => {
  test("create template with 3 items", async () => {
    const result = await templateRepo.createTemplate({
      tenantId: TEST_TENANT,
      name: "May 2026 Budget",
      actorUserId: TEST_USER,
      items: [
        { categoryId: cat1Id, normalAmount: "120000", normalCurrency: "EUR", cushionAmount: "130000", cushionCurrency: "EUR" },
        { categoryId: cat2Id, normalAmount: "50000", normalCurrency: "EUR", cushionAmount: "60000", cushionCurrency: "EUR" },
        { categoryId: cat3Id, normalAmount: "30000", normalCurrency: "EUR", cushionAmount: "35000", cushionCurrency: "EUR" },
      ],
    });
    expect(result.isOk()).toBe(true);
    templateId = result.value!.id;
    expect(result.value!.items).toHaveLength(3);
  });

  test("apply template to May 2026 — creates 3 category_limits rows with effective_from=2026-05-01", async () => {
    const result = await templateRepo.applyTemplate({
      tenantId: TEST_TENANT,
      templateId,
      targetMonth: "2026-05",
      actorUserId: TEST_USER,
    });
    expect(result.isOk()).toBe(true);

    // Verify 3 rows with effective_from = '2026-05-01'
    const { db, pool } = await getRawDb();
    const rows = await db.execute<{ category_id: string; effective_from: string }>(sql`
      SELECT category_id::text, effective_from::text FROM budgeting.category_limits
      WHERE tenant_id = ${TEST_TENANT}::uuid
        AND effective_from = '2026-05-01'::date
      ORDER BY effective_from
    `);
    await pool.end();
    expect(rows.rows).toHaveLength(3);
    const catIds = rows.rows.map(r => r.category_id);
    expect(catIds).toContain(cat1Id);
    expect(catIds).toContain(cat2Id);
    expect(catIds).toContain(cat3Id);
  });

  test("list templates for tenant", async () => {
    const result = await templateRepo.listTemplates(TEST_TENANT);
    expect(result.isOk()).toBe(true);
    expect(result.value!.length).toBeGreaterThanOrEqual(1);
    const found = result.value!.find(t => t.id === templateId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("May 2026 Budget");
  });
});
