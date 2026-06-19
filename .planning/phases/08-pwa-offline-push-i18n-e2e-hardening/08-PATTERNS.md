# Phase 8: PWA, Offline, Push, i18n & E2E Hardening — Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 28 new/modified files
**Analogs found:** 26 / 28

> **⚠️ Offline patterns superseded (2026-06-16/17).** Any pattern below for the
> IndexedDB offline cache, offline write-queue/replay, offline-status-badge,
> sync-issues-list, or per-row pending markers is **obsolete** — that machinery was
> removed. Current offline = persisted React Query cache (read) + rollback-toast
> (write) + `OfflineStaleBar`/`useCacheAge` + SW nav layer. Before reusing any offline
> analog here, read the **08-CONTEXT.md** banner and memory `project_offline_architecture`.
> Push / i18n / E2E patterns are unaffected.

---

## File Classification

| New/Modified File                                            | Role           | Data Flow            | Closest Analog                                         | Match Quality |
| ------------------------------------------------------------ | -------------- | -------------------- | ------------------------------------------------------ | ------------- |
| `apps/web/src/lib/offline-cache.ts`                          | utility        | file-I/O (IndexedDB) | `apps/web/src/lib/idempotency.ts`                      | role-match    |
| `apps/web/src/lib/offline-queue.ts`                          | utility        | file-I/O (IndexedDB) | `apps/web/src/lib/idempotency.ts`                      | role-match    |
| `apps/web/src/hooks/use-online-sync.ts`                      | hook           | event-driven         | `apps/web/src/hooks/use-create-transaction.ts`         | role-match    |
| `apps/web/src/hooks/use-create-transaction.ts` (modify)      | hook           | request-response     | self                                                   | exact         |
| `apps/web/sw.ts` (modify — add notificationclick)            | service-worker | event-driven         | `apps/web/sw.ts` (self)                                | exact         |
| `apps/web/src/components/common/install-banner.tsx`          | component      | event-driven         | `apps/web/src/components/common/server-down-card.tsx`  | role-match    |
| `apps/web/src/components/common/offline-status-badge.tsx`    | component      | event-driven         | `apps/web/src/components/common/server-down-card.tsx`  | role-match    |
| `apps/web/src/components/common/sync-issues-list.tsx`        | component      | CRUD                 | `apps/web/src/components/common/server-down-card.tsx`  | role-match    |
| `packages/platform/src/push/schema.ts`                       | model          | CRUD                 | `packages/platform/src/outbox/schema.ts`               | exact         |
| `packages/platform/src/push/vapid.ts`                        | utility        | request-response     | `apps/web/src/lib/idempotency.ts`                      | role-match    |
| `packages/platform/src/push/index.ts`                        | config         | —                    | `packages/platform/src/outbox/index.ts`                | exact         |
| `apps/api/src/routes/push.ts`                                | route          | request-response     | `apps/api/src/routes/settings.ts`                      | exact         |
| `apps/worker/src/handlers/push-notification-handler.ts`      | handler        | event-driven         | `apps/worker/src/handlers/fx-daily-fetch.ts`           | role-match    |
| `apps/worker/src/worker.ts` (modify — register handler)      | config         | —                    | self                                                   | exact         |
| `apps/web/src/middleware.ts` (modify — Accept-Language)      | middleware     | request-response     | self                                                   | exact         |
| `apps/web/src/components/settings/push-prefs-section.tsx`    | component      | CRUD                 | `apps/web/src/components/settings/locale-select.tsx`   | exact         |
| `apps/web/messages/en.json` (extend)                         | config         | —                    | self                                                   | exact         |
| `apps/web/messages/pl.json` (extend)                         | config         | —                    | self                                                   | exact         |
| `apps/web/messages/uk.json` (extend)                         | config         | —                    | self                                                   | exact         |
| `scripts/check-i18n-completeness.ts`                         | utility        | batch                | `apps/worker/src/handlers/outbox-dispatch.ts`          | partial       |
| `apps/web/e2e/features/spendings.feature`                    | test           | request-response     | `apps/web/e2e/features/tasks.feature`                  | exact         |
| `apps/web/e2e/features/recurring-draft.feature`              | test           | request-response     | `apps/web/e2e/features/reserves.feature`               | exact         |
| `apps/web/e2e/features/cushion.feature`                      | test           | request-response     | `apps/web/e2e/features/reserves.feature`               | exact         |
| `apps/web/e2e/features/share-link.feature`                   | test           | request-response     | `apps/web/e2e/features/tasks.feature`                  | role-match    |
| `apps/web/e2e/page-objects/SpendingsPo.ts`                   | test           | —                    | `apps/web/e2e/page-objects/ReservesPo.ts`              | exact         |
| `apps/web/e2e/page-objects/OnboardingPo.ts`                  | test           | —                    | `apps/web/e2e/page-objects/ReservesPo.ts`              | role-match    |
| `apps/web/e2e/page-objects/ShareLinkPo.ts`                   | test           | —                    | `apps/web/e2e/page-objects/ReservesPo.ts`              | role-match    |
| `packages/budgeting/.../task-repo.ts` (modify — writeOutbox) | repository     | event-driven         | `packages/platform/src/outbox/schema.ts` + `writer.ts` | exact         |

