# Phase 8: PWA, Offline, Push, i18n & E2E Hardening — Research

**Researched:** 2026-06-10
**Domain:** PWA (Serwist), IndexedDB, VAPID web-push, next-intl i18n, playwright-bdd E2E
**Confidence:** HIGH (codebase directly probed; all major claims verified against source)

> **⚠️ Offline research superseded (2026-06-16/17).** The IndexedDB cache / offline
> write-queue / sync-replay design researched here was **not the final approach** —
> it was built (08-03) then removed as too fragile on iOS. Shipped offline = persisted
> React Query cache (read) + honest POST + rollback-toast (write) + `OfflineStaleBar`/
> `useCacheAge` + SW nav layer (nav-docs cache-first offline, `OfflineNavGuard`,
> `offline-shell.html` Back button, `usePrefetchBudgetTabs`). See **08-CONTEXT.md**
> banner + memories `project_offline_architecture`, `project_spa_swr_refactor`,
> `project_nav_cache_lag`. PWA-install / web-push / i18n / E2E research unaffected.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Offline behavior (PWA)**

- D-01: Cache ALL last-synced data in IndexedDB — budgets, wallets, categories, transactions across all visited months.
- D-02: Offline quick-entry replays best-effort on reconnect via `Idempotency-Key`; failures land in a visible "sync issues" list.
- D-03: Queued txns show per-row "pending sync" marker on Spendings grid AND global offline/queue badge in nav.
- D-04: Never-synced offline surface shows explicit "unavailable offline" empty-state with retry — not blank or skeleton.
- D-05: Cached views display subtle "last synced X ago" marker while offline/reconnecting.
- D-06: Refresh-on-reconnect, no hard cap. Wipe cache on logout/tenant-switch. Cross-tenant cache isolation already tested.

**PWA resilience / total-outage fallback (PWAX-01/02)**

- D-07: No blank pages, no infinite redirects — graceful native-app-style fallback always shown.
- D-08: Logged-out-on-server-error shows friendly screen + manual Reload button; generic no-internet/server-issue fallback wording everywhere.

**Push notifications**

- D-09: Permission requested from Settings "Enable push" toggle AND onboarding wizard step.
- D-10: Per-budget + per-kind toggles (RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET).
- D-11: Extensible notification-type registry — NOT hardcoded to task creation. Schema + UI + dispatcher must accommodate future non-task triggers with no migration.
- D-12: Only 3 task kinds: RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET. REQUIREMENTS.md PWAX-05 is stale — ROADMAP success-criteria #2 is authoritative.
- D-13: Clicking a push opens `/budgets/<id>/<tab>?task=<id>`; auto-expands banner row only.
- D-14: If task already resolved when deep-link opens, land on the tab silently — no toast.
- D-15: Push body is generic — no financials on lock screens.

**PWA install**

- D-16: Capture `beforeinstallprompt`. Mobile web: visible top banner (Install + ✕ + "Learn more"). Persistent Install item in profile mini-menu.

**i18n**

- D-17: CI completeness gate fails on any missing EN/PL/UK key; runtime falls back to EN.
- D-18: Keep existing PL/UK strings where keys carry over; translate only new/renamed keys.
- D-19: New/renamed PL/UK strings are LLM-translated and flagged as machine-origin for later review.
- D-20: Detect from Accept-Language (PL/UK direct; else EN); persist on `users.locale`; switchable from settings/user menu.

**E2E (audit-and-fill, NOT a rewrite)**

- D-21: Suite is already Gherkin + new-IA. Phase 8 = audit coverage vs E2EX-03 list + fill gaps + add Phase-8 scenarios (offline quick-entry replay, push opt-in/deep-link) + verify green.
- D-22: Leave `cross-tenant-cache.spec.ts` and `server-down.spec.ts` as-is (raw infra specs — Gherkin adds nothing).

### Claude's Discretion

- Exact IndexedDB library/approach (idb vs raw), Serwist runtime-caching route config, service-worker precache manifest details.
- Exact ICU string copy for notifications and offline/error fallback screens.
- Whether the notification-type registry lives in Notifications bounded context vs a shared dispatch table.
- E2E scenario authoring details, fixtures reuse, server-test-clock usage.

### Deferred Ideas (OUT OF SCOPE)

