# Phase 6: Settings, Onboarding & Share UI - Research

**Researched:** 2026-05-22
**Domain:** Settings-shaped form flows (Next.js App Router RSC + Hono API + Drizzle/Postgres) — budget Settings tab, 5-step onboarding wizard, public share-link join page
**Confidence:** HIGH (codebase verified; framework versions verified against package.json)

## Summary

Phase 6 ships three form-flow surfaces on top of an already-mature stack. The backend share-link flow (Phase 2) is complete and unchanged; the recurring-rules CRUD (Phase 4) and inline-autosave pattern (Phase 4/5) are reusable as-is. The genuinely new work is: (1) a small set of **missing API endpoints** on `apps/api/src/routes/budgets.ts` — budget identity PATCH, cushion-mode PATCH, archive, hard-delete, revoke-member; (2) a **new `onboarding_progress` table** plus its Drizzle schema file wired into the migrator config; (3) a **new `archived_at` column** on `budgets`; (4) two new shadcn primitives (`accordion`, `switch`); and (5) filling three placeholder Next.js routes with real client components.

The cushion-mode toggle is the one place where the existing backend already does *more* than the UI needs: there is an SCD-2 `budget_mode_history` table and a `POST /budget-settings/budget-mode` route that toggles `NORMAL|CUSHION` with history. Phase 6's D-02 toggle should drive `budgets.cushion_mode_enabled` (the cheap current-state boolean) — verify whether the existing `POST /budget-settings/budget-mode` already updates that boolean, or whether a separate `PATCH /budgets/:id` flag write is needed. This is the single highest-risk integration point.

The biggest structural pitfall is **migration mechanics**: this project uses `drizzle-kit generate` + a hand-maintained migrator (`apps/migrator`) with a `post-migration.sql` that re-applies FORCE RLS / REVOKE per table. A new `onboarding_progress` table and a new `budgets.archived_at` column must both be added to a schema file, registered in `apps/migrator/drizzle.config.ts`, generated as a migration, and — if the table needs tenant isolation — RLS-policied. `onboarding_progress` is keyed by `user_id` (not `budget_id`), so it is **not tenant-scoped**; it must be excluded from the tenant-leak CI gate's per-table sweep or the gate will flag it.

**Primary recommendation:** Treat Phase 6 as ~70% wiring of existing parts and ~30% net-new backend (5 endpoints + 1 table + 1 column + 2 shadcn primitives). Plan the schema/migration work as a strict first wave — every UI task depends on it.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Settings field interaction**
- **D-01:** Budget identity fields (name, currency) use **inline-autosave per field** — click → edit → blur saves → toast. Reuses the Phase 4 grid / Phase 5 Wallets autosave pattern. No Save button.
- **D-02:** Cushion mode toggle **persists instantly + toast** (`PATCH budgets.cushion_mode_enabled`). Effect is fully reversible, so no confirm dialog.
- **D-03:** Recurring rules section **reuses the existing Phase 4 components** (`recurring-rules-list`, `recurring-rule-form`); list rendered inline, add/edit form opens in the **Sheet** primitive. The standalone `/recurring` route is **retired** once Settings absorbs it.
- **D-04:** The 5 settings sections render as **accordion collapsibles** (one section open at a time). Phase 6 adds a Radix-backed `accordion.tsx`.

**Onboarding wizard**
- **D-05:** Wizard is a **single-page step machine** at `/budgets/new` — one route, React step state, no per-step URLs.
- **D-06:** Partial answers persist by **creating the budget row at step 1** and PATCHing it on every subsequent step. `onboarding_progress(user_id, step, completed_at)` tracks only the step number. Resume re-opens the half-built budget at the saved step.
- **D-07:** Step progress shown as a **numbered 1–5 segmented stepper**.
- **D-08:** Incomplete `onboarding_progress` on sign-in → **force-redirect into the wizard** at the saved step (layout/middleware guard). Back navigation between steps allowed.

**Danger zone & archive**
- **D-09:** Archive = set `archived_at` and **hide the budget from home cards + the switcher dropdown**. Data fully retained in DB.
- **D-10:** **No restore/un-archive UI in v1.1** — archive is one-way in the UI (DB row kept).
- **D-11:** Archive + Delete are **owner-only**. Non-owner members see only "Leave budget" in the Danger zone.
- **D-12:** Last-owner protection: a SHARED budget's last owner is **blocked from "Leave budget"**; message directs them to Delete instead. No ownership-transfer feature in v1.1.
- **D-13:** Delete keeps the spec-locked **typed-name confirmation** (type exact budget name to enable hard-delete) in an `alert-dialog`.

**Members & share-link**
- **D-14:** "Generate share link" → **shows the URL in a read-only field with a Copy button**. The generated link is **ephemeral** — displayed for the current session, gone on reload; no persistent outstanding-links list.
- **D-15:** Share links use a **fixed 7-day TTL** — no TTL picker in the UI. SHRD-03 "configurable" satisfied at API level only.
- **D-16:** Revoking a member requires a **confirm dialog** (`alert-dialog`).

### Claude's Discretion

- Which accordion section is open by default (suggest Budget identity).
- Exact stepper / progress visual treatment within DESIGN.md tokens; toast copy wording.
- Whether the stray `/onboarding` route is hard-deleted or redirected to `/budgets/new`.
- Members section is simply hidden for PRIVATE budgets; empty-state copy is discretionary.
- Field ordering inside the recurring-rule-form Sheet.

### Deferred Ideas (OUT OF SCOPE)