---

## Pattern Assignments

### `apps/web/src/lib/offline-cache.ts` (utility, file-I/O)

**Analog:** `apps/web/src/lib/idempotency.ts` (same pure-utility, no-framework, no-React shape)

**Imports pattern** (`apps/web/src/lib/idempotency.ts` lines 1–8):

```typescript
// No framework imports — pure browser API wrapper exported as named functions
export function generateIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // fallback ...
}
```

Copy the same shape: no `"use client"`, no React, exported named functions only.

**Core pattern to implement:**

```typescript
// apps/web/src/lib/offline-cache.ts
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "budget-cache";
const DB_VERSION = 1; // bump when any store shape changes

export async function openBudgetDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("budgets", { keyPath: "id" });
      db.createObjectStore("wallets", { keyPath: "id" });
      db.createObjectStore("categories", { keyPath: "id" });
      db.createObjectStore("transactions", { keyPath: "_cacheKey" }); // "budgetId:YYYY-MM:id"
      db.createObjectStore("offline-queue", { keyPath: "idempotencyKey" });
      db.createObjectStore("sync-meta", { keyPath: "key" }); // { key: budgetId, lastSyncedAt: ISO }
    },
  });
}

export async function getCachedBudget(budgetId: string) {
  const db = await openBudgetDB();
  return (await db.get("budgets", budgetId)) ?? null;
}

export async function wipeBudgetCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

---

### `apps/web/src/lib/offline-queue.ts` (utility, file-I/O)

**Analog:** `apps/web/src/lib/idempotency.ts` (pure named-function utility) + RESEARCH Pattern 2

**Core pattern:**

```typescript
import { openBudgetDB } from "./offline-cache";

export interface OfflineTxn {
  idempotencyKey: string;
  budgetId: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  failReason?: string;
}

export async function enqueueOfflineTxn(
  txn: Omit<OfflineTxn, "failReason">,
): Promise<void> {
  const db = await openBudgetDB();
  await db.put("offline-queue", txn);
}

export async function getOfflineQueue(): Promise<OfflineTxn[]> {
  const db = await openBudgetDB();
  return db.getAll("offline-queue");
}

export async function removeFromQueue(idempotencyKey: string): Promise<void> {
  const db = await openBudgetDB();
  await db.delete("offline-queue", idempotencyKey);
}

export async function markQueueItemFailed(
  idempotencyKey: string,
  reason: string,
): Promise<void> {
  const db = await openBudgetDB();
  const item = await db.get("offline-queue", idempotencyKey);
  if (item) await db.put("offline-queue", { ...item, failReason: reason });
}
```

---

### `apps/web/src/hooks/use-online-sync.ts` (hook, event-driven)

**Analog:** `apps/web/src/hooks/use-create-transaction.ts`

**Imports pattern** (lines 1–16 of `use-create-transaction.ts`):

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
```

**Core pattern — `use-create-transaction.ts` mutationFn (lines 71–88):**

