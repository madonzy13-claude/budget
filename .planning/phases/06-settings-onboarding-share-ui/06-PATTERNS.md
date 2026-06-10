# Phase 6: Settings, Onboarding & Share UI — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 22 new/modified files
**Analogs found:** 21 / 22

---

## File Classification

| New/Modified File                                                                                                              | Role       | Data Flow        | Closest Analog                                                                                                | Match Quality |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| `apps/api/src/routes/budgets.ts` (MODIFY — add 5 endpoints)                                                                    | route      | request-response | `apps/api/src/routes/budgets.ts` (existing handlers)                                                          | exact         |
| `packages/tenancy/src/adapters/persistence/schema.ts` (MODIFY — add `archived_at`)                                             | schema     | CRUD             | same file, `cushionModeEnabled` column addition                                                               | exact         |
| `packages/tenancy/src/adapters/persistence/onboarding-progress-schema.ts` (NEW)                                                | schema     | CRUD             | `packages/budgeting/src/adapters/persistence/tasks-schema.ts`                                                 | role-match    |
| `apps/migrator/drizzle.config.ts` (MODIFY — add schema path)                                                                   | config     | —                | `apps/migrator/drizzle.config.ts` existing entries                                                            | exact         |
| `apps/web/src/components/ui/accordion.tsx` (NEW — shadcn)                                                                      | component  | event-driven     | `apps/web/src/components/ui/sheet.tsx`                                                                        | role-match    |
| `apps/web/src/components/ui/switch.tsx` (NEW — shadcn)                                                                         | component  | event-driven     | `apps/web/src/components/ui/checkbox.tsx`                                                                     | role-match    |
| `apps/web/src/components/settings/settings-accordion.tsx` (NEW)                                                                | component  | request-response | `apps/web/src/components/settings/display-currency-picker.tsx`                                                | role-match    |
| `apps/web/src/components/settings/share-url-field.tsx` (NEW)                                                                   | component  | event-driven     | `apps/web/src/components/settings/display-currency-picker.tsx`                                                | role-match    |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx` (FILL)                                                        | page       | request-response | `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx`                                               | role-match    |
| `apps/web/src/components/onboarding/wizard-stepper.tsx` (NEW)                                                                  | component  | event-driven     | `apps/web/src/components/budgeting/bdp-tabs.tsx`                                                              | partial       |
| `apps/web/src/components/onboarding/wizard-layout.tsx` (NEW)                                                                   | component  | request-response | `apps/web/src/components/workspace/create-workspace-form.tsx`                                                 | partial       |
| `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` (FILL)                                                                  | page       | request-response | `apps/web/src/components/workspace/create-workspace-form.tsx`                                                 | partial       |
| `apps/web/src/app/[locale]/budgets/join/[token]/page.tsx` (NEW — PUBLIC)                                                       | page       | request-response | `apps/api/src/routes/share-join.ts` (backend)                                                                 | partial       |
| `apps/web/src/components/share/join-page-card.tsx` (NEW)                                                                       | component  | request-response | `apps/web/src/components/auth/sign-in-form.tsx`                                                               | partial       |
| `apps/web/src/middleware.ts` (MODIFY — allowlist `/budgets/join`)                                                              | middleware | request-response | same file, existing `PROTECTED_ROUTES` pattern                                                                | exact         |
| `apps/web/messages/en.json` (MODIFY — add namespaces)                                                                          | config     | —                | same file, existing `settings.*` / `auth.*` namespaces                                                        | exact         |
| `apps/web/messages/pl.json` (MODIFY)                                                                                           | config     | —                | same file                                                                                                     | exact         |
| `apps/web/messages/uk.json` (MODIFY)                                                                                           | config     | —                | same file                                                                                                     | exact         |
| `apps/api/test/routes/budget-identity.test.ts` (NEW)                                                                           | test       | request-response | `apps/api/test/routes/budgets.test.ts`                                                                        | exact         |
| `apps/api/test/routes/budget-archive.test.ts` (NEW)                                                                            | test       | request-response | `apps/api/test/routes/budgets.test.ts`                                                                        | exact         |
| `apps/api/test/routes/budget-members.test.ts` (NEW)                                                                            | test       | request-response | `apps/api/test/routes/budgets.test.ts`                                                                        | exact         |
| `tests/e2e/features/settings/budget-settings.feature` + `pages/BudgetSettingsPage.ts` + `steps/budget-settings.steps.ts` (NEW) | test       | event-driven     | `tests/e2e/features/wallets/add-edit-drag-delete.feature` + `pages/WalletsPage.ts` + `steps/wallets.steps.ts` | exact         |

---

## Pattern Assignments

### 1. `apps/api/src/routes/budgets.ts` — 5 new endpoints

**Analog:** `apps/api/src/routes/budgets.ts` (existing handlers at lines 117–464) + `apps/api/src/routes/wallets.ts` (PATCH pattern lines 171–207, archive pattern lines 153–167)

**New endpoints to add:**

- `PATCH /:id` — budget identity (name, currency, cushion_mode_enabled)
- `GET /:id/members` — list members
- `POST /:id/members/:memberId/revoke` — remove member
- `POST /:id/archive` — soft-delete
- `POST /:id/delete` — hard-delete (typed-name confirmation)

**Registration order rule** (lines 84–96 of budgets.ts — critical):

```typescript
// Static paths BEFORE /:id. Pattern from existing GET /active + GET /health.
// New static sub-paths: GET /:id/members, POST /:id/archive, POST /:id/delete,
// POST /:id/members/:memberId/revoke — all sub-paths, safe from /:id collision.
// NEVER add bare DELETE /:id — conflicts with DELETE /share/:linkId (line 441).
```

**Auth + tenant gate pattern** (budgets.ts lines 117–141 — copy exactly):

```typescript
r.get("/:id", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const budgetId = c.req.param("id");
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404); // 404 not 403 — no existence leak
  }
  // ... call use case ...
});
```

**Owner-only gate** (budgets.ts lines 160–186 — copy for archive/delete/revoke):

```typescript
const lookup = await withBootstrapUserContext(
  UserId(session.user.id),
  async (tx) => {
    const result = await tx.execute(sql`
      SELECT bm.role::text AS role, b.kind::text AS kind, b.name AS name
        FROM tenancy.budget_members bm
        JOIN tenancy.budgets b ON b.id = bm.budget_id
       WHERE bm.budget_id = ${budgetId}::uuid
         AND bm.user_id = ${session.user.id}::uuid
       LIMIT 1
    `);
    return result.rows[0] as
      | { role: string; kind: string; name: string }
      | undefined;
  },
);
if (lookup.isErr()) return c.json({ error: "internal" }, 500);
if (!lookup.value) return c.json({ error: "Member not found" }, 404);
if (lookup.value.role !== "owner") return c.json({ error: "forbidden" }, 403);
```

**Zod + zValidator pattern** (budgets.ts lines 22–26, 403–411 — copy for PATCH):

```typescript
const patchBudgetSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  default_currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  cushion_mode_enabled: z.boolean().optional(),
});