- Non-task notification triggers (spendings-fill reminders, insights, month-end nudges).
- Per-kind push quiet-hours / batching / digest.
- Cache size/age cap with LRU eviction.
- Human translation review of LLM-generated PL/UK strings.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                     | Research Support                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PWAX-01 | Manifest + SW register on every page                                            | SW exists (`apps/web/sw.ts`), manifest exists (`public/manifest.json`); manifest needs icons/theme-color/screenshots for installability                                                                      |
| PWAX-02 | Offline shell: IndexedDB cache of budgets/wallets/categories/current-month txns | idb not installed; needs new package + cache-write hooks on query cache hydration                                                                                                                            |
| PWAX-03 | Offline quick-entry queues locally; sync on reconnect with Idempotency-Key      | Server-side idempotency fully wired (middleware.ts + repo + cleanup worker); client hook exists (use-create-transaction.ts); needs offline-queue store in IndexedDB + reconnect replay                       |
| PWAX-04 | VAPID web-push registered per user; per-budget enable/disable                   | web-push not installed; VAPID key generation + subscription table + prefs table needed                                                                                                                       |
| PWAX-05 | Push fires on RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET (3 kinds)    | task.created NOT yet emitted to outbox (task-repo has no writeOutbox call); Phase 8 must add outbox emission + worker consumer                                                                               |
| PWAX-06 | Push deep-links to `/budgets/[id]/[tab]?task=<id>` with task expanded           | D-PH7-30 URL contract locked; tab page reads `?task=<id>` param — consumer wiring is Phase 8 work                                                                                                            |
| I18N-01 | All v1.1 keys in EN/PL/UK simultaneously                                        | Catalogs exist (1126 lines each); completeness gate not yet implemented in CI                                                                                                                                |
| I18N-02 | Remove `workspaces.*`/`accounts.*` namespaces                                   | Only one residual `no_workspaces` key found in en.json (benign rename needed); top-level namespace keys are already `budgets`, `budget`, etc.                                                                |
| I18N-03 | Intl.NumberFormat for money                                                     | `cents-format.ts` exists; audit needed for consistent usage                                                                                                                                                  |
| I18N-04 | Temporal + Intl.DateTimeFormat for dates                                        | `temporal-polyfill` installed; audit date formatting consistency                                                                                                                                             |
| I18N-05 | `users.locale` persisted and switchable                                         | Column exists (`text("locale").notNull().default("en")`); `LocaleCookieSync` + `budget-locale` cookie already wired; PATCH endpoint for locale update needed                                                 |
| E2EX-01 | Existing features migrated to new IA                                            | Features already use new IA (budgets/wallets URLs); audit confirms correct entity names                                                                                                                      |
| E2EX-02 | Page Objects for renamed entities                                               | BdpPo, ReservesPo, WalletsPo, SettingsPo, etc. exist; no SpendingsPo or OnboardingPo found                                                                                                                   |
| E2EX-03 | 6 required flow scenarios                                                       | quick-entry: partially in tasks.feature; recurring draft confirm: MISSING; reserve auto-deduct: partially in reserves.feature; cushion toggle: MISSING; share-link join: MISSING; onboarding wizard: MISSING |
| E2EX-04 | Fresh-user-per-scenario fixture retained                                        | `fresh-user-per-scenario.ts` exists and is current                                                                                                                                                           |
| E2EX-05 | E2E green against PLAYWRIGHT_BASE_URL                                           | Makefile `test-e2e` reads from .env.local; pattern established                                                                                                                                               |

</phase_requirements>

---

## Summary

Phase 8 inherits a well-constructed foundation. The Serwist service worker is live, battle-tested, and already handles the offline redirect-loop problem. The server-side idempotency system is complete (middleware + Postgres table + worker cleanup). The next-intl i18n routing is established with `budget-locale` cookie sync and `users.locale` column already present. The playwright-bdd Gherkin suite exists with correct new-IA entity names.

The three major gaps that require net-new work: (1) **IndexedDB offline cache** — the `idb` library is not installed; there is no client-side cache layer yet; (2) **VAPID web-push pipeline** — `web-push` package not installed, no push subscription table, no notification prefs table, no outbox emission from task-repo (confirmed: zero `writeOutbox` calls in task-repo.ts); (3) **E2E coverage gaps** — four of six required E2E flows are missing features (recurring draft confirm, cushion toggle, share-link join, onboarding wizard).

The i18n situation is better than feared: the `workspaces.*` / `accounts.*` stale-namespace problem reduces to a single `no_workspaces` key in `nav` namespace (not a top-level namespace), and all catalog files already have parity at 1126 lines each. The main i18n work is: adding new keys for push prefs / offline/sync UI / install banner; implementing the CI completeness gate; and wiring a PATCH endpoint to update `users.locale`.

**Primary recommendation:** Structure Phase 8 into four parallel plan tracks — (A) Offline/IndexedDB, (B) Push/VAPID, (C) i18n completion, (D) E2E audit-and-fill — with a Wave 0 that installs missing packages and a final Wave N that runs all CI gates.

---

## Architectural Responsibility Map

| Capability                   | Primary Tier         | Secondary Tier | Rationale                                                                    |
| ---------------------------- | -------------------- | -------------- | ---------------------------------------------------------------------------- |
| IndexedDB read/write cache   | Browser/Client       | —              | Cache lives in the browser; SW only coordinates staleness markers            |
| Offline queue (pending txns) | Browser/Client       | Service Worker | Queue stored in IndexedDB; SW `sync` event or `online` event triggers replay |
| Sync-on-reconnect replay     | Browser/Client       | API/Backend    | Client reads queue, replays POST with Idempotency-Key; API deduplicates      |
| SW navigation fallback       | Service Worker       | —              | Already implemented; serves precached /offline.html                          |
| VAPID key pair               | API/Backend          | —              | Private key server-only; public key exposed to client for subscription       |
| Push subscription storage    | API/Backend          | Database       | push_subscriptions table; RLS-scoped per user                                |
| Notification preferences     | API/Backend          | Database       | notification_prefs table; per-budget/per-kind toggles                        |
| Push dispatch                | Worker               | API/Backend    | Worker subscribes to `task.created` outbox event via event bus               |
| task.created outbox emission | API/Backend          | —              | task-repo.ts must call writeOutbox on every INSERT into tasks                |
| Deep-link ?task= consumer    | Browser/Client (RSC) | —              | Tab page reads searchParam, expands banner row                               |
| i18n catalog                 | Build-time           | —              | Messages bundled at build time; CI gate at build step                        |
| users.locale persistence     | API/Backend          | Browser/Client | PATCH users/:id or PATCH /settings/locale; cookie sync on client             |
| PWA install prompt           | Browser/Client       | —              | beforeinstallprompt captured in client component                             |
| E2E scenarios                | Test layer           | —              | playwright-bdd .feature files + Page Objects                                 |

---

## Standard Stack

### Core (already installed)

| Library          | Version | Purpose                    | Status                                                 |
| ---------------- | ------- | -------------------------- | ------------------------------------------------------ |
| serwist          | 9.5.11  | Service worker framework   | Installed, wired [VERIFIED: npm view]                  |
| @serwist/next    | 9.5.11  | Next.js SW integration     | Installed, wired [VERIFIED: npm view]                  |
| next-intl        | ^4.4.3  | i18n routing + messages    | Installed, routing configured [VERIFIED: package.json] |
| playwright-bdd   | ^8      | Gherkin BDD for Playwright | Installed, suite active [VERIFIED: package.json]       |
| @playwright/test | 1.55.1  | E2E test runner            | Installed [VERIFIED: package.json]                     |