```typescript
mutationFn: async (input: CreateTransactionInput) => {
  const res = await clientApiFetch(`/budgets/${budgetId}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": generateIdempotencyKey(),  // ← key is fresh per online call
    },
    body: JSON.stringify({ ... }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).transaction;
},
```

For offline replay, the **same** `idempotencyKey` stored during enqueue is re-used (NOT `generateIdempotencyKey()` — that's the critical difference).

**Hook shape to implement:**

```typescript
"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  getOfflineQueue,
  removeFromQueue,
  markQueueItemFailed,
} from "@/lib/offline-queue";

export function useOnlineSync() {
  const qc = useQueryClient();
  useEffect(() => {
    async function replay() {
      const queue = await getOfflineQueue();
      for (const item of queue) {
        try {
          const res = await clientApiFetch(
            `/budgets/${item.budgetId}/transactions`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": item.idempotencyKey, // SAME key as enqueued
              },
              body: JSON.stringify(item.payload),
            },
          );
          if (res.ok || res.status === 200) {
            await removeFromQueue(item.idempotencyKey);
            qc.invalidateQueries({ queryKey: ["transactions", item.budgetId] });
          } else if (res.status >= 400 && res.status < 500) {
            await markQueueItemFailed(item.idempotencyKey, await res.text());
          }
          // 5xx / network error: leave in queue for next reconnect
        } catch {
          // still offline
        }
      }
    }
    window.addEventListener("online", replay);
    return () => window.removeEventListener("online", replay);
  }, [qc]);
}
```

---

### `apps/web/src/hooks/use-create-transaction.ts` (modify — offline fork)

**Analog:** self

**Modification pattern** — fork at `mutationFn` entry:

```typescript
// Before the clientApiFetch call, check navigator.onLine:
mutationFn: async (input: CreateTransactionInput) => {
  const key = generateIdempotencyKey();
  if (!navigator.onLine) {
    // Enqueue to IndexedDB instead of POST
    await enqueueOfflineTxn({
      idempotencyKey: key,
      budgetId,
      payload: { date: input.date, category_id: input.categoryId, ... },
      enqueuedAt: new Date().toISOString(),
    });
    return null; // triggers onError path → unsent: true marker
  }
  const res = await clientApiFetch(..., { headers: { "Idempotency-Key": key } });
  ...
},
```

The `onError` path (lines 120–130) already sets `unsent: true` — the offline fork reuses it for the "pending sync" marker per D-03.

---

### `apps/web/sw.ts` (modify — add notificationclick handler)

**Analog:** self (extend existing file after line 166)

**Add after `serwist.addEventListeners()` (line 142) and before the activate handler:**

```typescript
// Deep-link: notificationclick opens /budgets/<id>/<tab>?task=<id>
// D-PH7-30 URL contract locked; D-13: expand banner only (no scroll-to-surface)
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    (self as any).clients
      .matchAll({ type: "window" })
      .then((clients: any[]) => {
        const existing = clients.find((c: any) => c.url.includes(url));
        if (existing) return existing.focus();
        return (self as any).clients.openWindow(url);
      }),
  );
});
```

Note: `event.notification.data.url` is set by the push handler when it calls `web-push.sendNotification()`.

---

### `apps/web/src/components/common/install-banner.tsx` (component, event-driven)

**Analog:** `apps/web/src/components/common/server-down-card.tsx`

**Imports pattern** (`server-down-card.tsx` lines 1–8):

```typescript
"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, ServerCrash } from "lucide-react";
```

**Auth/guard pattern** — none; install banner is public (no auth check needed).

**Core UI pattern** (`server-down-card.tsx` lines 88–137):

```typescript
// data-testid on root container + on interactive elements
// useTranslations("pwa") for i18n strings (new namespace)
// CSS tokens: bg-[var(--primary)], text-[var(--body-on-dark)], text-[var(--muted-foreground)]
// Button: className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold..."
```

**Event-driven shape to implement:**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";

// D-16: capture beforeinstallprompt; show on mobile web; persistent in profile menu
export function InstallBanner() {
  const t = useTranslations("pwa");
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;
  return (
    <div data-testid="install-banner" role="banner" className="...">
      <button onClick={() => { prompt.prompt(); }} data-testid="install-banner-install">{t("install")}</button>
      <button onClick={() => setDismissed(true)} data-testid="install-banner-dismiss" aria-label={t("dismiss")}><X /></button>
    </div>
  );
}
```

---

### `apps/web/src/components/common/offline-status-badge.tsx` (component, event-driven)