r.patch("/:id", zValidator("json", patchBudgetSchema), async (c) => {
  const body = c.req.valid("json");
  // ...
});
```

**Error handling pattern** (budgets.ts lines 75–82, wallets.ts lines 200–206):

```typescript
if (r.isErr()) {
  const msg = r.error.message;
  if (msg === "not_found") return c.json({ error: "not_found" }, 404);
  return c.json({ error: msg }, 422);
}
return c.json(r.value, 200);
```

**Leave budget + last-owner** (budgets.ts lines 241–260 — already exists, do not duplicate):

```typescript
// POST /budgets/:id/leave already at line 241. Reuse as-is.
// "Cannot leave as last owner" → 409 already handled.
```

**Share link generation** (budgets.ts lines 402–438 — already exists):

```typescript
// POST /budgets/:id/share already at line 403. UI consumes directly.
```

**Cushion mode — CRITICAL DECISION POINT:**
The existing `POST /budget-settings/budget-mode` (`budget-settings.ts` line 17) calls `toggleBudgetMode` which writes SCD-2 `budget_mode_history`. It is **unknown** whether it also writes `budgets.cushion_mode_enabled`. Planner must resolve this before the cushion task:

- If `toggleBudgetMode` already syncs the boolean → Settings toggle calls `POST /budget-settings/budget-mode` with `{ mode: "CUSHION" | "NORMAL" }` (no new endpoint).
- If not → extend `toggleBudgetMode` to also write `cushion_mode_enabled`; do NOT add a divergent PATCH path.

**New `has_transactions` field on `GET /:id`** (extend lines 130–141):

```typescript
// Add to the existing GET /:id response:
return c.json({
  // ... existing fields ...
  hasTransactions: budget.hasTransactions ?? false, // cheap EXISTS query in workspaceRepo.findById
});
```

---

### 2. `packages/tenancy/src/adapters/persistence/schema.ts` — add `archived_at`

**Analog:** same file, `cushionModeEnabled` at line 37, `reservesEnabled` at line 43.

**Pattern** (schema.ts lines 36–43):

```typescript
// Add after reservesEnabled (line 43):
archivedAt: timestamp("archived_at", { withTimezone: true }),
// NULL = active, non-NULL = archived (D-09 soft-delete, no restore UI in v1.1)
```

No `pgPolicy` change — `archived_at` is on `budgets` which already has `budgets_tenant_isolation` policy (lines 45–53). The existing RLS covers it automatically.

---

### 3. `packages/tenancy/src/adapters/persistence/onboarding-progress-schema.ts` (NEW)

**Analog:** `packages/tenancy/src/adapters/persistence/schema.ts` (table declaration pattern lines 18–54) — but WITHOUT `pgPolicy` (not tenant-scoped).

**Pattern:**

```typescript
import { uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { tenancy } from "@budget/platform";

// NOTE: No pgPolicy — keyed by user_id, not tenant_id.
// Must be excluded from make ci-gate tenant-leak sweep (or placed in non-tenancy schema).
// Verify against apps/api/test/architecture/ sweep before landing.
export const onboardingProgress = tenancy.table("onboarding_progress", {
  userId: uuid("user_id").primaryKey(), // one row per user; auth enforced in handler
  step: integer("step").notNull().default(1),
  completedAt: timestamp("completed_at", { withTimezone: true }), // NULL = in progress
});
```

**Migrator registration** — add path to `apps/migrator/drizzle.config.ts` schema array (line 19 is the insert point, after the tenancy schema.ts entry):

```typescript
"../../packages/tenancy/src/adapters/persistence/schema.ts",
"../../packages/tenancy/src/adapters/persistence/onboarding-progress-schema.ts",  // NEW
```

---

### 4. `apps/web/src/middleware.ts` — allowlist `/budgets/join/*`

**Analog:** same file, `PROTECTED_ROUTES` + `AUTH_ROUTES` pattern (lines 8–10, 74–76).

**Change** (line 9 area — add join allowlist before the PROTECTED_ROUTES check):

```typescript
// Current line 9:
const PROTECTED_ROUTES = ["/onboarding", "/budgets", "/settings"];

// After change — add explicit public allowlist checked BEFORE PROTECTED_ROUTES:
const PUBLIC_BUDGET_PATHS = ["/budgets/join/"]; // share-link recipient view (SHRD-04)

// In the unauthenticated guard (line 74–76), add:
if (
  !isAuthenticated &&
  PROTECTED_ROUTES.some((r) => bare.startsWith(r)) &&
  !PUBLIC_BUDGET_PATHS.some((p) => bare.startsWith(p))
) {
  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
}

// Also add /onboarding → /budgets/new redirect (D-08, UI-SPEC line 283):
// Register as a middleware redirect before the auth checks.
```

---

### 5. `apps/web/src/components/settings/settings-accordion.tsx` (NEW)

**Analog:** `apps/web/src/components/settings/display-currency-picker.tsx` (client component + `useTranslations` + `toast` + `api` call pattern).

**Import pattern** (display-currency-picker.tsx lines 1–9):

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
// + new accordion imports after shadcn install:
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
```

**i18n key pattern** (display-currency-picker.tsx line 27):

```typescript
const t = useTranslations("settings"); // namespace for Phase 6 settings strings
```

**Toast pattern** (display-currency-picker.tsx lines 33–40):

```typescript
try {
  const res = await api.budgets[":id"].$patch({ json: body });
  if (!res.ok) throw new Error("Failed");
  toast.success(t("identity.name_saved")); // "Budget name saved"
} catch {
  toast.error(t("error_save")); // "Failed to save — try again"
}
```

**Accordion structure** (D-04 — single open at a time, default "budget-identity"):

```typescript
<Accordion type="single" defaultValue="budget-identity" collapsible>
  <AccordionItem value="budget-identity">
    <AccordionTrigger>{t("sections.identity")}</AccordionTrigger>
    <AccordionContent>
      {/* InlineEditCell for name; currency field with has_transactions lock */}
    </AccordionContent>
  </AccordionItem>
  {/* cushion, recurring, members (SHARED only), danger-zone */}
