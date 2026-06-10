/**
 * budget-template-repo.ts — Drizzle adapter for BudgetTemplateRepo
 * Handles template CRUD + bulk apply (setCategoryLimit per item in single tx).
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, ok, err } from "@budget/shared-kernel";
import type {
  BudgetTemplateRepo,
  CreateTemplateInput,
  ApplyTemplateInput,
  TemplateDto,
} from "../../ports/budget-template-repo";
import type { Result } from "@budget/shared-kernel";

function firstDayOfMonth(targetMonth: string): string {
  // targetMonth = "YYYY-MM" → "YYYY-MM-01"
  return `${targetMonth}-01`;
}

export class DrizzleBudgetTemplateRepo implements BudgetTemplateRepo {
  async createTemplate(
    input: CreateTemplateInput,
  ): Promise<Result<TemplateDto, Error>> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);
    const templateId = crypto.randomUUID();

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(sql`
        INSERT INTO budgeting.budget_templates (id, tenant_id, name, actor_user_id)
        VALUES (${templateId}::uuid, ${input.tenantId}::uuid, ${input.name}, ${input.actorUserId}::uuid)
      `);

      for (const item of input.items) {
        await tx.execute(sql`
          INSERT INTO budgeting.budget_template_items
            (template_id, category_id, tenant_id, normal_amount, normal_currency, cushion_amount, cushion_currency)
          VALUES (${templateId}::uuid, ${item.categoryId}::uuid, ${input.tenantId}::uuid,
                  ${item.normalAmount}::bigint, ${item.normalCurrency},
                  ${item.cushionAmount}::bigint, ${item.cushionCurrency})
        `);
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "budget_template",
        entityId: templateId,
        action: "create",
        actorUserId: uid,
        before: null,
        after: { name: input.name, itemCount: input.items.length },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "budget_template",
        aggregateId: templateId,
        eventType: "budgeting.template.created",
        payload: { name: input.name, actorUserId: input.actorUserId },
      });

      return {
        id: templateId,
        tenantId: input.tenantId,
        name: input.name,
        items: input.items.map((i) => ({
          categoryId: i.categoryId,
          normalAmount: i.normalAmount,
          normalCurrency: i.normalCurrency,
          cushionAmount: i.cushionAmount,
          cushionCurrency: i.cushionCurrency,
        })),
        createdAt: new Date().toISOString(),
      } satisfies TemplateDto;
    });

    if (r.isErr()) return err(r.error);
    return ok(r.value!);
  }

  async listTemplates(tenantId: string): Promise<Result<TemplateDto[], Error>> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const templates = await tx.execute<{
        id: string;
        name: string;
        tenant_id: string;
        created_at: Date;
      }>(sql`
        SELECT id::text, name, tenant_id::text, created_at
        FROM budgeting.budget_templates
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY created_at DESC
      `);

      const result: TemplateDto[] = [];
      for (const t of templates.rows) {
        const items = await tx.execute<{
          category_id: string;
          normal_amount: string;
          normal_currency: string;
          cushion_amount: string;
          cushion_currency: string;
        }>(sql`
          SELECT category_id::text, normal_amount::text, normal_currency,
                 cushion_amount::text, cushion_currency
          FROM budgeting.budget_template_items
          WHERE template_id = ${t.id}::uuid
        `);

        result.push({
          id: t.id,
          tenantId: t.tenant_id,
          name: t.name,
          items: items.rows.map((i) => ({
            categoryId: i.category_id,
            normalAmount: i.normal_amount,
            normalCurrency: i.normal_currency,
            cushionAmount: i.cushion_amount,
            cushionCurrency: i.cushion_currency,
          })),
          createdAt: new Date(t.created_at).toISOString(),
        });
      }
      return result;
    });

    if (r.isErr()) return err(r.error);
    return ok(r.value!);
  }

  async findTemplate(
    tenantId: string,
    templateId: string,
  ): Promise<TemplateDto | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const template = await tx.execute<{
        id: string;
        name: string;
        tenant_id: string;
        created_at: Date;
      }>(sql`
        SELECT id::text, name, tenant_id::text, created_at
        FROM budgeting.budget_templates
        WHERE id = ${templateId}::uuid AND tenant_id = ${tenantId}::uuid
      `);

      if (!template.rows[0]) return null;
      const t = template.rows[0];

      const items = await tx.execute<{
        category_id: string;
        normal_amount: string;
        normal_currency: string;
        cushion_amount: string;
        cushion_currency: string;
      }>(sql`
        SELECT category_id::text, normal_amount::text, normal_currency,
               cushion_amount::text, cushion_currency
        FROM budgeting.budget_template_items
        WHERE template_id = ${templateId}::uuid
      `);

      return {
        id: t.id,
        tenantId: t.tenant_id,
        name: t.name,
        items: items.rows.map((i) => ({
          categoryId: i.category_id,
          normalAmount: i.normal_amount,
          normalCurrency: i.normal_currency,
          cushionAmount: i.cushion_amount,
          cushionCurrency: i.cushion_currency,
        })),
        createdAt: new Date(t.created_at).toISOString(),
      } satisfies TemplateDto;
    });

    if (r.isErr()) throw r.error;
    return r.value!;
  }

  async applyTemplate(
    input: ApplyTemplateInput,
  ): Promise<Result<void, Error>> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);
    const effectiveFrom = firstDayOfMonth(input.targetMonth);

    // Load template first to get items
    const template = await this.findTemplate(input.tenantId, input.templateId);
    if (!template) {
      return err(new Error(`Template ${input.templateId} not found`));
    }

    const r = await withTenantTx(tid, uid, async (tx) => {
      for (const item of template.items) {
        // SCD-2 pattern: close previous open row if different date, insert new
        const before = await tx.execute<{ id: string; effective_from: string }>(sql`
          SELECT id::text, effective_from::text
          FROM budgeting.category_limits
          WHERE category_id = ${item.categoryId}::uuid AND effective_to IS NULL
        `);

        if (before.rows.length > 0) {
          const prevFrom = before.rows[0].effective_from.substring(0, 10);
          if (prevFrom === effectiveFrom) {
            // Same day: update in place
            await tx.execute(sql`
              UPDATE budgeting.category_limits
              SET normal_amount = ${item.normalAmount}::bigint,
                  normal_currency = ${item.normalCurrency},
                  cushion_amount = ${item.cushionAmount}::bigint,
                  cushion_currency = ${item.cushionCurrency},
                  actor_user_id = ${input.actorUserId}::uuid
              WHERE category_id = ${item.categoryId}::uuid AND effective_to IS NULL
            `);
          } else {
            await tx.execute(sql`
              UPDATE budgeting.category_limits
              SET effective_to = ${effectiveFrom}::date - INTERVAL '1 day'
              WHERE category_id = ${item.categoryId}::uuid AND effective_to IS NULL
            `);
            await tx.execute(sql`
              INSERT INTO budgeting.category_limits
                (tenant_id, category_id, normal_amount, normal_currency,
                 cushion_amount, cushion_currency, effective_from, actor_user_id)
              VALUES (${input.tenantId}::uuid, ${item.categoryId}::uuid,
                      ${item.normalAmount}::bigint, ${item.normalCurrency},
                      ${item.cushionAmount}::bigint, ${item.cushionCurrency},
                      ${effectiveFrom}::date, ${input.actorUserId}::uuid)
            `);
          }
        } else {
          await tx.execute(sql`
            INSERT INTO budgeting.category_limits
              (tenant_id, category_id, normal_amount, normal_currency,
               cushion_amount, cushion_currency, effective_from, actor_user_id)
            VALUES (${input.tenantId}::uuid, ${item.categoryId}::uuid,
                    ${item.normalAmount}::bigint, ${item.normalCurrency},
                    ${item.cushionAmount}::bigint, ${item.cushionCurrency},
                    ${effectiveFrom}::date, ${input.actorUserId}::uuid)
          `);
        }
      }

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "budget_template",
        entityId: input.templateId,
        action: "update",
        actorUserId: uid,
        before: null,
        after: { targetMonth: input.targetMonth, effectiveFrom },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "budget_template",
        aggregateId: input.templateId,
        eventType: "budgeting.template.applied",
        payload: {
          templateId: input.templateId,
          targetMonth: input.targetMonth,
          effectiveFrom,
          categoryCount: template.items.length,
          actorUserId: input.actorUserId,
        },
      });
    });

    if (r.isErr()) return err(r.error);
    return ok(undefined);
  }
}