**Analog:** `apps/web/src/components/common/server-down-card.tsx`

**Pattern:** `useState` + `useEffect` for `window.online/offline` events. `useTranslations("offline")`. `data-testid="offline-status-badge"`. No Sonner toast (same rationale as server-down-card — badge IS the inline indicator).

**Error handling:** no try/catch needed — online/offline events are infallible browser events.

---

### `apps/web/src/components/common/sync-issues-list.tsx` (component, CRUD)

**Analog:** `apps/web/src/components/common/server-down-card.tsx` (retry pattern + inline error state)

**Pattern:** Read from `getOfflineQueue()` filtered to `failReason !== undefined`. Display list. Retry button per item calls `removeFromQueue` + re-enqueue. `useTranslations("sync")`. `data-testid="sync-issues-list"`.

---

### `packages/platform/src/push/schema.ts` (model, CRUD)

**Analog:** `packages/platform/src/outbox/schema.ts` — EXACT shape: `sharedKernel.table(...)` + `pgPolicy` for tenant isolation.

**Outbox schema pattern** (lines 1–22 of `outbox/schema.ts`):

```typescript
import { uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";

// NO pgPolicy on outbox (it's infrastructure, GRANT-based)
// push_subscriptions IS domain data → NEEDS pgPolicy for RLS
export const outbox = sharedKernel.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  ...
});
```

**RLS pgPolicy pattern** (from `packages/platform/src/idempotency/schema.ts` lines 28–48):

```typescript
import { pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appRole, workerRole } from "../db/roles";

// Tenant-isolation policy (copy this for push_subscriptions):
pgPolicy("push_subscriptions_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

**Tables to define:**

```typescript
// push_subscriptions — one row per browser+user subscription endpoint
export const pushSubscriptions = sharedKernel.table("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),   // browser public key
  auth: text("auth").notNull(),        // browser auth secret
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy("push_subscriptions_tenant_isolation", { ... }) // copy idempotency pattern
]);

// notification_prefs — per-user/per-budget/per-kind toggle (D-10, D-11 extensible)
export const notificationPrefs = sharedKernel.table("notification_prefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id").notNull(),
  budgetId: uuid("budget_id").notNull(),
  notificationType: text("notification_type").notNull(), // registry key — extensible D-11
  enabled: text("enabled").notNull().default("true"),    // "true"/"false" (text for future tri-state)
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy("notification_prefs_tenant_isolation", { ... }) // copy idempotency pattern
]);
```

---

### `apps/api/src/routes/push.ts` (route, request-response)

**Analog:** `apps/api/src/routes/settings.ts` — EXACT pattern: Hono factory function, `zValidator`, session guard, deps injection.

**Imports pattern** (`settings.ts` lines 1–18):

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
```

**Auth guard pattern** (`settings.ts` lines 36–40):

```typescript
// Every state-changing handler:
const session = c.get("session");
if (!session) return c.json({ error: "unauthorized" }, 401);
```

**Route factory pattern** (`settings.ts` lines 19–133):

```typescript
export function createPushRoute(deps: BootedDeps) {
  const r = new Hono();

  const subscribeSchema = z.object({
    endpoint: z.string().url(),
    p256dh: z.string(),
    auth: z.string(),
  });

  const prefsSchema = z.object({
    budgetId: z.string().uuid(),
    notificationType: z.enum(["RESERVE_TOPUP", "CONFIRM_DRAFT", "CUSHION_BELOW_TARGET"]),
    enabled: z.boolean(),
  });

  // POST /push/subscribe
  r.post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const body = c.req.valid("json");
    try {
      await deps.push.subscriptionRepo.upsert({ userId: session.user.id, ...body });
      return c.json({ ok: true });
    } catch (e) {
      throw e;
    }
  });

  // DELETE /push/subscribe
  r.delete("/subscribe", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const { endpoint } = await c.req.json();
    await deps.push.subscriptionRepo.delete(endpoint, session.user.id);
    return c.json({ ok: true });
  });

  // GET /push/preferences
  r.get("/preferences", async (c) => { ... });

  // PATCH /push/preferences
  r.patch("/preferences", zValidator("json", prefsSchema), async (c) => { ... });

  return r;
}
```