</Accordion>
```

---

### 6. `apps/web/src/components/settings/share-url-field.tsx` (NEW)

**Analog:** `apps/web/src/components/settings/display-currency-picker.tsx` (self-contained client component that fires a mutation and shows result inline).

**Core pattern:**

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ShareUrlField({ budgetId }: { budgetId: string }) {
  const t = useTranslations("share");
  const [url, setUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await api.budgets[":id"].share.$post({
        param: { id: budgetId },
        json: { ttlDays: 7 },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setUrl(data.url);
    } catch {
      toast.error(t("error_generate"));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url!);
      toast.success(t("copied")); // "Link copied to clipboard"
    } catch {
      toast.error(t("copy_failed")); // "Could not copy link — copy it manually"
    }
  };
  // ...
}
```

---

### 7. Inline-autosave field pattern (budget identity D-01)

**Analog:** `apps/web/src/components/common/inline-edit-cell.tsx` (full file — lines 1–200).

**Key props to wire:**

```typescript
<InlineEditCell<string>
  value={budget.name}
  render={(v) => <span>{v}</span>}
  renderEditor={(draft, onChange, onCommit, onCancel) => (
    <Input
      value={draft}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      maxLength={80}
    />
  )}
  onSave={async (name) => {
    const res = await api.budgets[":id"].$patch({ json: { name } });
    if (!res.ok) throw new Error("save failed");
    toast.success(t("identity.name_saved"));
  }}
  ariaLabel={t("identity.name_aria")}
  disabled={false}
/>
```