### To Install (Wave 0)

| Library         | Version | Purpose                              | Why                                                                                                        |
| --------------- | ------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| idb             | 8.0.3   | IndexedDB promise wrapper            | Typed, tree-shakable; official Google recommendation; avoids raw IDBRequest callbacks [VERIFIED: npm view] |
| web-push        | 3.6.7   | VAPID key generation + push dispatch | Node.js VAPID standard; already in CLAUDE.md stack [VERIFIED: npm view]                                    |
| @types/web-push | ^3.6.x  | Types for web-push                   | Dev dependency [ASSUMED: standard pattern]                                                                 |

**Installation:**

```bash
# In apps/web:
bun add idb

# In apps/worker or packages/platform (where push dispatch lives):
bun add web-push
bun add -d @types/web-push
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  ├── QuickEntryInput
  │     ├─[online]──→ POST /budgets/:id/transactions (Idempotency-Key) ──→ API
  │     └─[offline]─→ IndexedDB offline-queue
  │
  ├── IndexedDB (idb)
  │     ├── cache store: budgets / wallets / categories / transactions-by-month
  │     └── offline-queue store: pending txns (idempotency key + payload)
  │
  ├── online event / SW sync
  │     └──→ replay offline-queue ──→ POST (Idempotency-Key) ──→ API
  │                                         ↓ 2xx → remove from queue
  │                                         ↓ 4xx domain error → sync-issues list
  │
  ├── Service Worker (sw.ts — Serwist)
  │     ├── precache: /offline.html + static assets
  │     ├── /api/* → NetworkOnly (never cached — T-9)
  │     ├── navigate → network-first → /offline.html fallback
  │     └── [Phase 8] notificationclick → deep-link navigation
  │
  └── Push subscription
        └──→ stored in API (push_subscriptions table)

API (Hono/Bun)
  ├── POST /budgets/:id/tasks/:id/... (generators emit tasks)
  │     └── task-repo.ts ──→ INSERT tasks + writeOutbox(task.created)  [NEW Phase 8]
  │
  ├── POST /push/subscribe          [NEW Phase 8]
  ├── DELETE /push/subscribe        [NEW Phase 8]
  ├── GET/PATCH /push/preferences   [NEW Phase 8]
  └── PATCH /users/locale           [NEW Phase 8 or extend existing]

Worker (pg-boss)
  ├── outbox-dispatch (every 1 min)
  │     └── dispatchOutboxBatch() ──→ eventBus.publish("task.created")
  │                                         ↓
  │                               push-notification handler [NEW Phase 8]
  │                                         ↓
  │                               lookup prefs → web-push.sendNotification()
  │
  └── (existing: fx-daily-fetch, recurring-engine, budgeting-reconciliation)
```

### Recommended Project Structure (new files)

```
packages/platform/src/push/
  ├── vapid.ts              # VAPID key generation + sendPush helper (wraps web-push)
  ├── schema.ts             # push_subscriptions + notification_prefs Drizzle tables
  └── index.ts

packages/budgeting/src/application/
  └── (no change — task generators already call task-repo)

apps/worker/src/handlers/
  └── push-notification-handler.ts   # subscribes to task.created, dispatches push

apps/api/src/routes/
  └── push.ts                         # subscribe/unsubscribe/prefs endpoints

apps/web/src/lib/
  └── offline-cache.ts                # idb wrapper: openDB, read/write helpers

apps/web/src/lib/
  └── offline-queue.ts                # pending-txn queue: enqueue, dequeue, getAll

apps/web/src/hooks/
  └── use-online-sync.ts              # window.online listener → replay queue

apps/web/src/components/common/
  ├── install-banner.tsx              # beforeinstallprompt capture + banner
  ├── offline-status-badge.tsx        # global nav queue badge
  └── sync-issues-list.tsx            # failed-replay items

apps/web/e2e/features/
  ├── spendings.feature               # quick-entry + offline replay [NEW/FILL]
  ├── recurring-draft.feature         # draft confirm flow [NEW]
  ├── cushion.feature                 # cushion toggle [NEW]
  └── share-link.feature              # join flow [NEW]

apps/web/e2e/page-objects/
  ├── SpendingsPo.ts                  # [NEW]
  ├── OnboardingPo.ts                 # [NEW]
  └── ShareLinkPo.ts                  # [NEW]
```

### Pattern 1: idb IndexedDB Cache

Open a versioned DB; write on every successful React Query fetch; read synchronously when the query returns stale-or-offline.

```typescript
// Source: idb npm package documentation [CITED: https://github.com/jakearchibald/idb]
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "budget-cache";
const DB_VERSION = 1; // bump on schema change

export async function openBudgetDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // keyed by budgetId
      db.createObjectStore("budgets", { keyPath: "id" });
      db.createObjectStore("wallets", { keyPath: "id" });
      db.createObjectStore("categories", { keyPath: "id" });
      // keyed by composite "budgetId:YYYY-MM"
      db.createObjectStore("transactions", { keyPath: "_cacheKey" });
      // offline write queue — keyed by idempotencyKey
      db.createObjectStore("offline-queue", { keyPath: "idempotencyKey" });
      // metadata: { key: "budgetId", lastSyncedAt: ISO string }
      db.createObjectStore("sync-meta", { keyPath: "key" });
    },
  });
}
```

**Cache version strategy:** `DB_VERSION` is a constant in `offline-cache.ts`. Bump it when the shape of any store changes. Serwist precache version (`STYLE_CACHE`/`SCRIPT_IMAGE_CACHE`) is separate — IDB version is application data schema, not asset cache.

**Cache wipe on logout/tenant-switch:** call `indexedDB.deleteDatabase(DB_NAME)` from the sign-out handler and the tenant-switch handler. The existing `cross-tenant-cache.spec.ts` guards this invariant.

### Pattern 2: Offline Quick-Entry Replay