**Error handling pattern** (from `settings.ts` lines 46–51):

```typescript
try {
  await deps.identity.userRepo.updateLocale(...);
  return c.json({ ok: true });
} catch (e) {
  const msg = (e as Error).message ?? "unknown";
  if (/Invalid locale/.test(msg)) return c.json({ error: msg }, 400);
  throw e; // re-throw unknown errors to centralized error middleware
}
```

---

### `apps/worker/src/handlers/push-notification-handler.ts` (handler, event-driven)

**Analog:** `apps/worker/src/handlers/fx-daily-fetch.ts` — `registerXxx(boss, deps)` function shape with `boss.work(queueName, handler)`.

**Worker handler pattern** (`fx-daily-fetch.ts` lines 26–59):

```typescript
export function registerFxDailyFetch(boss: PgBossLike, fxProvider: FxProvider) {
  boss.work("fx-daily-fetch", async () => {
    // ... do work, return result object for observability
    return { fetched, failed };
  });
}
```

**Event-bus subscription pattern** (`packages/platform/src/outbox/dispatcher.ts` — outbox dispatches to eventBus):
The push handler subscribes to the eventBus rather than a pg-boss queue directly (the outbox dispatcher publishes task.created events):

```typescript
import { eventBus } from "@budget/platform";
import webPush from "web-push";

// Extensible notification-type registry (D-11)
// Adding a new trigger = add a key here, no migration
const NOTIFICATION_TYPES: Record<string, {
  title: (locale: string) => string;
  body: (locale: string) => string;
  tab: string;
}> = {
  RESERVE_TOPUP: { title: (l) => ..., body: (l) => ..., tab: "reserves" },
  CONFIRM_DRAFT: { title: (l) => ..., body: (l) => ..., tab: "spendings" },
  CUSHION_BELOW_TARGET: { title: (l) => ..., body: (l) => ..., tab: "wallets" },
};

export function registerPushNotificationHandler(deps: PushHandlerDeps) {
  eventBus.subscribe("task.created", async (evt) => {
    const { kind, budgetId, taskId } = evt.payload as { kind: string; budgetId: string; taskId: string };
    const notifType = NOTIFICATION_TYPES[kind];
    if (!notifType) return; // unknown kind — safe skip, no throw
    const subs = await deps.pushRepo.getSubscriptionsForBudget(evt.tenantId, budgetId, kind);
    for (const sub of subs) {
      const url = `/budgets/${budgetId}/${notifType.tab}?task=${taskId}`;
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notifType.title(sub.locale), body: notifType.body(sub.locale), url }),
        );
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await deps.pushRepo.delete(sub.endpoint, sub.userId); // stale sub — clean up (Pitfall 4)
        }
        // other errors: log + continue, don't block remaining subs
      }
    }
  });
}
```

---

### `apps/worker/src/worker.ts` (modify — register push handler)

**Analog:** self — add registration after `registerBudgetingReconciliation` call.

**Registration pattern** (`worker.ts` lines 33–38):

```typescript
// FX daily fetcher registration pattern to copy:
await boss.createQueue("fx-daily-fetch");
await boss.schedule("fx-daily-fetch", "0 17 * * *", null, {
  tz: "Europe/Berlin",
});
registerFxDailyFetch(
  boss as unknown as Parameters<typeof registerFxDailyFetch>[0],
  fxProvider,
);
```

Push handler uses eventBus (not a pg-boss queue) — no `boss.createQueue` needed. Just call `registerPushNotificationHandler(deps)` after the other registrations.

---

### `apps/web/src/middleware.ts` (modify — Accept-Language detection)

**Analog:** self (D-20: the ONLY missing piece is reading Accept-Language on first visit)

**Existing pattern to extend:** middleware already reads `budget-locale` cookie and redirects logged-in users to their account locale. Add Accept-Language negotiation before the default `"en"` fallback:

```typescript
// In the branch where no budget-locale cookie and no session locale:
const acceptLang = request.headers.get("accept-language") ?? "";
const preferred = acceptLang
  .split(",")[0]
  ?.split(";")[0]
  ?.trim()
  ?.slice(0, 2)
  ?.toLowerCase();
const negotiated = (["en", "pl", "uk"] as const).includes(
  preferred as "en" | "pl" | "uk",
)
  ? (preferred as "en" | "pl" | "uk")
  : "en";
// use `negotiated` instead of hardcoded "en"
```

