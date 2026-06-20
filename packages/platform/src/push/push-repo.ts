/**
 * push-repo.ts — Drizzle adapter for push subscriptions and notification prefs.
 *
 * Lives at the persistence adapter boundary (packages/platform/src/push/).
 * All queries run inside withTenantTx / withTenantTxRead so the RLS GUC
 * (app.tenant_ids + app.current_user_id) is always set before any DML.
 *
 * Plan 08-02 (PWAX-04).
 */
import { eq, and, inArray } from "drizzle-orm";
import { withTenantTx, withTenantTxRead } from "../db/tx";
import { TenantId, UserId } from "@budget/shared-kernel";
import { pushSubscriptions, notificationPrefs } from "./schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertSubscriptionInput {
  tenantId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale?: string;
}

export interface UpsertPreferenceInput {
  tenantId: string;
  userId: string;
  budgetId: string;
  notificationType: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "CUSHION_BELOW_TARGET";
  enabled: boolean;
}

export type NotificationKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET";

export interface PushSubscriptionRow {
  id: string;
  tenantId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string;
}

export interface NotificationPref {
  id: string;
  tenantId: string;
  userId: string;
  budgetId: string;
  notificationType: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Repository functions
// ---------------------------------------------------------------------------

/**
 * Upsert a push subscription. Conflict target is the unique endpoint column.
 * Updates p256dh, auth, locale on conflict (browser may rotate keys).
 */
export async function upsertSubscription(
  input: UpsertSubscriptionInput,
): Promise<void> {
  const result = await withTenantTx(
    TenantId(input.tenantId),
    UserId(input.userId),
    async (tx) => {
      await tx
        .insert(pushSubscriptions)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          locale: input.locale ?? "en",
        })
        .onConflictDoUpdate({
          // 260618: per-budget subscriptions — conflict is (endpoint, tenant_id),
          // so re-subscribing the same device for a DIFFERENT budget inserts a
          // new row instead of overwriting the first budget's row.
          target: [pushSubscriptions.endpoint, pushSubscriptions.tenantId],
          set: {
            p256dh: input.p256dh,
            auth: input.auth,
            locale: input.locale ?? "en",
          },
        });
    },
  );
  if (result.isErr()) throw result.error;
}

/**
 * Delete a push subscription by endpoint + userId. Scoped to userId to
 * prevent cross-user deletion (endpoint is globally unique but we assert ownership).
 */
export async function deleteSubscription(
  endpoint: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const result = await withTenantTx(
    TenantId(tenantId),
    UserId(userId),
    async (tx) => {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, userId),
          ),
        );
    },
  );
  if (result.isErr()) throw result.error;
}

/**
 * Whether THIS device endpoint is subscribed for a specific budget (tenant).
 * Backs the per-budget Settings master switch (260618): the master is ON iff a
 * push_subscriptions row exists for (endpoint, budgetId) for this user. RLS
 * scopes the read to the budget's tenant, so we filter only on endpoint+userId.
 */
export async function isSubscribedForBudget(
  budgetTenantId: string,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const result = await withTenantTxRead(
    [TenantId(budgetTenantId)],
    UserId(userId),
    async (tx) => {
      const rows = await tx
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, userId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  );
  if (result.isErr()) throw result.error;
  return result.value;
}

/**
 * Get all push subscriptions for users within a tenant/budget who have a
 * specific notification kind enabled (or have no pref row → default true).
 */
export async function getSubscriptionsForBudget(
  tenantId: string,
  budgetId: string,
  kind: NotificationKind,
  callerUserId: string,
): Promise<PushSubscriptionRow[]> {
  const result = await withTenantTxRead(
    [TenantId(tenantId)],
    UserId(callerUserId),
    async (tx) => {
      // Get all subscriptions for this tenant
      const subs = await tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.tenantId, tenantId));

      if (subs.length === 0) return [];

      const userIds = [...new Set(subs.map((s) => s.userId))];

      // Get prefs for these users for this budget+kind
      const prefs = await tx
        .select()
        .from(notificationPrefs)
        .where(
          and(
            eq(notificationPrefs.tenantId, tenantId),
            eq(notificationPrefs.budgetId, budgetId),
            eq(notificationPrefs.notificationType, kind),
            inArray(notificationPrefs.userId, userIds),
          ),
        );

      // Build set of userIds with explicit enabled=false
      const disabledUserIds = new Set(
        prefs.filter((p) => !p.enabled).map((p) => p.userId),
      );

      return subs
        .filter((s) => !disabledUserIds.has(s.userId))
        .map((s) => ({
          id: s.id,
          tenantId: s.tenantId,
          userId: s.userId,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
          locale: s.locale,
        }));
    },
  );
  if (result.isErr()) throw result.error;
  return result.value;
}

/**
 * Get all notification preferences for a user/budget combination.
 * Returns one entry per NotificationKind. Missing rows default to enabled=true.
 */
export async function getPreferences(
  tenantId: string,
  userId: string,
  budgetId: string,
): Promise<NotificationPref[]> {
  const result = await withTenantTxRead(
    [TenantId(tenantId)],
    UserId(userId),
    async (tx) => {
      return tx
        .select()
        .from(notificationPrefs)
        .where(
          and(
            eq(notificationPrefs.tenantId, tenantId),
            eq(notificationPrefs.userId, userId),
            eq(notificationPrefs.budgetId, budgetId),
          ),
        );
    },
  );
  if (result.isErr()) throw result.error;

  const rows = result.value;
  const kinds: NotificationKind[] = [
    "RESERVE_TOPUP",
    "CONFIRM_DRAFT",
    "CUSHION_BELOW_TARGET",
  ];
  const existing = new Map(rows.map((r) => [r.notificationType, r]));

  return kinds.map((kind) => {
    const row = existing.get(kind);
    if (row) {
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        budgetId: row.budgetId,
        notificationType: row.notificationType,
        enabled: row.enabled,
      };
    }
    return {
      id: "",
      tenantId,
      userId,
      budgetId,
      notificationType: kind,
      enabled: true,
    };
  });
}

/**
 * Upsert a single notification preference row.
 * Conflict target: (userId, budgetId, notificationType) unique index.
 */
export async function upsertPreference(
  input: UpsertPreferenceInput,
): Promise<void> {
  const result = await withTenantTx(
    TenantId(input.tenantId),
    UserId(input.userId),
    async (tx) => {
      await tx
        .insert(notificationPrefs)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          budgetId: input.budgetId,
          notificationType: input.notificationType,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [
            notificationPrefs.userId,
            notificationPrefs.budgetId,
            notificationPrefs.notificationType,
          ],
          set: {
            enabled: input.enabled,
            updatedAt: new Date(),
          },
        });
    },
  );
  if (result.isErr()) throw result.error;
}