- **Restore / un-archive budget UI** — no un-archive surface in v1.1.
- **Outstanding share-links list with per-link revoke (SHRD-05)** — Phase 6 covers SHRD-04 only; generate-only.
- **Transfer ownership** — no ownership-transfer feature in v1.1.
- **Share-link TTL picker** — fixed 7-day TTL in v1.1.
- **LLM/conversational onboarding** — deferred per `v1.1-SPEC` §15; Phase 6 ships the deterministic 5-step form.
- **PWA / offline / push** — Phase 8.
- **Full i18n rewrite** — Phase 8 (Phase 6 still delivers new strings in EN/PL/UK).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETT-01 | Settings tab renders sections vertically: identity · cushion · recurring · members (SHARED) · danger zone | New `accordion.tsx` primitive + `settings-accordion.tsx` (Component Inventory in UI-SPEC). Section order FIXED by ROADMAP SC-1. |
| SETT-02 | Budget identity: name editable; currency editable until first txn then locked + tooltip | Needs `has_transactions` signal on `GET /budgets/:id` — **does not currently exist** (see Don't Hand-Roll / Open Questions). Inline-autosave pattern from Phase 4/5. |
| SETT-03 | Cushion mode toggle persists `budgets.cushion_mode_enabled` | Column exists (`schema.ts:37`). PATCH path is **missing** — see Standard Stack / Open Question Q1 re: existing `POST /budget-settings/budget-mode`. |
| SETT-04 | Recurring rules CRUD list | Reuse Phase 4 `recurring-rules-list.tsx` + `recurring-rule-form.tsx` + `recurring-rules.ts` API (D-03). Zero new backend. |
| SETT-05 | Members section only for SHARED; lists members + roles | `GET /budgets/:id` returns `kind`; member list source = Better Auth org members. Needs a members-list read endpoint or `workspaceRepo.listMembers` (present in repo). |
| SETT-06 | "Generate share link" button → token invite, copyable | `POST /budgets/:id/share` **already exists** (`budgets.ts:403`). UI consumes it directly. |
| SETT-07 | Revoke member; leave budget with last-owner protection | `POST /budgets/:id/leave` **exists** (`budgets.ts:241`, last-owner 409 handled). Revoke-member endpoint is **missing**. |
| SETT-08 | Danger zone: Archive (soft-delete) + Delete (typed-name hard-delete) | Both endpoints **missing**. `archived_at` column **missing**. |
| SETT-09 | Categories not managed in Settings | No-op — nothing to build; just do not add category CRUD to Settings. |
| ONBD-01 | After signup → redirect to `/budgets/new` | Middleware/layout redirect; coordinate with existing `PROTECTED_ROUTES` guard in `apps/web/src/middleware.ts`. |
| ONBD-02..06 | 5-step wizard: name, currency, type, starter categories, optional skip | Single-page step machine (D-05). Budget row created at step 1 (D-06). Categories POST = existing `categories.ts` route. |
| ONBD-07 | Wizard state in `onboarding_progress(user_id, step, completed_at)`; resumable | **New table** + new schema file + migrator registration. Not tenant-scoped (keyed by user_id). |
| ONBD-08 | On finish → redirect to `/budgets/[new_id]/spendings` | ⚠️ ROADMAP SC-4 says `/spendings`; UI-SPEC step 5 says `/budgets/[id]`. **ROADMAP wins** — see Open Question Q3. |
| ONBD-09 | `+` in switcher dropdown opens wizard without auth gate | `NewBudgetButton` already routes to `/budgets/new` (Phase 3). |
| SHRD-04 | Recipient lands on confirmation page → "Join {budget name}" → membership → redirect to `/budgets/[id]/spendings` | Backend complete (`share-join.ts`). New public web route consumes `GET /budgets/join/:token` + `POST /budgets/join/:token/accept`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Budget identity edit (name/currency) | API (`PATCH /budgets/:id`) | Frontend (inline-autosave UI) | Mutation + RLS ownership check belong server-side; UI only renders editable fields. |
| Currency-lock signal (`has_transactions`) | API (DB count read) | — | Only the DB knows transaction count; must be computed server-side and returned on `GET /budgets/:id`. |
| Cushion-mode toggle persistence | API (`PATCH` or existing `POST /budget-settings/budget-mode`) | Frontend (Switch UI + optimistic toggle) | Boolean lives in `budgets` table; SCD-2 history is server concern. |
| Recurring rules CRUD | API (`recurring-rules.ts` — exists) | Frontend (reused Phase 4 components) | Already-shipped backend; phase only re-mounts UI. |
| Archive / hard-delete budget | API (new endpoints) | Frontend (AlertDialog confirms) | Destructive mutations; owner-only authz must be server-enforced. |
| Member list + roles | API (Better Auth org members read) | Frontend (member rows) | Membership data owned by Identity/Tenancy contexts. |
| Generate share link | API (`POST /budgets/:id/share` — exists) | Frontend (ShareUrlField + clipboard) | Token minting is server-side; clipboard write is browser-only. |
| Revoke member | API (new endpoint, Better Auth `removeMember`) | Frontend (AlertDialog confirm) | Server-enforced owner authz. |
| Onboarding step persistence | API (new `onboarding_progress` writes) | Frontend (React step machine) | Resume-after-refresh requires durable server state. |
| Onboarding force-redirect | Frontend Server (Next.js middleware/layout) | API (`onboarding_progress` read) | Redirect decision is an SSR/middleware concern; reads the API/DB state. |
| Share-link join (view) | Frontend Server (public RSC route) | API (`GET /budgets/join/:token`) | Public page, no auth gate; renders link state server-side. |
| Share-link accept | API (`POST /budgets/join/:token/accept` — exists) | Frontend (CTA + post-accept redirect) | Membership creation is server-side; auth-gated. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16 (App Router) | Three new routes: Settings fill, `/budgets/new` wizard, public join page | [VERIFIED: CLAUDE.md tech table + `apps/web` is App Router] Project standard. |
| Hono | v4.12+ | New API endpoints on `budgets.ts` | [VERIFIED: CLAUDE.md] All routes are Hono; `budgets.ts` already a Hono factory. |
| Drizzle ORM | 0.45.2 | `onboarding_progress` schema, `archived_at` column | [VERIFIED: `packages/tenancy/package.json:22`] |
| drizzle-kit | 0.31.10 | Generate the new migration | [VERIFIED: `apps/migrator/package.json:18`, `packages/platform/package.json:24`] |
| Zod | v3 | Validate new PATCH/POST request bodies | [VERIFIED: CLAUDE.md] `zValidator("json", schema)` already used throughout `budgets.ts`. |
| Better Auth | 1.4+ (organizations plugin) | Member list, revoke member, leave budget | [VERIFIED: CLAUDE.md; `budgets.ts:250` uses `auth.api.leaveOrganization`] |
| @tanstack/react-query | ^5 | Client-state for settings/wizard surfaces | [VERIFIED: UI-SPEC Design System table — Phase 3 install] |
| next-intl | latest | New `settings.*`, `onboarding.*`, `share.*` namespaces | [VERIFIED: `apps/web/src/middleware.ts` uses `next-intl/middleware`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-accordion | latest (shadcn-pinned) | Backs new `accordion.tsx` | Settings 5-section layout (D-04). Install via `npx shadcn add accordion`. |
| @radix-ui/react-switch | latest (shadcn-pinned) | Backs new `switch.tsx` | Cushion-mode toggle (D-02). Install via `npx shadcn add switch`. UI-SPEC line 194 flags this is **not yet present** in `components/ui/`. |
| playwright-bdd | ^8 | Gherkin E2E for the three flows | [VERIFIED: `apps/web/package.json:64`] All E2E is `.feature` + Page Objects + steps. |
| sonner | (installed) | Toast feedback (autosave, toggle, copy) | [VERIFIED: `apps/web/src/components/ui/sonner.tsx`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `PATCH /budgets/:id` for cushion flag | Reuse existing `POST /budget-settings/budget-mode` | Existing route writes SCD-2 `budget_mode_history` with `NORMAL|CUSHION`. If it ALSO syncs `cushion_mode_enabled`, reuse it — no new endpoint. Must be verified (Open Question Q1). Do not build a second cushion write path that diverges from history. |
| Per-step URLs for the wizard | Single-page step machine (D-05 — LOCKED) | Locked. No alternative to research. |
| New members-list endpoint | `workspaceRepo.listMembers` (already in repo interface) | The repo method exists (`budgets.test.ts:29` mocks it). Prefer surfacing it via an existing/new GET over re-querying Better Auth directly. |

**Installation:**
```bash
cd apps/web && npx shadcn add accordion switch
```
No new npm packages for the API — all new endpoints use already-installed Hono + Zod + Drizzle + Better Auth.

**Version verification (2026-05-22):**
- `drizzle-orm@0.45.2` — pinned in `packages/tenancy/package.json` [VERIFIED: package.json]
- `drizzle-kit@0.31.10` — pinned in `apps/migrator` + `packages/platform` [VERIFIED: package.json]
- `playwright-bdd@^8` — pinned in `apps/web` [VERIFIED: package.json]
- shadcn `accordion`/`switch` versions float with the official registry — pinned at install time by the shadcn CLI. [ASSUMED] both are still in the official registry (they are core shadcn components; very low risk).

## Architecture Patterns

### System Architecture Diagram

```
SETTINGS TAB                        ONBOARDING WIZARD                 SHARE-LINK JOIN
────────────                        ─────────────────                 ───────────────

/budgets/[id]/settings              signup ──redirect──> /budgets/new   share link URL
   (RSC shell)                          │                                  │
   │                                    │ middleware/layout guard           │ /budgets/join/[token]
   │ <SettingsAccordion> (client)        │ reads onboarding_progress         │  (PUBLIC RSC route)
   │                                    ▼                                  │
   ├─ Identity ──blur──> PATCH /budgets/:id ──> RLS check ──> budgets row    ├─ GET /budgets/join/:token
   │     (name, currency)                                                   │     (public, no auth)
   │                                    React step machine (D-05)           │     │
   ├─ Cushion ──toggle──> PATCH cushion_mode_enabled                         │     ▼
   │              (or POST /budget-settings/budget-mode — Q1)               │  {budgetName,isExpired,
   │                                    step1 ─INSERT──> budgets row         │   isRevoked,isUsed}
   ├─ Recurring ──> recurring-rules.ts (Phase 4 — unchanged)                 │     │
   │                                    step2-5 ─PATCH──> budgets row        │  render state card
   ├─ Members (SHARED only)             step1-5 ─upsert──> onboarding_progress│     │
   │   ├─ list ──> GET members           │                                  │  authed? ─yes─> CTA
   │   ├─ generate ──> POST /:id/share   step5 ─complete──> onboarding_progress    │
   │   │     ──> {url} ──> clipboard            (completed_at=now)           │     │
   │   └─ revoke ──> POST removeMember   redirect ──> /budgets/[id]/spendings POST /budgets/join/
   │                                                                        │   :token/accept
   └─ Danger Zone (owner only)                                              │     (AUTHED)
       ├─ Archive ──> POST /:id/archive ──> budgets.archived_at = now        │     │
       └─ Delete ──> POST /:id (typed-name) ──> hard delete                  │  {budgetId} ──redirect──>
                                                                            │  /budgets/[id]/spendings
```

### Recommended Project Structure
```
apps/api/src/routes/
└── budgets.ts                  # ADD: PATCH /:id, cushion path, POST /:id/archive,
                                #      DELETE /:id (or POST /:id/delete), revoke-member

apps/web/src/
├── app/[locale]/(app)/budgets/[id]/settings/page.tsx   # FILL placeholder
├── app/[locale]/(app)/budgets/new/page.tsx             # FILL placeholder
├── app/[locale]/budgets/join/[token]/page.tsx          # NEW public route (outside (app) group)
├── components/ui/accordion.tsx                         # NEW shadcn
├── components/ui/switch.tsx                            # NEW shadcn
├── components/settings/settings-accordion.tsx          # NEW
├── components/settings/share-url-field.tsx             # NEW
├── components/onboarding/wizard-stepper.tsx            # NEW
├── components/onboarding/wizard-layout.tsx             # NEW
└── components/share/join-page-card.tsx                 # NEW

packages/tenancy/src/adapters/persistence/
└── onboarding-progress-schema.ts                       # NEW schema file (register in migrator config)

apps/migrator/
├── drizzle.config.ts          # ADD onboarding-progress-schema.ts to schema[] array
└── post-migration.sql         # ADD any FORCE-RLS/REVOKE if onboarding_progress needs it
```

### Pattern 1: Hono route handler with tenant gate + Zod validation
**What:** Every mutating endpoint in `budgets.ts` validates body with `zValidator`, checks `c.get("session")`, and gates on `c.get("tenantIds")` membership before touching data.
**When to use:** All new PATCH/POST/DELETE endpoints on `budgets.ts`.
**Example:**
```typescript
// Source: apps/api/src/routes/budgets.ts:337-353 (verified pattern)
r.get("/:id/reserves", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const budgetId = c.req.param("id");
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404);   // 404 not 403 — no existence leak
  }
  // ... call use case ...
});
```
New endpoints MUST follow this exact gate (`session` → `tenantIds.includes(budgetId)` → 404). For owner-only endpoints (archive/delete/revoke), ALSO add an owner-role check after the tenant gate — see `budgets.ts:184` (`if (lookup.value.role !== "owner") return c.json({ error: "forbidden" }, 403)`).

### Pattern 2: Hono route ORDER — static paths before `:id`
**What:** Hono matches in registration order. A static `/active` registered AFTER `/:id` is swallowed as `:id="active"`.
**When to use:** When adding any new static sub-path to `budgets.ts`.
**Example:**
```typescript
// Source: apps/api/test/routes/budgets.test.ts:167-217 (regression guard)
// GET /budgets/active MUST be registered before GET /budgets/:id.
```
`DELETE /budgets/share/:linkId` already lives at `budgets.ts:441` and would collide with `DELETE /budgets/:id` if a hard-delete route is added as `DELETE /:id`. **Recommendation:** use `POST /budgets/:id/archive` and `POST /budgets/:id/delete` (sub-paths) rather than bare `DELETE /:id` to avoid route-ordering fragility. A regression test like `budgets.test.ts:167` should cover ordering.

### Pattern 3: Drizzle schema + migrator registration
**What:** New tables/columns live in a `*-schema.ts` file, are added to `apps/migrator/drizzle.config.ts` `schema[]`, generated with `drizzle-kit generate`, and applied by `apps/migrator/src` which then runs `post-migration.sql`.
**When to use:** `onboarding_progress` table + `budgets.archived_at` column.
**Example:**
```typescript
// New file: packages/tenancy/src/adapters/persistence/onboarding-progress-schema.ts
// Pattern mirrors schema.ts:18 (tenancy.table) but NO pgPolicy — keyed by user_id, not tenant.
import { uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { tenancy } from "@budget/platform";

export const onboardingProgress = tenancy.table("onboarding_progress", {
  userId: uuid("user_id").primaryKey(),       // one row per user
  step: integer("step").notNull().default(1),
  completedAt: timestamp("completed_at", { withTimezone: true }), // NULL = in progress
});
```
`archived_at` is a one-line addition to `budgets` in `schema.ts:18`:
```typescript
archivedAt: timestamp("archived_at", { withTimezone: true }), // D-09 soft-delete; NULL = active
```

### Anti-Patterns to Avoid
- **Bare `DELETE /budgets/:id`:** collides with the existing `DELETE /budgets/share/:linkId` route family and is fragile under Hono ordering. Use `POST /:id/delete`.
- **Writing `cushion_mode_enabled` from two places:** if `POST /budget-settings/budget-mode` already syncs the boolean, a second `PATCH` path will let the boolean and the SCD-2 history diverge. Verify first (Q1).
- **Tenant-policying `onboarding_progress`:** it is keyed by `user_id`, has no `tenant_id`, and must NOT get a `pgPolicy` like `budgets`. It must also be excluded from the `make ci-gate` per-table tenant-leak sweep.
- **Hard-deleting the stray `/onboarding` route without checking inbound links:** UI-SPEC line 283 recommends a 301 redirect to `/budgets/new`. The route currently renders `CreateWorkspaceForm` and is in `middleware.ts` `PROTECTED_ROUTES` — redirect, don't silently 404.
- **Putting the join page inside the `(app)` route group:** `/budgets/join/[token]` view step is PUBLIC. The `(app)` group's layout enforces auth chrome. Place the route OUTSIDE `(app)` (e.g. `app/[locale]/budgets/join/[token]/`) or it will be gated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion open/close + a11y | Custom `useState` + ARIA | `npx shadcn add accordion` (Radix) | Radix handles keyboard nav, `aria-expanded`, single-open `type="single"`, focus management. |
| Toggle switch | Custom checkbox styling | `npx shadcn add switch` (Radix) | Radix Switch gives `role="switch"`, keyboard toggle, controlled state. |
| Share-link token minting/validation | New token logic | `POST /budgets/:id/share` + `createShareLink` (Phase 2, `packages/tenancy`) | Already shipped, TTL-aware, owner-gated. `budgets.ts:403`. |
| Share-link resolve/accept | New join backend | `GET /budgets/join/:token` + `POST .../accept` (`share-join.ts`) | Already shipped: handles 404/410-Revoked/410-Expired/409-AlreadyUsed. |
| Leave-budget last-owner guard | Custom owner-count check | `auth.api.leaveOrganization` (Better Auth) | `budgets.ts:241` already maps "Cannot leave as last owner" → 409. |
| Recurring rules CRUD | New form/list | Phase 4 `recurring-rules-list.tsx` + `recurring-rule-form.tsx` + `recurring-rules.ts` route | D-03 mandates reuse. |
| Member list | Direct Better Auth query in UI | `workspaceRepo.listMembers` via an API endpoint | Repo method already exists (mocked in `budgets.test.ts:29`). |
| Currency picker | New select | `display-currency-picker.tsx` pattern (Phase 3) | UI-SPEC reuses it for budget identity + wizard step 2. |
| Toast feedback | New toast system | `sonner` | Already wired (`sonner.tsx`). |
| Migration runner | Hand-rolled SQL apply | `apps/migrator` + `drizzle-kit generate` | Existing migrator does advisory-lock + `post-migration.sql` (FORCE RLS). |

**Key insight:** Phase 6's share-link and recurring-rules backends are *complete*. The only genuinely new server logic is 5 small endpoints + 1 table + 1 column. Most risk is in *integration* (route ordering, migration registration, cushion-flag write path), not in building new subsystems.

## Common Pitfalls

### Pitfall 1: New static route swallowed by `/:id`
**What goes wrong:** Adding `DELETE /budgets/:id` makes `DELETE /budgets/share/:linkId` (existing, `budgets.ts:441`) unreachable, or vice-versa; or a new `/budgets/archive`-style static path is matched as `:id`.
**Why it happens:** Hono matches routes in registration order; this exact bug already bit `/budgets/active` (regression test at `budgets.test.ts:167`).
**How to avoid:** Use sub-path mutations (`POST /:id/archive`, `POST /:id/delete`). Register static paths before `:id`. Add an ordering regression test.
**Warning signs:** A new endpoint returns 404 in integration tests while its handler is clearly present.

### Pitfall 2: `onboarding_progress` flagged by the tenant-leak CI gate
**What goes wrong:** `make ci-gate` runs 6 tenant-leak tests; a per-table sweep may expect every `tenancy.*` table to have a `tenant_id`/`budget_id` RLS policy. `onboarding_progress` is keyed by `user_id`.
**Why it happens:** The gate assumes all tenancy tables are tenant-scoped.
**How to avoid:** Either place `onboarding_progress` in a non-tenancy schema, or explicitly allowlist it in the gate's table sweep. Decide at planning time; check `apps/api/test/` (`route-coverage-audit.test.ts`, `architecture/`, `schema/`) for how the gate enumerates tables.
**Warning signs:** `make ci-gate` fails on the new table with an RLS-policy assertion.

### Pitfall 3: Cushion flag write-path divergence
**What goes wrong:** D-02 says `PATCH budgets.cushion_mode_enabled`, but `POST /budget-settings/budget-mode` already exists and writes an SCD-2 `budget_mode_history` row (`NORMAL|CUSHION`). Two write paths can leave the boolean and the history inconsistent.
**Why it happens:** The boolean (cheap reads) and the history table (RSCM-02 historical-month evaluation) are dual storage per `schema.ts:35-39`.
**How to avoid:** Verify whether `toggleBudgetMode` (the use case behind `/budget-settings/budget-mode`) already updates `cushion_mode_enabled`. If yes — the Settings toggle calls that route, no new endpoint. If no — extend that use case to sync the boolean; do NOT add an independent PATCH.
**Warning signs:** Grid headers / reserve calc disagree with the toggle state after a page reload.

### Pitfall 4: Currency-lock has no backend signal
**What goes wrong:** SETT-02 / UI-SPEC line 189 require `has_transactions: boolean` on the budget detail response to lock the currency field. `GET /budgets/:id` (`budgets.ts:130-140`) currently returns NO such field.
**Why it happens:** The transaction count was never needed before Phase 6.
**How to avoid:** Add a `has_transactions` (or `transactionCount`) field to the `GET /budgets/:id` response — a cheap `SELECT EXISTS(...)` or `COUNT` against the transactions table scoped to the budget. Plan it as part of the same task that adds `PATCH /budgets/:id`.
**Warning signs:** Currency field stays editable after the first transaction, or the lock is faked client-side.

### Pitfall 5: Public join route gated by the `(app)` layout
**What goes wrong:** Placing `/budgets/join/[token]` inside `app/[locale]/(app)/` inherits the authenticated app shell + `PROTECTED_ROUTES` middleware guard → unauthenticated recipients get bounced to sign-in before they can see the invite.
**Why it happens:** `middleware.ts` `PROTECTED_ROUTES` includes `/budgets`; the `(app)` layout assumes a session.
**How to avoid:** Put the join route OUTSIDE `(app)`. Confirm `middleware.ts` does not bounce `/budgets/join/*` — the current guard is `bare.startsWith("/budgets")`, which WOULD catch `/budgets/join`. The middleware needs an explicit allowlist for `/budgets/join/*` (the view step), with auth enforced only at the accept POST.
**Warning signs:** E2E: unauthenticated recipient redirected to `/sign-in` instead of seeing the invite card.

### Pitfall 6: Onboarding redirect destination mismatch
**What goes wrong:** UI-SPEC step 5 (line 272) says redirect to `/budgets/[id]`; ROADMAP SC-4 (line 154) and ONBD-08 say `/budgets/[new_id]/spendings`. Implementing the UI-SPEC value fails the ROADMAP success criterion.
**Why it happens:** UI-SPEC drifted from the ROADMAP.
**How to avoid:** ROADMAP success criteria are the verification target — redirect to `/budgets/[id]/spendings`. Same for the share-link join (SHRD-04 → `/budgets/[id]/spendings`).
**Warning signs:** Verifier flags ONBD-08 / SHRD-04 as failing despite the wizard "working".

### Pitfall 7: `default_currency` is NOT NULL — wizard step ordering
**What goes wrong:** D-06 creates the budget row at step 1, but currency is collected at step 2. `budgets.default_currency` is `.notNull()` (`schema.ts:28`).
**Why it happens:** Append-at-step-1 conflicts with a NOT-NULL column populated later.
**How to avoid:** Step 1 INSERT must supply a locale-guessed default currency (UI-SPEC line 242 already says this), then step 2 PATCHes it. The `POST /budgets` route already requires `default_currency` (`budgets.test.ts:60`), so the wizard step-1 call must include it.
**Warning signs:** Step-1 INSERT throws a NOT-NULL constraint violation.

## Code Examples

### Adding a new PATCH endpoint to `budgets.ts` (identity edit)
```typescript
// Pattern source: apps/api/src/routes/budgets.ts (zValidator + tenant gate, verified)
const patchBudgetSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  default_currency: z.string().length(3).optional(),
});

r.patch("/:id", zValidator("json", patchBudgetSchema), async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const budgetId = c.req.param("id");
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404);
  }
  const body = c.req.valid("json");
  // If body.default_currency present: reject when budget already has transactions.
  // ... call workspaceRepo update / use case ...
  return c.json({ ok: true });
});
```

### Owner-only gate (archive / delete / revoke)
```typescript
// Source: apps/api/src/routes/budgets.ts:160-186 (verified — withBootstrapUserContext lookup)
const lookup = await withBootstrapUserContext(UserId(session.user.id), async (tx) => {
  const result = await tx.execute(sql`
    SELECT bm.role::text AS role, b.kind::text AS kind, b.name AS name
      FROM tenancy.budget_members bm
      JOIN tenancy.budgets b ON b.id = bm.budget_id
     WHERE bm.budget_id = ${budgetId}::uuid AND bm.user_id = ${session.user.id}::uuid
     LIMIT 1`);
  return result.rows[0] as { role: string; kind: string; name: string } | undefined;
});
if (lookup.isErr()) return c.json({ error: "internal" }, 500);
if (!lookup.value) return c.json({ error: "Member not found" }, 404);
if (lookup.value.role !== "owner") return c.json({ error: "forbidden" }, 403);
```

### Integration test scaffold (bun:test, in-memory Hono with fake deps)
```typescript
// Source: apps/api/test/routes/budgets.test.ts:11-51 (verified pattern)
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget identity PATCH", () => {
  function buildApp(session: unknown) {
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session);
      c.set("tenantIds", session ? ["budget-001"] : []);
      await next();
    });
    const fakeDeps = { /* tenancy.workspaceRepo, identity.auth, ... */ } as any;
    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    return app;
  }
  it("PATCH /budgets/:id updates the name and returns 200", async () => {
    const app = buildApp({ user: { id: "user-001", email: "t@t.com" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
  });
});
```

### E2E feature file (playwright-bdd Gherkin)
```gherkin
# Source pattern: tests/e2e/features/settings/*.feature (verified)
Feature: Budget Settings — Danger Zone

  Scenario: Owner archives a budget and it disappears from the home grid
    Given a fresh verified user in "en"
    And the user has a budget named "Holiday Fund"
    When I navigate to the budget settings
    And I open the "Danger Zone" section
    And I click "Archive budget"
    And I confirm the archive dialog
    Then the budget "Holiday Fund" is not shown on the home grid
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Standalone `/recurring` route | Recurring CRUD absorbed into Settings → Recurring section | Phase 6 (D-03) | Retire `apps/web/src/app/[locale]/(app)/recurring/` (only `actions.ts` + `recurring-page-client.tsx` exist). |
| Standalone `/onboarding` route rendering `CreateWorkspaceForm` | 5-step wizard at `/budgets/new` | Phase 6 (D-05) | Stray `/onboarding` page → 301 redirect to `/budgets/new` (UI-SPEC line 283). |
| Email-based invitations (`POST /:id/invitations`) | Token share links (`POST /:id/share` + `/budgets/join/:token`) | Phase 2 | Phase 6 Members section uses the token share-link path, not the email-invite path. |
| `workspace` / `account` naming | `budget` / `wallet` | Phase 1 | Schema, routes, domain all renamed. Some test files still mock `workspaceRepo` as the repo *interface name* — that is intentional (`budgets.test.ts:24`), not stale code. |

**Deprecated/outdated:**
- `OnboardingPage.ts` (E2E page object) currently navigates to `/onboarding` and only knows a currency picker — it must be rewritten for the 5-step `/budgets/new` wizard.
- `CreateWorkspacePage.ts` / `WorkspacesPage.ts` E2E page objects use pre-Phase-1 naming; the wizard does not reuse them.

## Runtime State Inventory

> Phase 6 retires the `/recurring` and `/onboarding` routes — light refactor surface. Reviewed against the 5 categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `onboarding_progress` is NEW — no existing rows. No renamed keys. The dev DB is nuked per milestone policy; no data migration needed. | None — new table only. |
| Live service config | None — no external service stores Phase 6 strings. Verified: no n8n/Datadog/etc. referenced in repo. | None. |
| OS-registered state | None — no OS-level registrations. Verified: no Task Scheduler / systemd / pm2 in repo. | None. |
| Secrets/env vars | None new. Existing `DATABASE_URL_*`, `BUDGET_KEK`, `BETTER_AUTH_SECRET`, `APP_URL` already cover Phase 6 (share-link URL uses `deps.env.APP_URL`). | None. |
| Build artifacts | `web` + `api` run from prebuilt Docker images (CLAUDE.md "Local Development"). After editing `apps/web`/`apps/api`/`packages`, images must be rebuilt (`make dev-build` / `docker compose build`). | Rebuild `web` + `api` images before any verification (already standard project rule). |

**Route retirement (not "runtime state" but related cleanup):** `/recurring` (delete or redirect — D-03) and `/onboarding` (301 → `/budgets/new` — UI-SPEC line 283). Both appear in `middleware.ts` `PROTECTED_ROUTES`; update that list when retiring `/onboarding`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Backend runtime, bun:test | ✓ (project standard) | 1.2.x | — |
| Postgres (Docker) | Integration tests (no DB mocks per CLAUDE.md), `make ci-gate` | ✓ via `docker compose` | 16 (project) | — none; integration tests REQUIRE real Postgres |
| Docker | `web`/`api` prebuilt images, E2E stack | ✓ (project standard) | — | — |
| shadcn registry (network) | `npx shadcn add accordion switch` | ✓ (public registry) | n/a | Manually copy the two component files from shadcn docs if offline |
| Playwright | E2E (`make test-e2e`) | ✓ | via `playwright-bdd@^8` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** shadcn registry — if offline, hand-copy `accordion.tsx`/`switch.tsx`.

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (backend), Vitest 4 + happy-dom (frontend), Playwright + playwright-bdd ^8 (E2E) |
| Config file | `apps/web/playwright.config.ts` (E2E source of truth), `bunfig.toml` (bun:test, 80% domain coverage), `apps/web/vitest.config.*` |
| Quick run command | `make test` (backend unit + integration) |
| Full suite command | `make test && make test-e2e && make ci-gate` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETT-02 | Budget name PATCH persists | integration | `bun test apps/api/test/routes/budget-identity.test.ts` | ❌ Wave 0 |
| SETT-02 | Currency locked when budget has transactions | integration | `bun test apps/api/test/routes/budget-identity.test.ts` | ❌ Wave 0 |
| SETT-03 | Cushion-mode toggle persists `cushion_mode_enabled` | integration | `bun test apps/api/test/routes/budget-settings.test.ts` (extend) | ✅ extend existing |
| SETT-06 | Generate share link returns token URL | integration | `bun test apps/api/test/routes/share-links.test.ts` | ✅ exists (`share-links.test.ts`) |
| SETT-07 | Revoke member removes membership | integration | `bun test apps/api/test/routes/budget-members.test.ts` | ❌ Wave 0 |
| SETT-07 | Last-owner blocked from leave | integration | `bun test apps/api/test/routes/budgets.test.ts` (extend) | ✅ route exists; add test |
| SETT-08 | Archive sets `archived_at`, hides budget | integration + E2E | `bun test apps/api/test/routes/budget-archive.test.ts` | ❌ Wave 0 |
| SETT-08 | Delete requires typed-name confirm | integration + E2E | `bun test apps/api/test/routes/budget-archive.test.ts` | ❌ Wave 0 |
| ONBD-02..06 | Wizard step machine end-to-end | E2E | `make test-e2e` (`features/onboarding/`) | ❌ Wave 0 |
| ONBD-07 | `onboarding_progress` resumes after refresh | integration + E2E | `bun test apps/api/test/routes/onboarding.test.ts` | ❌ Wave 0 |
| ONBD-08 | Finish redirects to `/budgets/[id]/spendings` | E2E | `make test-e2e` | ❌ Wave 0 |
| SHRD-04 | Recipient joins via valid link | E2E | `make test-e2e` (`features/share/` or `workspace/`) | partial — `share-links.test.ts` (API); ❌ E2E join page |
| All settings UI | Accordion sections render + interact | component | `cd apps/web && bun run test` | ❌ Wave 0 |
| cross-tenant | New routes + `onboarding_progress` pass tenant-leak gate | security | `make ci-gate` | ✅ gate exists; verify new routes |

### Sampling Rate
- **Per task commit:** `make test` (relevant route test) + `cd apps/web && bun run test` for component tasks
- **Per wave merge:** `make test && make ci-gate`
- **Phase gate:** `make test && make test-e2e && make ci-gate` all green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/test/routes/budget-identity.test.ts` — covers SETT-02 (name PATCH, currency lock)
- [ ] `apps/api/test/routes/budget-members.test.ts` — covers SETT-07 (revoke member)
- [ ] `apps/api/test/routes/budget-archive.test.ts` — covers SETT-08 (archive + hard-delete)
- [ ] `apps/api/test/routes/onboarding.test.ts` — covers ONBD-07 (`onboarding_progress` CRUD/resume)
- [ ] `tests/e2e/features/onboarding/*.feature` + `OnboardingPage.ts` rewrite (currently `/onboarding`-only, currency-picker-only) + `onboarding.steps.ts`
- [ ] `tests/e2e/features/settings/budget-settings.feature` (Danger Zone, cushion toggle, members) + extend `SettingsPage.ts` + `settings.steps.ts`
- [ ] `tests/e2e/features/share/join.feature` + new `JoinPage.ts` page object
- [ ] Vitest component tests for `settings-accordion`, `wizard-stepper`, `wizard-layout`, `share-url-field`, `join-page-card`
- [ ] Route-ordering regression test for new `/:id` sub-paths (mirror `budgets.test.ts:167`)
- [ ] Extend `route-coverage-audit.test.ts` — every new route needs ≥1 integration test (CLAUDE.md rule 8)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth session; `c.get("session")` 401 gate on every mutating endpoint. Join-page accept POST is auth-gated (`share-join.ts:68`). |
| V3 Session Management | yes | Better Auth session cookie (`better-auth.session_token`); middleware already manages stale-cookie strip. No new session logic. |
| V4 Access Control | yes | Tenant gate (`tenantIds.includes(budgetId)` → 404, no existence leak). Owner-only gate for archive/delete/revoke (role check → 403). Postgres RLS on `budgets`/`budget_members` (`pgPolicy` in `schema.ts`). |
| V5 Input Validation | yes | Zod via `zValidator("json", schema)` on every new PATCH/POST. Budget name max-length, currency `length(3)`, typed-name delete confirmation validated server-side too (not just client). |
| V6 Cryptography | no (new) | Share-link tokens minted by existing `createShareLink` (Phase 2) — no new crypto in Phase 6. |

### Known Threat Patterns for Next.js + Hono + Postgres/Drizzle

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant budget access via guessed `:id` | Information Disclosure / Elevation | `tenantIds.includes(budgetId)` gate → 404 (verified pattern `budgets.ts:343`); RLS as defense-in-depth. |
| Non-owner archives/deletes a shared budget | Elevation of Privilege | Owner-role lookup before mutation (`budgets.ts:184` pattern) → 403. |
| SQL injection in new endpoints | Tampering | Drizzle parameterized queries / `sql` template tags only (existing `budgets.ts` uses `${...}` bind params). Never string-concat. |
| Typed-name delete bypassed by hitting the API directly | Tampering | Server MUST re-validate the typed name equals the budget name — do not rely on the client to gate. |
| Public join page leaking budget internals | Information Disclosure | `GET /budgets/join/:token` returns only `{budgetName,isExpired,isRevoked,isUsed}` (verified `share-join.ts:47`) — no member list, no amounts. Keep it that minimal. |
| Share-link token brute force | Spoofing | Token IS the credential (per `share-join.ts:34` comment); tokens are unguessable random; 7-day TTL + single-use limit the window. No Phase 6 change. |
| `onboarding_progress` cross-user read | Information Disclosure | Keyed by `user_id`; queries MUST filter on the session user, not a request-supplied `user_id`. No RLS by tenant (it is per-user) — enforce in the handler. |
| CSRF on state-changing endpoints | Tampering | Better Auth session cookie + same-site; new POST/PATCH endpoints inherit existing CSRF posture. Verify no new endpoint is GET-with-side-effects. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn `accordion` and `switch` are still in the official registry and install cleanly with the project's `style=new-york`/`baseColor=zinc` preset | Standard Stack | Low — both are core shadcn components; if removed, hand-copy from docs. |
| A2 | `onboarding_progress` should NOT be tenant-policied (keyed by `user_id`, no `tenant_id`) | Architecture Patterns / Pitfall 2 | Medium — if the CI gate expects all `tenancy.*` tables policied, planning must allowlist it or move the table to a non-tenancy schema. |
| A3 | The existing `POST /budget-settings/budget-mode` may or may not already sync `budgets.cushion_mode_enabled` — not verified | Standard Stack / Pitfall 3 / Q1 | High — determines whether a new cushion endpoint is needed at all. Planner MUST resolve before writing the cushion task. |
| A4 | `GET /budgets/:id` has no `has_transactions` field today (verified absent at `budgets.ts:130-140`); a cheap COUNT/EXISTS query is acceptable to add it | Pitfall 4 | Low — confirmed absent; adding it is a small, well-bounded change. |
| A5 | The `middleware.ts` `PROTECTED_ROUTES` `bare.startsWith("/budgets")` guard currently WOULD bounce an unauthenticated `/budgets/join/*` request | Pitfall 5 | Medium — verified by reading the guard; planner must add an explicit `/budgets/join` allowlist or the public join view is broken. |
| A6 | ROADMAP success criteria override the UI-SPEC where they conflict (redirect to `/budgets/[id]/spendings`, not `/budgets/[id]`) | Pitfall 6 / Q3 | Medium — if UI-SPEC is followed verbatim, ONBD-08 + SHRD-04 fail verification. |

## Open Questions

1. **Does `POST /budget-settings/budget-mode` (`toggleBudgetMode` use case) already update `budgets.cushion_mode_enabled`?**
   - What we know: The route exists (`budget-settings.ts:17`), takes `NORMAL|CUSHION`, writes SCD-2 `budget_mode_history`. The boolean column exists separately (`schema.ts:37`).
   - What's unclear: Whether the use case writes BOTH the history row and the current-state boolean.
   - Recommendation: Planner (or a quick code-read of `packages/budgeting` `toggleBudgetMode` / `budget-mode-repo.ts`) must confirm. If it syncs the boolean → Settings toggle reuses that route. If not → extend that use case; do NOT add a divergent PATCH.

2. **How does `make ci-gate` enumerate tables for the tenant-leak sweep?**
   - What we know: 6 security tests; targets `budgets`/`wallets`; `onboarding_progress` is per-user.
   - What's unclear: Whether the gate iterates all `tenancy.*` tables and asserts an RLS policy on each.
   - Recommendation: Inspect `apps/api/test/architecture/` + `apps/api/test/schema/` at planning time. Either place `onboarding_progress` outside the `tenancy` schema or allowlist it.

3. **Onboarding / share-link redirect target — `/budgets/[id]` or `/budgets/[id]/spendings`?**
   - What we know: ROADMAP SC-4 & SC-5 + ONBD-08 + SHRD-04 all say `/budgets/[new_id]/spendings`. UI-SPEC step 5 (line 272) says `/budgets/[id]`.
   - Recommendation: Follow the ROADMAP (`/budgets/[id]/spendings`) — it is the verification target. Treat the UI-SPEC value as a drift bug.

4. **Member-list read endpoint — does one already exist?**
   - What we know: `workspaceRepo.listMembers` exists in the repo interface (mocked at `budgets.test.ts:29`). No `GET /budgets/:id/members` route was found in the `budgets.ts` grep.
   - Recommendation: Add a `GET /budgets/:id/members` endpoint backed by `workspaceRepo.listMembers` (or Better Auth org members), tenant-gated. Small, well-bounded.

5. **Where does the public join page route file live in the Next.js tree?**
   - What we know: It must be OUTSIDE the `(app)` route group to avoid auth chrome (Pitfall 5).
   - Recommendation: `apps/web/src/app/[locale]/budgets/join/[token]/page.tsx` (sibling of `(app)`, still locale-prefixed). Confirm no `(app)/budgets/...` segment shadows it.

## Sources

### Primary (HIGH confidence)
- `apps/api/src/routes/budgets.ts` — full route enumeration: `POST /`, `GET /active`, `PUT /active`, `GET /:id`, `POST /:id/invitations`, `POST /:id/leave`, `POST /:id/transfer-ownership`, `PUT /:id/shares`, `GET /:id/home-summary`, `GET /:id/reserves`, `POST /:id/reserves/:categoryId/adjust`, `POST /:id/share`, `DELETE /share/:linkId`
- `apps/api/src/routes/share-join.ts` — `GET /:token` (public) + `POST /:token/accept` (authed) — Phase 2, complete
- `apps/api/src/routes/budget-settings.ts` — existing `POST /budget-mode` (SCD-2 mode toggle)
- `packages/tenancy/src/adapters/persistence/schema.ts` — `budgets` table (`cushion_mode_enabled`, `reserves_enabled`, NO `archived_at`), `budget_members`, `budget_invitations`, RLS `pgPolicy` patterns
- `apps/api/test/routes/budgets.test.ts` — bun:test integration pattern + route-ordering regression test
- `apps/api/test/routes/` — full test inventory (33 files; `share-links.test.ts`, `budget-settings.test.ts` exist)
- `tests/e2e/` — playwright-bdd structure: `features/`, `steps/`, `pages/`; `OnboardingPage.ts`, `SettingsPage.ts` (both pre-Phase-6, need rewrite)
- `apps/web/src/middleware.ts` — `PROTECTED_ROUTES` includes `/onboarding`, `/budgets`, `/settings`
- `apps/migrator/drizzle.config.ts` + `apps/migrator/src` — schema[] registration + advisory-lock + `post-migration.sql` flow
- `.planning/ROADMAP.md` §Phase 6 — goal, 5 success criteria, depends-on Phase 5
- `.planning/REQUIREMENTS.md` — SETT-01..09, ONBD-01..09, SHRD-04 verbatim
- `.planning/config.json` — workflow flags (nyquist_validation, security_enforcement, ui_phase)
- `apps/web` placeholder routes: `budgets/[id]/settings/page.tsx`, `budgets/new/page.tsx`, stray `onboarding/page.tsx`
- `apps/web/src/components/ui/` — confirmed inventory: NO `accordion.tsx`, NO `switch.tsx`

### Secondary (MEDIUM confidence)
- Memory observations 6321, 6323, 6324 (2026-05-22) — corroborate API gaps + missing `onboarding_progress`/`archived_at`
- `package.json` files — `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `playwright-bdd@^8`

### Tertiary (LOW confidence)
- None — all claims verified against codebase or planning docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library version verified against `package.json`; reuse targets verified in source.
- Architecture: HIGH — route patterns, tenant gate, migrator flow all read directly from source.
- Pitfalls: HIGH — route-ordering, currency-lock-signal, public-route-gating, redirect-mismatch all verified against current code; cushion write-path divergence flagged as the one unverified item (Q1).

**Research date:** 2026-05-22
**Valid until:** 2026-06-21 (stable internal codebase; ~30 days). Re-verify if Phase 5 lands further `budgets.ts` or schema changes before Phase 6 planning.
