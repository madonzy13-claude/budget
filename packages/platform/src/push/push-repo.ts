/**
 * push-repo.ts — Drizzle adapter for push subscriptions and notification prefs.
 *
 * Lives at the persistence adapter boundary (packages/platform/src/push/).
 * All queries run inside withTenantTx / withTenantTxRead so the RLS GUC
 * (app.tenant_ids + app.current_user_id) is always set before any DML.
 *
 * Plan 08-02 (PWAX-04).
 */
import { eq, and, inArray, sql } from "drizzle-orm";
import { withTenantTx, withTenantTxRead, withInfraTx } from "../db/tx";
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

export type NotificationKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET"
  // r32: a task was completed (by another member) — gated separately from the
  // per-kind created toggles.
  | "TASK_COMPLETED"
  // r32: recurring "update your budget" reminder (config carries days + tz).
  | "BUDGET_REMINDER";

/** All kinds surfaced in Settings (order = render order). */
export const NOTIFICATION_KINDS: NotificationKind[] = [
  "RESERVE_TOPUP",
  "CONFIRM_DRAFT",
  "CUSHION_BELOW_TARGET",
  "TASK_COMPLETED",
  "BUDGET_REMINDER",
];

/** Extra per-preference config. BUDGET_REMINDER: {days (ISO 1=Mon..7=Sun), tz}. */
export interface NotificationPrefConfig {
  days?: number[];
  tz?: string;
}

export interface UpsertPreferenceInput {
  tenantId: string;
  userId: string;
  budgetId: string;
  notificationType: NotificationKind;
  enabled: boolean;
  config?: NotificationPrefConfig | null;
}

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
  config: NotificationPrefConfig | null;
}

/** A reminder-enabled subscription: selected weekdays + an optional tz override. */
export interface ReminderSubscriptionRow extends PushSubscriptionRow {
  days: number[]; // ISO 1=Mon..7=Sun; defaults to all 7 when unset
  // tz explicitly saved in the pref config (rare); when null the cron uses the
  // member's identity timezone (getUserTimezones), then "UTC" as a last resort.
  configTz: string | null;
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
  // r32: exclude a user's own devices — used so a member who COMPLETES a task
  // isn't pinged about their own completion (they already know).
  excludeUserId?: string,
): Promise<PushSubscriptionRow[]> {
  const result = await withTenantTxRead(
    [TenantId(tenantId)],
    UserId(callerUserId),
    async (tx) => {
      // Get all subscriptions for this tenant (minus the excluded actor's).
      const allSubs = await tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.tenantId, tenantId));
      const subs = excludeUserId
        ? allSubs.filter((s) => s.userId !== excludeUserId)
        : allSubs;

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
 * r32: distinct tenant (budget) ids that have ANY push subscription. The hourly
 * budget-reminder cron iterates these (cross-tenant, worker_role) instead of
 * every budget in the DB. No RLS scope — infra read of the shared table.
 */
export async function getAllSubscribedTenantIds(): Promise<string[]> {
  const result = await withInfraTx(async (tx) => {
    const rows = await tx
      .selectDistinct({ tenantId: pushSubscriptions.tenantId })
      .from(pushSubscriptions);
    return rows.map((r) => r.tenantId);
  });
  if (result.isErr()) throw result.error;
  return result.value;
}

/**
 * r32: each user's saved IANA timezone (identity.users.timezone, geo-seeded at
 * sign-up). Read via worker_role (withInfraTx) — it can SELECT identity.users
 * across users, which the tenant-scoped app path cannot. Missing/NULL → absent
 * from the map (the reminder cron falls back to "UTC"). Raw SQL because the
 * identity schema is not imported into the platform package.
 */
export async function getUserTimezones(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const result = await withInfraTx(async (tx) => {
    const res = (await tx.execute(
      sql`SELECT id::text AS id, timezone
            FROM identity.users
           WHERE id::text = ANY(${userIds})`,
    )) as unknown as { rows: { id: string; timezone: string | null }[] };
    const out: Record<string, string> = {};
    for (const r of res.rows) if (r.timezone) out[r.id] = r.timezone;
    return out;
  });
  if (result.isErr()) throw result.error;
  return result.value;
}

/**
 * r32: reminder-enabled subscriptions for a budget, each with its resolved
 * schedule (days + tz). Used by the hourly budget-reminder cron. A user is
 * included when their BUDGET_REMINDER pref is enabled (or has NO row → default
 * enabled). No config row → all 7 days, UTC. The cron then filters by the
 * user's local hour/weekday.
 */
export async function getReminderSubscriptionsForBudget(
  tenantId: string,
  budgetId: string,
  callerUserId: string,
): Promise<ReminderSubscriptionRow[]> {
  const result = await withTenantTxRead(
    [TenantId(tenantId)],
    UserId(callerUserId),
    async (tx) => {
      const subs = await tx
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.tenantId, tenantId));
      if (subs.length === 0) return [];
      const userIds = [...new Set(subs.map((s) => s.userId))];

      const prefs = await tx
        .select()
        .from(notificationPrefs)
        .where(
          and(
            eq(notificationPrefs.tenantId, tenantId),
            eq(notificationPrefs.budgetId, budgetId),
            eq(notificationPrefs.notificationType, "BUDGET_REMINDER"),
            inArray(notificationPrefs.userId, userIds),
          ),
        );
      const byUser = new Map(prefs.map((p) => [p.userId, p]));

      const out: ReminderSubscriptionRow[] = [];
      for (const s of subs) {
        const pref = byUser.get(s.userId);
        if (pref && !pref.enabled) continue; // explicitly off
        const cfg = (pref?.config as NotificationPrefConfig | null) ?? null;
        out.push({
          id: s.id,
          tenantId: s.tenantId,
          userId: s.userId,
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
          locale: s.locale,
          days: cfg?.days ?? [1, 2, 3, 4, 5, 6, 7],
          configTz: cfg?.tz ?? null,
        });
      }
      return out;
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
  const existing = new Map(rows.map((r) => [r.notificationType, r]));

  return NOTIFICATION_KINDS.map((kind) => {
    const row = existing.get(kind);
    // No row → default ON; BUDGET_REMINDER also defaults to all 7 days.
    const defaultConfig: NotificationPrefConfig | null =
      kind === "BUDGET_REMINDER" ? { days: [1, 2, 3, 4, 5, 6, 7] } : null;
    if (row) {
      return {
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        budgetId: row.budgetId,
        notificationType: row.notificationType,
        enabled: row.enabled,
        config: (row.config as NotificationPrefConfig | null) ?? defaultConfig,
      };
    }
    return {
      id: "",
      tenantId,
      userId,
      budgetId,
      notificationType: kind,
      enabled: true,
      config: defaultConfig,
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
          config: input.config ?? null,
        })
        .onConflictDoUpdate({
          target: [
            notificationPrefs.userId,
            notificationPrefs.budgetId,
            notificationPrefs.notificationType,
          ],
          set: {
            enabled: input.enabled,
            // Only overwrite config when the caller provides one (on/off
            // toggles pass undefined and must not wipe a saved reminder schedule).
            ...(input.config !== undefined ? { config: input.config } : {}),
            updatedAt: new Date(),
          },
        });
    },
  );
  if (result.isErr()) throw result.error;
}