```typescript
// apps/web/src/hooks/use-create-transaction.ts (extend existing)
// When offline: enqueue to IndexedDB instead of POST
// When online: replay queue items with original Idempotency-Key

// Reconnect handler (use-online-sync.ts)
window.addEventListener("online", async () => {
  const queue = await getOfflineQueue(); // read from IndexedDB
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
        await removeFromQueue(item.idempotencyKey); // success
      } else {
        await markQueueItemFailed(item.idempotencyKey, await res.text()); // sync-issues
      }
    } catch {
      // network still down — leave in queue
    }
  }
});
```

**Key insight:** The server-side idempotency middleware already handles the deduplication. The client only needs to keep the same UUID for replay. The middleware will return the cached 2xx response on the second attempt — no double-write.

### Pattern 3: VAPID Push Dispatch

The task-repo must emit `task.created` into the outbox. The worker's outbox-dispatch handler will call `eventBus.publish("task.created")`. A new push handler subscribes to that event type and dispatches via `web-push`.

```typescript
// packages/budgeting/src/adapters/persistence/task-repo.ts (CHANGE NEEDED)
// Add after every INSERT into tasks:
await writeOutbox(tx, {
  tenantId,
  aggregateType: "task",
  aggregateId: taskId,
  eventType: "task.created",
  payloadJsonb: { kind, budgetId, taskId, payload },
});
```

```typescript
// apps/worker/src/handlers/push-notification-handler.ts (NEW)
import { eventBus } from "@budget/platform";
import webPush from "web-push";

// Notification type registry — extensible per D-11
const NOTIFICATION_TYPES: Record<
  string,
  {
    title: (locale: string) => string;
    body: (locale: string) => string;
    tab: string;
  }
> = {
  RESERVE_TOPUP: {
    title: (l) =>
      l === "pl"
        ? "Rezerwa wymaga uzupełnienia"
        : l === "uk"
          ? "Резерв потребує поповнення"
          : "Reserve needs attention",
    body: (l) =>
      l === "pl"
        ? "Przejdź do zakładki Rezerwy"
        : l === "uk"
          ? "Перейдіть до вкладки Резерви"
          : "Go to Reserves tab",
    tab: "reserves",
  },
  CONFIRM_DRAFT: {
    title: (l) =>
      l === "pl"
        ? "Szkic do potwierdzenia"
        : l === "uk"
          ? "Чернетка потребує підтвердження"
          : "A draft needs confirming",
    body: (l) =>
      l === "pl"
        ? "Przejdź do zakładki Wydatki"
        : l === "uk"
          ? "Перейдіть до вкладки Витрати"
          : "Go to Spendings tab",
    tab: "spendings",
  },
  CUSHION_BELOW_TARGET: {
    title: (l) =>
      l === "pl"
        ? "Poduszka poniżej celu"
        : l === "uk"
          ? "Подушка нижче цільового рівня"
          : "Cushion below target",
    body: (l) =>
      l === "pl"
        ? "Przejdź do zakładki Portfele"
        : l === "uk"
          ? "Перейдіть до вкладки Гаманці"
          : "Go to Wallets tab",
    tab: "wallets",
  },
};

eventBus.subscribe("task.created", async (evt) => {
  const { kind, budgetId, taskId } = evt.payload as {
    kind: string;
    budgetId: string;
    taskId: string;
  };
  const notifType = NOTIFICATION_TYPES[kind];
  if (!notifType) return; // unknown kind — registry miss, safe to skip

  // Lookup subscriptions + prefs for this budget/kind
  const subscriptions = await getPushSubscriptionsForBudget(
    evt.tenantId,
    budgetId,
    kind,
  );
  for (const sub of subscriptions) {
    const tab = notifType.tab;
    const url = `/budgets/${budgetId}/${tab}?task=${taskId}`;
    await webPush.sendNotification(
      sub.endpoint,
      JSON.stringify({
        title: notifType.title(sub.locale),
        body: notifType.body(sub.locale), // D-15: no financials
        url,
      }),
    );
  }
});
```

### Pattern 4: Service Worker notificationclick Handler

```typescript
// apps/web/sw.ts — ADD to existing file
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    (self as any).clients
      .matchAll({ type: "window" })
      .then((clients: any[]) => {
        const existing = clients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return (self as any).clients.openWindow(url);
      }),
  );
});
```

### Pattern 5: next-intl Completeness Gate

```typescript
// scripts/check-i18n-completeness.ts (NEW — run in CI)
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
for (const key of flatKeys(pl)) {
  if (!enKeys.has(key)) missing.pl.push(key);
}
for (const key of flatKeys(uk)) {
  if (!enKeys.has(key)) missing.uk.push(key);
}
// ... EN keys missing from PL/UK
if (missing.pl.length || missing.uk.length) {
  process.exit(1);
}
```

Add `"check:i18n": "bun scripts/check-i18n-completeness.ts"` to the CI pipeline.

### Anti-Patterns to Avoid

- **Caching `/api/*` in the SW**: already guarded by the NetworkOnly rule in sw.ts (T-9 security). Never add a runtime cache rule that matches `/api/`.
- **Using SW `sync` Background Sync API without a polyfill**: Background Sync is not available in Firefox or Safari. Use `window.online` event + manual replay instead.
- **Storing financials in push payload**: D-15 locks this — payload body must be generic strings only.
- **VAPID private key in the frontend**: Private key must only live in the API/worker env. The public key is safe to expose for `PushManager.subscribe()`.
- **Re-generating VAPID keys per deploy**: VAPID keys must be stable. Changing them invalidates all existing subscriptions. Generate once, store in Infisical.

---

## Don't Hand-Roll