**Double-commit guard is built into `InlineEditCell`** (lines 48–74) — do NOT add your own commit guard in the settings wrapper.

---

### 8. Onboarding wizard — `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` + wizard components (NEW)

**Analog for step machine:** `apps/web/src/components/workspace/create-workspace-form.tsx` (multi-field form with state + API call + redirect).

**Analog for API shape:** `apps/api/src/routes/budgets.ts` lines 54–82 (`POST /` — `createSchema` with `name`, `kind`, `default_currency`).

**Step machine pattern** (D-05 — single-page, React state):

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type Step = 1 | 2 | 3 | 4 | 5;

export function WizardPage() {
  const [step, setStep] = useState<Step>(1);
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    currency: "USD",
    kind: "PRIVATE",
    categories: [...DEFAULT_CATEGORIES],
  });
  const router = useRouter();
  const locale = useLocale();

  const onNext = async () => {
    if (step === 1) {
      // INSERT budget — locale-guessed default_currency required (NOT NULL)
      const res = await api.budgets.$post({
        json: {
          name: form.name,
          kind: "PRIVATE",
          default_currency: form.currency, // locale-guessed default
        },
      });
      const data = await res.json();
      setBudgetId(data.id);
      // upsert onboarding_progress step=1
    }
    // steps 2–4: PATCH budget + upsert onboarding_progress
    if (step < 5) setStep((s) => (s + 1) as Step);
    else {
      // complete: PATCH onboarding_progress(completed_at=now)
      router.push(`/${locale}/budgets/${budgetId}/spendings`); // ROADMAP SC-4 target
    }
  };
  // ...
}
```

**Resume from `?step` param** (D-08):

```typescript
// Read ?step query param on mount to restore position after middleware redirect
const searchParams = useSearchParams();
const initialStep = Number(searchParams.get("step") ?? "1") as Step;
const [step, setStep] = useState<Step>(initialStep);
```

---

### 9. `apps/web/src/components/onboarding/wizard-stepper.tsx` (NEW)

No exact analog. Closest structural reference: `apps/web/src/components/budgeting/bdp-tabs.tsx` (segmented visual indicator).

**Pattern** (div + CSS, no Radix):

```typescript
// 5 equal segments. Filled = --primary (#fcd535); muted = --surface-elevated-dark; outlined = hairline.
// Completed: checkmark icon (lucide Check, 12px). Current: step number in --on-primary. Upcoming: number in --muted.
interface WizardStepperProps {
  currentStep: 1 | 2 | 3 | 4 | 5;
}
```

---

### 10. Public join page — `apps/web/src/app/[locale]/budgets/join/[token]/page.tsx` (NEW)

**CRITICAL: Route must live OUTSIDE `(app)/` group** — the `(app)` layout enforces auth chrome. Place at `app/[locale]/budgets/join/[token]/page.tsx` (sibling of `(app)`, still locale-prefixed).

**Analog:** `apps/api/src/routes/share-join.ts` lines 36–58 (GET handler shape) — mirrors what the RSC fetches.

**RSC fetch pattern** (public page — no auth cookie on server fetch):

```typescript
// apps/web/src/app/[locale]/budgets/join/[token]/page.tsx
import { JoinPageCard } from "@/components/share/join-page-card";