---

### `apps/web/src/components/settings/push-prefs-section.tsx` (component, CRUD)

**Analog:** `apps/web/src/components/settings/locale-select.tsx` — EXACT pattern: `"use client"`, `useState`, `useTranslations`, `api.settings.*.$put/patch` Hono RPC call, `toast.success/error`.

**Imports pattern** (`locale-select.tsx` lines 1–17):

```typescript
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
```

Replace `Select` with `Switch` (shadcn `<Switch>`) for per-kind toggles. Same `toast.success/error` + optimistic `setState` rollback on error pattern.

**Core mutation pattern** (`locale-select.tsx` lines 28–55):

```typescript
const handleChange = async (newLocale: string) => {
  const previous = locale;
  setLocale(newLocale); // optimistic
  try {
    const res = await api.settings.locale.$put({ json: { locale: newLocale } });
    if (!res.ok) throw new Error("Failed to update locale");
    toast.success(t("save_success"));
  } catch {
    setLocale(previous); // rollback
    toast.error(
      t("error_save", { defaultValue: "Failed to save. Try again." }),
    );
  }
};
```

Push prefs section copies this shape for each kind toggle: `const [enabled, setEnabled] = useState(initialEnabled)` → call `api.push.preferences.$patch(...)` → rollback on error.

---

### `packages/budgeting/.../task-repo.ts` (modify — add writeOutbox)

**Analog:** `packages/platform/src/outbox/writer.ts` provides `writeOutbox(tx, payload)`.

**Pattern:** After every `INSERT INTO tasks` in all three emit functions (`emitReserveTopup`, `emitConfirmDraft`, `emitCushionBelowTarget`), add:

```typescript
import { writeOutbox } from "@budget/platform";

// Inside the transaction, after INSERT:
await writeOutbox(tx, {
  tenantId,
  aggregateType: "task",
  aggregateId: taskId,
  eventType: "task.created",
  payloadJsonb: { kind, budgetId, taskId },
});
```

This is the MOST CRITICAL Phase 8 change (Pitfall 1) — without it, push never fires.

---

### `scripts/check-i18n-completeness.ts` (utility, batch)

**Analog:** no exact analog — pure Node/Bun script. Closest shape is `apps/worker/src/handlers/outbox-dispatch.ts` (simple async function, imports from packages).

**Pattern from RESEARCH §Pattern 5:**

```typescript
// scripts/check-i18n-completeness.ts
import en from "../apps/web/messages/en.json";
import pl from "../apps/web/messages/pl.json";
import uk from "../apps/web/messages/uk.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null
      ? flatKeys(v as Record<string, unknown>, key)
      : [key];
  });
}

const enKeys = new Set(flatKeys(en));
const missing = { pl: [] as string[], uk: [] as string[] };
// EN keys missing from PL/UK:
for (const key of enKeys) {
  if (!flatKeys(pl).includes(key)) missing.pl.push(key);
  if (!flatKeys(uk).includes(key)) missing.uk.push(key);
}
if (missing.pl.length || missing.uk.length) {
  console.error("Missing i18n keys:", missing);
  process.exit(1);
}
```

---

### `apps/web/e2e/features/spendings.feature` (test, request-response)

**Analog:** `apps/web/e2e/features/tasks.feature` — EXACT format: `@tag`, `Feature:`, `Background: Given I am signed in as a fresh user`, named `Scenario:` blocks, step sentences.

**Feature file pattern** (`tasks.feature` lines 1–15):

```gherkin
@tasks-redesign
Feature: Tasks redesign — home badge + per-pill badge + per-pill slider

  Background:
    Given I am signed in as a fresh user

  Scenario: Home shows red badge "3" on a budget card with 3 pending tasks
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" ...
    When I open the home page
    Then the budget card for "My E2E Budget" shows a pending tasks badge "3"
```

**Phase 8 tag:** `@phase8` (consistent with RESEARCH validation map).

**Spendings feature scenarios to implement:**

- Quick-entry transaction appears in the grid (covers E2EX-03 quick-entry gap)
- Offline quick-entry queues locally (shows "pending sync" marker on row)
- Reconnect replays queued transaction (row becomes confirmed)
- Sync-issues list shows failed replay items