| Problem                     | Don't Build                | Use Instead                        | Why                                                           |
| --------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| IndexedDB Promise API       | Raw IDBRequest callbacks   | `idb` 8.0.3                        | Handles version upgrades, typed stores, proper error handling |
| VAPID key generation        | Custom crypto              | `web-push` `generateVAPIDKeys()`   | Standards-compliant P-256 key pair                            |
| Push notification send      | Raw fetch to push endpoint | `web-push.sendNotification()`      | Handles TTL, urgency, content encoding (aes128gcm)            |
| i18n key completeness check | Manual catalog diff        | CI script + `flatKeys()` traversal | Flat-key extraction is ~20 lines; do it once                  |
| SW cache wipe on logout     | Custom cache enumeration   | `indexedDB.deleteDatabase()`       | Single call wipes all stores atomically                       |

---

## Runtime State Inventory

> Not a rename/refactor phase. No runtime state migration required.

| Category            | Items Found                                                             | Action Required                      |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| Stored data         | No push_subscriptions or notification_prefs tables exist yet            | New tables via migration             |
| Live service config | worker.ts has no push-notification handler registered                   | New handler added in Phase 8         |
| OS-registered state | None — no Phase 8 OS registrations                                      | None                                 |
| Secrets/env vars    | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT not yet in Infisical | Generate + store before first deploy |
| Build artifacts     | None — no stale artifacts from prior phases affect Phase 8              | None                                 |

---

## Common Pitfalls

### Pitfall 1: task.created outbox emission is missing from task-repo

**What goes wrong:** Phase 8 wires the push worker to consume `task.created` outbox events, but no events are ever emitted because `task-repo.ts` has zero `writeOutbox` calls. Push never fires.

**Why it happens:** Phase 7 planned to add outbox emission but deferred it to Phase 8 (confirmed by Phase 7 CONTEXT.md: "Phase 7 emits `task.created`; Phase 8 will consume"). Direct codebase inspection shows zero `writeOutbox` calls in task-repo.ts.

**How to avoid:** Wave 1 of the push plan must add `writeOutbox` to task-repo. All three emit paths (emitReserveTopup, emitConfirmDraft, emitCushionBelowTarget) must call it. Write a test that verifies a row appears in `shared_kernel.outbox` after task creation.

**Warning signs:** Push never fires in integration test even though worker is running.

### Pitfall 2: Cache schema drift between IndexedDB and API DTOs

**What goes wrong:** A future schema change updates the API DTO shape but the IndexedDB store still returns old-shaped objects. UI breaks on cached reads.

**Why it happens:** The DB_VERSION integer is the only version guard; if it is not bumped, old objects persist silently.

**How to avoid:** Co-locate `DB_VERSION` with the Zod schemas that define cache object shapes. Add a unit test that validates a stored and retrieved object against the same Zod schema used for API responses.

**Warning signs:** Type errors at runtime on cached reads but not on fresh network reads.

### Pitfall 3: Serwist SW disabled in development — offline features invisible until production build

**What goes wrong:** `next.config.mjs` disables Serwist when `NODE_ENV === "development"`. All offline/IndexedDB testing must happen against a production build (`NODE_ENV=production`). Tests that assume SW is active fail in dev.

**How to avoid:** E2E tests that cover offline scenarios must run against a production build or set `DISABLE_SW=0` with a production-mode build. The `server-down.spec.ts` already handles this — follow its pattern.

**Warning signs:** `navigator.serviceWorker.controller` is `null` in tests.

### Pitfall 4: VAPID private key rotation invalidates all subscriptions

**What goes wrong:** Regenerating VAPID keys (e.g., during a fresh Docker build) silently invalidates all existing `PushSubscription` objects stored in the database. Push calls return 410 Gone and new subscriptions are required.