export default async function JoinPage({ params }: { params: { token: string; locale: string } }) {
  // Server-side fetch — public endpoint, no auth header needed
  const res = await fetch(`${process.env.API_URL}/budgets/join/${params.token}`, {
    cache: "no-store",
  });

  if (res.status === 404) return <JoinPageCard state="not_found" />;

  const data = await res.json();
  // { budgetName, isExpired, isRevoked, isUsed }

  if (data.isExpired || data.isRevoked) return <JoinPageCard state="expired" />;
  if (data.isUsed) return <JoinPageCard budgetName={data.budgetName} state="already_used" />;

  return <JoinPageCard budgetName={data.budgetName} token={params.token} state="valid" />;
}
```

**`JoinPageCard` accept mutation pattern** (mirrors `display-currency-picker.tsx` mutation shape):

```typescript
// POST /budgets/join/:token/accept — auth-gated (Better Auth session cookie sent automatically)
const accept = async () => {
  setAccepting(true);
  try {
    const res = await fetch(`/api/budgets/join/${token}/accept`, {
      method: "POST",
    });
    if (res.status === 410) {
      /* show expired/revoked state */ return;
    }
    if (res.status === 409) {
      /* already used */ return;
    }
    const { budgetId } = await res.json();
    toast.success(t("join_success", { budgetName }));
    router.push(`/${locale}/budgets/${budgetId}/spendings`); // ROADMAP SC-5
  } finally {
    setAccepting(false);
  }
};
```

---

### 11. Integration tests — `apps/api/test/routes/budget-*.test.ts` (NEW)

**Analog:** `apps/api/test/routes/budgets.test.ts` (full file — lines 1–80+).

**`buildApp` factory pattern** (budgets.test.ts lines 13–51 — copy exactly):

```typescript
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget identity PATCH", () => {
  function buildApp(session: unknown, tenantIds = ["budget-001"]) {
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", tenantIds);
      await next();
    });
    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          findById: async () => ({
            id: "budget-001",
            name: "Test",
            cushionModeEnabled: false,
          }),
          listForUser: async () => [],
          listMembers: async () => [],
        },
        memberShareRepo: { update: async () => {} },
      },
      identity: { auth: { api: {} }, userRepo: {} },
    } as any;
    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    return app;
  }

  it("PATCH /budgets/:id updates name and returns 200", async () => {
    const app = buildApp({ user: { id: "user-001", email: "t@t.com" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH /budgets/:id returns 401 when unauthenticated", async () => {
    const app = buildApp(null);
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(401);
  });
});
```

**Cross-tenant test pattern** (budgets.test.ts regression guard style):

```typescript
it("PATCH /budgets/:id returns 404 for non-member budget", async () => {
  const app = buildApp({ user: { id: "user-001", email: "t@t.com" } }, [
    "other-budget",
  ]);
  const res = await app.request("/budgets/budget-001", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hack" }),
  });
  expect(res.status).toBe(404); // no existence leak
});
```

---

### 12. E2E tests — feature files, page objects, step definitions (NEW)

**Analog:** `tests/e2e/features/wallets/add-edit-drag-delete.feature` + `tests/e2e/pages/WalletsPage.ts` + `tests/e2e/steps/wallets.steps.ts`.

**Feature file pattern:**

```gherkin
@phase6
Feature: Budget Settings — Danger Zone

  Scenario: Owner archives a budget and it disappears from home grid
    Given I am signed in as a fresh user with workspace "Holiday Fund"
    When I navigate to "/en/budgets/{budgetId}/settings"
    And I open the "Danger Zone" accordion section
    And I click "Archive budget"
    And I confirm the archive dialog
    Then the budget "Holiday Fund" is not shown on the home grid