---

### `apps/web/e2e/features/recurring-draft.feature` (test, request-response)

**Analog:** `apps/web/e2e/features/reserves.feature` — scenario that modifies data and asserts the result. Copy `Background` + seeding `Given` steps, `When I open the ... tab`, `Then` assertion pattern.

**Scenarios to implement (E2EX-03 gap):**

- Recurring draft appears in Spendings tab with confirm action
- Confirming a draft removes it from the draft section

---

### `apps/web/e2e/features/cushion.feature` (test, request-response)

**Analog:** `apps/web/e2e/features/reserves.feature`

**Scenarios to implement (E2EX-03 gap):**

- Cushion mode can be toggled on/off in Settings
- Wallets tab reflects cushion-mode state change

---

### `apps/web/e2e/features/share-link.feature` (test, request-response)

**Analog:** `apps/web/e2e/features/tasks.feature` (multi-actor scenario style)

**Scenarios to implement (E2EX-03 gap):**

- Share link can be generated in Settings
- Recipient following the link joins the budget as a member

---

### `apps/web/e2e/page-objects/SpendingsPo.ts` (test)

**Analog:** `apps/web/e2e/page-objects/ReservesPo.ts` — EXACT structure: constructor takes `Page`, methods return `Locator`, `data-testid` selectors, helper methods for interactions.

**ReservesPo pattern** (lines 25–35):

```typescript
export class ReservesPo {
  constructor(private page: Page) {}

  rowByCategory(name: string): Locator {
    return this.page
      .locator('[data-testid^="reserves-row-"]')
      .filter({ hasText: new RegExp(name, "i") })
      .first();
  }

  async setReserve(name: string, value: string): Promise<void> { ... }
}
```

**SpendingsPo shape to implement:**

```typescript
import { expect, type Page, type Locator } from "@playwright/test";

export class SpendingsPo {
  constructor(private page: Page) {}

  quickEntryInput(): Locator {
    return this.page.getByTestId("quick-entry-input");
  }
  quickEntrySubmit(): Locator {
    return this.page.getByTestId("quick-entry-submit");
  }
  transactionRow(id: string): Locator {
    return this.page.getByTestId(`txn-row-${id}`);
  }
  pendingSyncMarker(id: string): Locator {
    return this.page.getByTestId(`txn-pending-${id}`);
  }
  syncIssuesList(): Locator {
    return this.page.getByTestId("sync-issues-list");
  }
  offlineStatusBadge(): Locator {
    return this.page.getByTestId("offline-status-badge");
  }
}
```

Note: `data-testid` values must match what the implementation adds — coordinate with the component authoring plan.

---

### `apps/web/e2e/page-objects/OnboardingPo.ts` (test)

**Analog:** `apps/web/e2e/page-objects/ReservesPo.ts` (same constructor + Locator pattern)

**Shape:** Wizard step navigation locators, step-title assertion, locale-select locator (onboarding wizard shows push opt-in per D-09).

---

### `apps/web/e2e/page-objects/ShareLinkPo.ts` (test)

**Analog:** `apps/web/e2e/page-objects/ReservesPo.ts`

**Shape:** Share-link URL field locator (`SettingsPo` already has `shareUrlField()` — ShareLinkPo wraps the join-page card locators for the recipient side).

---

## Shared Patterns

### Authentication Guard (all API routes)

**Source:** `apps/api/src/routes/settings.ts` lines 36–40
**Apply to:** `apps/api/src/routes/push.ts` — every handler

```typescript
const session = c.get("session");
if (!session) return c.json({ error: "unauthorized" }, 401);
```

### Error Handling — re-throw unknown, handle domain errors

**Source:** `apps/api/src/routes/settings.ts` lines 46–51
**Apply to:** `apps/api/src/routes/push.ts`

```typescript
try {
  await deps.push.subscriptionRepo.upsert(...);
  return c.json({ ok: true });
} catch (e) {
  const msg = (e as Error).message ?? "unknown";
  if (/known domain error/.test(msg)) return c.json({ error: msg }, 400);
  throw e; // unknown errors bubble to centralized error middleware
}
```

### Validation — zValidator on every state-changing endpoint

