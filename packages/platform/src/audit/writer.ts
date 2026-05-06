import { sql, type SQLWrapper } from "drizzle-orm";
import type { TenantId, UserId } from "@budget/shared-kernel";

export interface AuditEvent {
  tenantId: TenantId;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete";
  actorUserId: UserId;
  before: unknown | null;
  after: unknown | null;
}

export async function writeAudit(
  tx: { execute: (q: string | SQLWrapper) => Promise<unknown> },
  evt: AuditEvent,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO shared_kernel.audit_history
      (tenant_id, entity_type, entity_id, action, actor_user_id, before_jsonb, after_jsonb)
    VALUES
      (${evt.tenantId}, ${evt.entityType}, ${evt.entityId}, ${evt.action}, ${evt.actorUserId}, ${JSON.stringify(evt.before)}::jsonb, ${JSON.stringify(evt.after)}::jsonb)
  `);
}