```

**Page object pattern** (WalletsPage.ts lines 1–60 — constructor + typed locators):

```typescript
// tests/e2e/pages/BudgetSettingsPage.ts
import { type Page, type Locator } from "@playwright/test";

export class BudgetSettingsPage {
  constructor(private readonly page: Page) {}

  async open(locale: string, budgetId: string): Promise<void> {
    await this.page.goto(`/${locale}/budgets/${budgetId}/settings`);
    await this.page.waitForLoadState("networkidle");
  }

  accordionSection(name: string): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  async openSection(name: string): Promise<void> {
    await this.accordionSection(name).click();
  }
  // ...
}
```

**Step definition pattern** (wallets.steps.ts lines 1–60 — `createBdd` + fixture import):

```typescript
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { BudgetSettingsPage } from "../pages/BudgetSettingsPage.js";

const { Given, When, Then } = createBdd(test);
```

**Seed via API in steps** (wallets.steps.ts lines 44–59 pattern — use `page.request.post`):

```typescript
// Seed data before UI assertions — no DB mocking
const res = await page.request.post("/api/budgets", {
  headers: { "Content-Type": "application/json" },
  data: { name, kind: "PRIVATE", default_currency: "USD" },
});
```

---

### 13. i18n message files — `apps/web/messages/{en,pl,uk}.json` (MODIFY)

**Analog:** `apps/web/messages/en.json` existing structure (nested namespaces, flat keys, ICU format for interpolation).

**New top-level namespaces to add** (peer to existing `"auth"`, `"settings"` etc.):

```json
{
  "settings": {
    "page_heading": "Budget Settings",
    "sections": {
      "identity": "Budget Identity",
      "cushion": "Cushion Mode",
      "recurring": "Recurring Rules",
      "members": "Members",
      "danger": "Danger Zone"
    },
    "identity": {
      "name_saved": "Budget name saved",
      "currency_updated": "Currency updated",
      "currency_locked_tooltip": "Currency locked after first transaction",
      "error_save": "Failed to save — try again"
    }
    // ... (full copy contract in UI-SPEC Copywriting Contract section)
  },
  "onboarding": {
    "page_heading": "Create your budget"
    // ...
  },
  "share": {
    "copied": "Link copied to clipboard",
    "copy_failed": "Could not copy link — copy it manually"
    // ...
  }
}
```

**ICU apostrophe escaping rule** (from memory observation 5080/5092 — already burned once):

```json
// WRONG: "You're the last owner"
// RIGHT: "You''re the last owner"  ← double-apostrophe for ICU MessageFormat
```

---

## Shared Patterns

### Authentication gate

**Source:** `apps/api/src/routes/budgets.ts` lines 117–126
**Apply to:** ALL new API endpoints (PATCH /:id, GET /:id/members, POST /:id/members/:memberId/revoke, POST /:id/archive, POST /:id/delete)

```typescript
const session = c.get("session");
if (!session) return c.json({ error: "unauthorized" }, 401);