**How to avoid:** Generate VAPID keys exactly once, store in Infisical (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Never regenerate unless all subscriptions are deliberately dropped. Handle 410/404 responses from push endpoints by deleting the stale subscription record.

**Warning signs:** Push sends return HTTP 410/404 for all subscriptions after a redeploy.

### Pitfall 5: `background sync` API not universally supported

**What goes wrong:** SW Background Sync (`self.registration.sync.register('offline-queue')`) only works in Chromium. Firefox and Safari silently ignore it. On those browsers, queued txns never replay.

**How to avoid:** Use `window.addEventListener('online', ...)` as the primary replay trigger. Background Sync is an optional enhancement on top, not the sole mechanism.

**Warning signs:** Offline txns replay on Chrome but not Firefox/Safari.

### Pitfall 6: i18n catalog build-time bundle — edits require Docker rebuild

**What goes wrong:** After adding new message keys, the running web container still serves the old bundle. Push prefs UI shows raw key strings.

**How to avoid:** Memory `feedback_always_rebuild_web` — `make restart-web` after any `messages/*.json` edit. The CI completeness gate catches missing keys before the image is built.

**Warning signs:** UI shows `push.prefs.title` literally instead of the translated string.

### Pitfall 7: E2E Page Objects target tab URL slugs without a SpendingsPo

**What goes wrong:** The quick-entry scenario needs a Page Object for the Spendings tab, but `SpendingsPo.ts` does not exist. Steps either have no PO or inline selectors, breaking the "all E2E via Page Objects" convention.

**How to avoid:** Wave 0 of the E2E plan creates `SpendingsPo.ts`, `OnboardingPo.ts`, `ShareLinkPo.ts`.

### Pitfall 8: Manifest icons — `purpose: "any maskable"` on same src is incorrect

**What goes wrong:** The current manifest.json sets `"purpose": "any maskable"` on both icons with the same image file. Chrome's PWA install criteria require a dedicated maskable icon (safe-zone rules). Using a non-maskable image as maskable causes install badge to show incorrectly.

**How to avoid:** Provide separate `purpose: "maskable"` icons with content in the safe zone (inner 80%), or set `purpose: "any"` only if the image is not specifically designed as maskable. Phase 8 plan should include a manifest audit step.

---

## Code Examples

### idb store read with "unavailable offline" fallback

```typescript
// Source: idb documentation + D-04 decision
export async function getCachedBudget(budgetId: string) {
  const db = await openBudgetDB();
  const cached = await db.get("budgets", budgetId);
  return cached ?? null; // null → caller renders "unavailable offline" state
}
```

### Enqueue offline transaction

```typescript
export async function enqueueOfflineTxn(txn: {
  budgetId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
}) {
  const db = await openBudgetDB();
  await db.put("offline-queue", txn);
}
```

### Subscribe to push in browser

```typescript
// Source: MDN Push API [CITED: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe]
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  ),
});
// POST subscription object to /push/subscribe
```

### Generate VAPID keys (one-time, run in Node/Bun)

```typescript
import webPush from "web-push";
const { publicKey, privateKey } = webPush.generateVAPIDKeys();
// Store in Infisical: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// VAPID_SUBJECT = "mailto:admin@budget.app"
```

### Wipe IndexedDB on logout

```typescript
// Call from sign-out handler BEFORE redirect
export async function wipeBudgetCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("budget-cache");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

---

## State of the Art

| Old Approach                    | Current Approach                        | Impact                             |
| ------------------------------- | --------------------------------------- | ---------------------------------- |
| next-pwa (unmaintained)         | Serwist (@serwist/next 9.x)             | Already adopted; App Router native |
| Raw IDBRequest callbacks        | `idb` 8.x promise wrapper               | Install needed; standard pattern   |
| Background Sync API only        | online event + Background Sync optional | Cross-browser reliability          |
| Hardcoded notification dispatch | Extensible notification-type registry   | D-11 requirement; future-proof     |

**Deprecated/outdated:**

- `STALE_WALLET` and `MONTH_END_REVIEW` task kinds: dropped from v1.1, never existed in DB; REQUIREMENTS.md PWAX-05 text is stale — ignore it.
- `workspaces.*` / `accounts.*` i18n namespaces: only one residual string found (`no_workspaces` inside the `nav` namespace key, which is not a top-level namespace namespace mismatch — it's a value string containing the old product copy). Scope is a single key rename.

---

## Codebase Findings Summary

### What exists and works (extend, don't rebuild)

| Asset                             | File                                                    | Status                                                                                                                    |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Serwist SW                        | `apps/web/sw.ts`                                        | Live; handles offline fallback, T-9 security, cache purge                                                                 |
| SW offline logic (pure, testable) | `apps/web/sw-offline.ts`                                | Tested; handles redirect-loop fix                                                                                         |
| Offline fallback HTML             | `apps/web/public/offline.html`                          | Precached; served on total outage                                                                                         |
| PWA manifest                      | `apps/web/public/manifest.json`                         | Exists; needs icon audit                                                                                                  |
| Idempotency middleware            | `packages/platform/src/idempotency/middleware.ts`       | Full server-side dedup: scope_hash + body_hash + SELECT FOR UPDATE                                                        |
| Idempotency cleanup worker        | `apps/worker/src/handlers/idempotency-cleanup.ts`       | Hourly pg-boss job                                                                                                        |
| Client idempotency key gen        | `apps/web/src/lib/idempotency.ts`                       | `generateIdempotencyKey()` using crypto.randomUUID                                                                        |
| `use-create-transaction` hook     | `apps/web/src/hooks/use-create-transaction.ts`          | Sends `Idempotency-Key` header; optimistic + unsent flag pattern established                                              |
| `users.locale` column             | `packages/identity/src/adapters/persistence/schema.ts`  | `text("locale").notNull().default("en")` — no migration needed                                                            |
| Locale cookie sync                | `apps/web/src/components/common/locale-cookie-sync.tsx` | `budget-locale` cookie kept in sync with account locale                                                                   |
| next-intl routing                 | `apps/web/i18n/routing.ts`                              | `locales: ["en","pl","uk"]`, `localePrefix: "always"`                                                                     |
| Middleware locale guard           | `apps/web/src/middleware.ts`                            | Redirects URL locale to match account locale                                                                              |
| Message catalogs                  | `apps/web/messages/{en,pl,uk}.json`                     | 1126 lines each; single residual `no_workspaces` string                                                                   |
| Outbox infrastructure             | `packages/platform/src/outbox/`                         | `writeOutbox`, `dispatchOutboxBatch`, `eventBus` all exist                                                                |
| E2E Gherkin suite                 | `apps/web/e2e/features/`                                | 5 .feature files, 29 scenarios; new IA entity names                                                                       |
| Fresh-user fixture                | `apps/web/e2e/fixtures/fresh-user-per-scenario.ts`      | Active; creates user + budget per scenario                                                                                |
| Page Objects                      | `apps/web/e2e/page-objects/`                            | BdpPo, BdpTabsPo, HomePo, ReservesPo, SettingsPo, WalletsPo, TopNavPo, SwitcherPo, PillTaskSliderPo                       |
| ci-gate tenant-leak tests         | `tests/tenant-leak/`                                    | 7 files (budgets-active-tasks-count, spendings-summary, cushion-summary, drafts-dismiss, tasks, sort-order, home-summary) |

### What is MISSING (must be built in Phase 8)

| Gap                                      | Impact                                       |
| ---------------------------------------- | -------------------------------------------- |
| `task-repo.ts` has no `writeOutbox` call | Push never fires without this                |
| `idb` package not installed              | No IndexedDB cache layer possible            |
| `web-push` package not installed         | Cannot dispatch VAPID push                   |
| No `push_subscriptions` table            | Cannot store browser push endpoints          |
| No `notification_prefs` table            | Cannot implement per-budget/per-kind toggles |
| No VAPID keys in env/Infisical           | Must generate once before deploy             |
| No push routes (`/push/*`) in API        | Cannot subscribe/unsubscribe from browser    |
| No push handler in worker                | No consumer of `task.created` event          |
| No `PATCH /users/locale` endpoint        | Cannot persist locale changes from UI        |
| No CI i18n completeness gate             | Missing keys can slip through                |
| `SpendingsPo.ts` missing                 | E2E quick-entry scenario has no Page Object  |
| `OnboardingPo.ts` missing                | E2E onboarding scenario has no Page Object   |
| `ShareLinkPo.ts` missing                 | E2E share-link join has no Page Object       |
| `spendings.feature` missing              | Quick-entry + offline scenarios not covered  |
| `recurring-draft.feature` missing        | Recurring draft confirm flow not covered     |
| `cushion.feature` missing                | Cushion toggle flow not covered              |
| `share-link.feature` missing             | Share-link recipient join not covered        |

---

## Environment Availability

| Dependency             | Required By                     | Available               | Version | Fallback                              |
| ---------------------- | ------------------------------- | ----------------------- | ------- | ------------------------------------- |
| Bun                    | All                             | ✓                       | 1.2.x   | —                                     |
| Node.js (for npm view) | Version checks                  | ✓                       | —       | —                                     |
| Docker                 | Integration tests + web rebuild | ✓ assumed               | —       | —                                     |
| Infisical CLI          | Secrets + make targets          | ✓ assumed (in Makefile) | —       | —                                     |
| idb                    | IndexedDB cache                 | ✗                       | —       | Install in Wave 0                     |
| web-push               | VAPID dispatch                  | ✗                       | —       | Install in Wave 0                     |
| @types/web-push        | TypeScript types                | ✗                       | —       | Install in Wave 0                     |
| VAPID_PUBLIC_KEY       | Push subscribe                  | ✗                       | —       | Generate + add to Infisical in Wave 0 |
| VAPID_PRIVATE_KEY      | Push dispatch                   | ✗                       | —       | Generate + add to Infisical in Wave 0 |

**Missing dependencies with no fallback (block execution):**

- VAPID keys — must be generated and stored in Infisical before the push plan executes

**Missing dependencies with fallback (install in Wave 0):**

- `idb`, `web-push`, `@types/web-push` — install commands above

---

## Validation Architecture

### Test Framework

| Property              | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Backend unit          | `bun:test` — `make test`                                            |
| Frontend component    | Vitest 4 + happy-dom — `cd apps/web && bun run test`                |
| E2E                   | playwright-bdd — `make test-e2e`                                    |
| CI gate (tenant-leak) | `make ci-gate`                                                      |
| Quick E2E run         | `cd apps/web && bunx bddgen && bunx playwright test --grep @phase8` |

### Phase Requirements → Test Map

| Req ID  | Behavior                                   | Test Type              | Automated Command                                           | Gap?               |
| ------- | ------------------------------------------ | ---------------------- | ----------------------------------------------------------- | ------------------ |
| PWAX-01 | SW registered, manifest valid              | Smoke / manual install | Playwright `server-down.spec.ts` covers SW registration     | No new test needed |
| PWAX-02 | IndexedDB cache reads offline              | Component + E2E        | New: `offline-cache.test.ts` (Vitest); E2E offline scenario | Wave 0 gap         |
| PWAX-03 | Offline queue replay deduped               | Unit + E2E             | New: `offline-queue.test.ts`; E2E @phase8 offline scenario  | Wave 0 gap         |
| PWAX-04 | VAPID subscribe/unsubscribe round-trip     | Integration            | New: `apps/api/test/routes/push.test.ts`                    | Wave 0 gap         |
| PWAX-05 | Push fires on task.created, respects prefs | Integration            | New: push-notification-handler.test.ts                      | Wave 0 gap         |
| PWAX-06 | Deep-link opens tab with task expanded     | E2E                    | New: push deep-link E2E scenario                            | Wave 0 gap         |
| I18N-01 | All keys present in all locales            | CI script              | New: `scripts/check-i18n-completeness.ts`                   | Wave 0 gap         |
| I18N-02 | No `workspaces.*`/`accounts.*` keys        | CI script (grep gate)  | Add to completeness script                                  | Wave 0 gap         |
| I18N-03 | Intl.NumberFormat used for money           | Component unit         | Vitest: audit `cents-format.ts` usage                       | Audit needed       |
| I18N-04 | Temporal + Intl.DateTimeFormat for dates   | Component unit         | Vitest: date rendering components                           | Audit needed       |
| I18N-05 | users.locale persisted + switchable        | Integration + E2E      | New: PATCH /users/locale integration test                   | Wave 0 gap         |
| E2EX-01 | Existing features green on new IA          | E2E                    | `make test-e2e` on existing suite                           | Run and verify     |
| E2EX-02 | Page Objects target renamed entities       | E2E                    | New POs created; existing scenarios pass                    | Wave 0 gap         |
| E2EX-03 | 6 required flows covered                   | E2E                    | 4 new .feature files                                        | Wave 0 gap         |
| E2EX-04 | Fresh-user-per-scenario fixture            | E2E                    | Fixture already active                                      | No gap             |
| E2EX-05 | E2E green against PLAYWRIGHT_BASE_URL      | E2E                    | `make test-e2e`                                             | Verify after fills |

### Sampling Rate

- **Per task commit:** `cd apps/web && bun run test` (Vitest) + affected unit tests
- **Per wave merge:** `make test && cd apps/web && bun run test && make ci-gate`
- **Phase gate:** Full `make test-e2e` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/web/test/offline-cache.test.ts` — covers PWAX-02 IndexedDB cache
- [ ] `apps/web/test/offline-queue.test.ts` — covers PWAX-03 queue enqueue/replay
- [ ] `apps/api/test/routes/push.test.ts` — covers PWAX-04 subscribe/unsubscribe routes
- [ ] `apps/worker/test/push-notification-handler.test.ts` — covers PWAX-05
- [ ] `scripts/check-i18n-completeness.ts` — covers I18N-01/02
- [ ] `apps/web/e2e/page-objects/SpendingsPo.ts` — covers E2EX-02/03
- [ ] `apps/web/e2e/page-objects/OnboardingPo.ts` — covers E2EX-02/03
- [ ] `apps/web/e2e/page-objects/ShareLinkPo.ts` — covers E2EX-02/03

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                            |
| --------------------- | ------- | --------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Push subscription endpoint requires Better Auth session                     |
| V3 Session Management | yes     | Push prefs scoped to authenticated user; SW excludes /api/\* (T-9 in place) |
| V4 Access Control     | yes     | push_subscriptions RLS-scoped per user; notification_prefs RLS per tenant   |
| V5 Input Validation   | yes     | Zod validates VAPID subscription objects and pref update payloads           |
| V6 Cryptography       | yes     | VAPID uses P-256 ECDH (web-push) — never hand-roll                          |

### Known Threat Patterns

| Pattern                                     | STRIDE            | Standard Mitigation                                                                   |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Cross-tenant push subscription leak         | Info Disclosure   | RLS on push_subscriptions; tenant_id FK + policy                                      |
| Stale VAPID key causing silent push failure | Denial of Service | Handle 410 from push endpoint by deleting subscription record                         |
| Financial data in push payload              | Info Disclosure   | D-15: generic copy only; no amounts/category names in payload                         |
| Offline cache served to wrong tenant        | Info Disclosure   | `wipeBudgetCache()` on logout/tenant-switch; `cross-tenant-cache.spec.ts` guards this |
| Replay attack on offline queue              | Tampering         | Idempotency-Key scoped to tenantId+userId+route (server-side SHA-256 hash)            |
| beforeinstallprompt not a security risk     | —                 | Install prompt is user-gesture-gated; no auth surface                                 |

---

## Assumptions Log

| #   | Claim                                                                                           | Section              | Risk if Wrong                                      |
| --- | ----------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| A1  | Phase 7 task generators are fully deployed and working (plans 07-01..07-10 all marked complete) | Standard Stack, Push | Push consumer would have nothing to consume        |
| A2  | `apps/web/public/offline.html` exists (referenced in sw.ts but not directly read)               | Architecture         | Offline fallback would 503 without inline fallback |
| A3  | Infisical is available and configured for VAPID secret storage                                  | Environment          | VAPID keys would need alternative storage          |

**All other claims in this document were verified by direct codebase inspection.**

---

## Open Questions

1. **Push subscription endpoint placement**
   - What we know: API has Hono routes; push subscription involves auth context (userId)
   - What's unclear: whether `/push/*` lives under `/api/push/*` or a separate service
   - Recommendation: Add under existing Hono `app.ts` as `/push/*` — same auth middleware applies

2. **PATCH /users/locale — route exists?**
   - What we know: `users.locale` column exists; no PATCH route found for it
   - What's unclear: whether Phase 6 Settings wired a locale update endpoint
   - Recommendation: Planner checks `apps/api/src/routes/` for a settings/users route; if absent, add `PATCH /users/locale` in Phase 8

3. **Background Sync registration in sw.ts**
   - What we know: Chromium supports Background Sync; Firefox/Safari do not
   - What's unclear: whether to add SW sync registration as enhancement on top of `online` event
   - Recommendation: Use `online` event as primary; add `sync` registration as progressive enhancement only if time allows

4. **05-15 / 05-16 plan status**
   - What we know: ROADMAP shows 05-15 and 05-16 as unchecked (not complete)
   - What's unclear: whether Phase 5 UI reshape is complete before Phase 8 begins
   - Recommendation: Phase 8 planner must verify Phase 5 completion state; if 05-15/05-16 are pending, they may affect which E2E Spendings/Reserves scenarios can be written

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `apps/web/sw.ts` — Serwist SW: strategies, T-9 denylist, cache names, offline fallback
- `apps/web/sw-offline.ts` — pure offline logic: buildOfflineDocument, handleNavigationRequest
- `apps/web/next.config.mjs` — Serwist config: swSrc, swDest, disable conditions
- `apps/web/public/manifest.json` — PWA manifest: current state
- `apps/web/src/lib/idempotency.ts` — client-side key generation
- `apps/web/src/hooks/use-create-transaction.ts` — Idempotency-Key usage pattern
- `apps/api/src/middleware/idempotency.ts` + `packages/platform/src/idempotency/middleware.ts` — server-side idempotency: scope_hash, body_hash, SELECT FOR UPDATE
- `packages/identity/src/adapters/persistence/schema.ts` — users.locale column confirmed
- `packages/budgeting/src/adapters/persistence/tasks-schema.ts` — tasks table: 3 kinds confirmed
- `packages/platform/src/outbox/dispatcher.ts` + `events/bus.ts` — outbox dispatch pipeline
- `packages/platform/src/outbox/writer.ts` (grep confirmed) — writeOutbox exists in platform
- `apps/worker/src/worker.ts` — worker bootstrap: registered handlers, no push handler present
- `apps/web/messages/en.json` — top-level namespace keys confirmed; single `no_workspaces` residual
- `apps/web/e2e/features/` — 5 feature files, 29 scenarios inventoried
- `apps/web/e2e/page-objects/` — 9 POs; SpendingsPo/OnboardingPo/ShareLinkPo absent
- `apps/web/i18n/routing.ts`, `apps/web/src/middleware.ts` — next-intl routing + locale cookie

### Secondary (MEDIUM confidence — npm registry)

- npm view serwist: 9.5.11 [VERIFIED]
- npm view @serwist/next: 9.5.11 [VERIFIED]
- npm view idb: 8.0.3 [VERIFIED]
- npm view web-push: 3.6.7 [VERIFIED]

### Tertiary (ASSUMED — standard patterns)

- idb library API shape (openDB, versioning) — well-documented; LOW risk
- web-push.generateVAPIDKeys() API — standard; LOW risk

---

## Metadata

**Confidence breakdown:**

- Offline cache design: HIGH — idb API is stable; server-side idempotency fully verified
- Push pipeline: HIGH — outbox infrastructure confirmed present; task-repo gap confirmed present
- i18n state: HIGH — catalog files directly read; namespace audit complete
- E2E gap analysis: HIGH — feature files directly listed; Page Object inventory complete
- VAPID key patterns: HIGH — web-push API is standard

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable libraries; Serwist 9.x API unlikely to change)