**Source:** `apps/api/src/routes/settings.ts` line 36; `apps/api/src/routes/transactions.ts` line 208
**Apply to:** `apps/api/src/routes/push.ts` POST and PATCH handlers

```typescript
r.post("/subscribe", zValidator("json", subscribeSchema), async (c) => { ... });
```

### Tenant RLS Policy — sharedKernel table + pgPolicy

**Source:** `packages/platform/src/idempotency/schema.ts` lines 28–48
**Apply to:** `packages/platform/src/push/schema.ts` both tables

```typescript
pgPolicy("push_subscriptions_tenant_isolation", {
  as: "permissive", for: "all", to: [appRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

### React Query Invalidation after mutations

**Source:** `apps/web/src/hooks/use-create-transaction.ts` lines 148–161
**Apply to:** `apps/web/src/hooks/use-online-sync.ts` after successful replay

```typescript
qc.invalidateQueries({ queryKey: ["transactions", item.budgetId] });
qc.invalidateQueries({ queryKey: ["spendings-summary", item.budgetId] });
qc.invalidateQueries({ queryKey: ["tasks", item.budgetId, "pending"] });
```

### i18n in components — `useTranslations(namespace)`

**Source:** `apps/web/src/components/settings/locale-select.tsx` line 7; `apps/web/src/components/common/server-down-card.tsx` line 25
**Apply to:** All Phase 8 client components

```typescript
// Namespace determines the message catalog key prefix
const t = useTranslations("pwa"); // install-banner
const t = useTranslations("offline"); // offline-status-badge, sync-issues-list
const t = useTranslations("push"); // push-prefs-section
```

### Optimistic UI with rollback on error

**Source:** `apps/web/src/components/settings/locale-select.tsx` lines 28–55
**Apply to:** `apps/web/src/components/settings/push-prefs-section.tsx`

```typescript
const previous = enabled;
setEnabled(newValue);  // optimistic
try {
  const res = await api.push.preferences.$patch({ json: { ... } });
  if (!res.ok) throw new Error();
  toast.success(t("save_success"));
} catch {
  setEnabled(previous);  // rollback
  toast.error(t("error_save", { defaultValue: "Failed to save. Try again." }));
}
```

### E2E — fresh-user-per-scenario fixture

**Source:** `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` lines 240–282
**Apply to:** All new Phase 8 `.feature` files via the existing `Background: Given I am signed in as a fresh user` step (already wired in all existing features — reuse unchanged).

### E2E — Feature file header convention

**Source:** `apps/web/e2e/features/tasks.feature` line 1
**Apply to:** All new Phase 8 `.feature` files

```gherkin
@phase8
Feature: [name] — [one-line description]

  Background:
    Given I am signed in as a fresh user
```

---

## No Analog Found

| File                                  | Role    | Data Flow | Reason                                                                                                                                                                                                                                         |
| ------------------------------------- | ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/platform/src/push/vapid.ts` | utility | —         | No VAPID/web-push wrapper exists. Use `web-push.generateVAPIDKeys()` and `web-push.sendNotification()` directly (RESEARCH §Pattern 3). The push handler is the consumer; `vapid.ts` is a thin configuration module setting VAPID details once. |

---

## Critical Implementation Order

The following dependency chain is load-bearing for Phase 8 push to work end-to-end:

1. `packages/platform/src/push/schema.ts` (tables) → migration → `apps/api/src/routes/push.ts` (routes) → subscribe endpoint tested
2. `packages/budgeting/.../task-repo.ts` (writeOutbox added) → `apps/worker/src/handlers/push-notification-handler.ts` (consumer) → `apps/worker/src/worker.ts` (registered) → integration test fires push
3. `apps/web/src/lib/offline-cache.ts` + `offline-queue.ts` → `use-create-transaction.ts` (offline fork) + `use-online-sync.ts` (replay) → E2E offline scenario

Steps 1 and 2 can proceed in parallel. Step 3 is independent of Steps 1–2.

---

## Metadata

**Analog search scope:** `apps/web/src/`, `apps/api/src/`, `apps/worker/src/`, `packages/platform/src/`, `apps/web/e2e/`
**Files scanned:** ~35
**Pattern extraction date:** 2026-06-10