const budgetId = c.req.param("id");
const tenantIds = c.get("tenantIds") as string[] | undefined;
if (!tenantIds || !tenantIds.includes(budgetId)) {
  return c.json({ error: "not_found" }, 404); // 404 not 403 — no existence leak
}
```

### Owner-only gate

**Source:** `apps/api/src/routes/budgets.ts` lines 160–186
**Apply to:** POST /:id/archive, POST /:id/delete, POST /:id/members/:memberId/revoke

```typescript
// Import at top of file (already imported in budgets.ts):
import { withBootstrapUserContext } from "@budget/platform";
import { sql } from "drizzle-orm";

// Then the owner check block (lines 160–186 verbatim).
// role !== "owner" → 403 (not 404).
```

### Toast feedback

**Source:** `apps/web/src/components/settings/display-currency-picker.tsx` lines 32–40
**Apply to:** All client mutations in settings-accordion, share-url-field, wizard steps, join-page-card

```typescript
import { toast } from "sonner";
// success: toast.success(t("key"))
// error:   toast.error(t("error_key"))
```

### `useTranslations` + namespace

**Source:** `apps/web/src/components/settings/display-currency-picker.tsx` line 27; `apps/web/src/components/budgeting/recurring-rule-form.tsx` line 13
**Apply to:** All new client components

```typescript
import { useTranslations } from "next-intl";
// settings page components:  const t = useTranslations("settings");
// wizard components:          const t = useTranslations("onboarding");
// share/join components:      const t = useTranslations("share");
```

### api-client call shape

**Source:** `apps/web/src/components/settings/display-currency-picker.tsx` line 34
**Apply to:** All frontend mutations

```typescript
import { api } from "@/lib/api-client";
// Pattern: api.<route>[":param"].$method({ param, json })
// Hono RPC typed — do not use raw fetch for authenticated API calls.
```

---

## No Analog Found

| File                                       | Role         | Data Flow    | Reason                                                                                                                         |
| ------------------------------------------ | ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/ui/accordion.tsx` | ui-primitive | event-driven | Install via `npx shadcn add accordion` — no existing accordion in codebase; use shadcn output verbatim, no custom logic needed |
| `apps/web/src/components/ui/switch.tsx`    | ui-primitive | event-driven | Install via `npx shadcn add switch` — same as accordion                                                                        |

---

## Critical Risk Notes for Planner

1. **Cushion flag write-path (Pitfall 3):** Verify `toggleBudgetMode` in `packages/budgeting` before writing the cushion task. Read `budget-settings.ts` line 35 (`deps.budgeting.toggleBudgetMode`) and trace the use case to confirm whether it writes `budgets.cushion_mode_enabled`. This determines whether a new PATCH path is needed.

2. **`onboarding_progress` CI gate (Pitfall 2):** Check `apps/api/test/architecture/` for how `make ci-gate` enumerates tables. If it sweeps all `tenancy.*` tables for RLS policies, either move `onboarding_progress` to a separate schema (e.g. `identity`) or add it to an explicit allowlist before landing.

3. **Join route outside `(app)/` (Pitfall 5):** `PROTECTED_ROUTES = ["/budgets"]` in `middleware.ts` line 9 catches `/budgets/join/*`. The allowlist addition in `middleware.ts` (Pattern 4 above) MUST ship in the same plan wave as the join page route, or E2E will fail on unauthenticated recipient flow.

4. **Redirect target:** `/budgets/[id]/spendings` (ROADMAP SC-4/5, ONBD-08, SHRD-04) — NOT `/budgets/[id]` (UI-SPEC step 5 line 272 is a known drift). ROADMAP wins.

5. **Wizard step-1 INSERT requires `default_currency`:** `budgets.default_currency` is `NOT NULL` (schema.ts line 28). Step 1 must supply a locale-guessed value (e.g. `"USD"` from `navigator.language`). Step 2 PATCHes it.

---

## Metadata

**Analog search scope:** `apps/api/src/routes/`, `apps/web/src/components/`, `packages/tenancy/src/adapters/persistence/`, `tests/e2e/`, `apps/web/messages/`, `apps/web/src/middleware.ts`, `apps/migrator/drizzle.config.ts`
**Files scanned:** 18
**Pattern extraction date:** 2026-05-22
