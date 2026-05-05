# Phase 1: Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 1-foundations
**Areas discussed:** Personal vs shared scope model (the user opted to discuss only this area; family-workspace mechanic, crypto-shredding key store, and Postgres schema layout were resolved by Claude's discretion within CONTEXT.md and tied back to STATE.md open items).

---

## Personal vs Shared Scope Model

| Option | Description | Selected |
|--------|-------------|----------|
| A. Dual workspaces | Per-user `personal_ws` (1-member) + optional `family_ws`. Single `tenant_id` column. Maps 1:1 to Better-Auth `organization` plugin. UI = workspace switcher. TENT-06 trivial. | (rejected — too restrictive) |
| B. Single workspace + scope column | One workspace; rows tagged PRIVATE/SHARED with `owner_user_id`. Cross-scope reads trivial. Leave-family edge case messy. | (rejected) |
| C. Hybrid (two GUCs) | Both `app.user_id` + `app.family_id` GUCs set per request. Most flexible, most index/RLS complexity. | (rejected) |
| **Custom — Multi-workspace with persisted multi-select filter** | User can be member of N workspaces (N PRIVATE + N SHARED). Workspace `kind` enum. UI = checkbox list, default = private only, restored across sessions. | ✓ |

**User's choice:** Custom — generalized variant of A. "Make sure you do not limit to only one private and one shared." "User should be able by selecting checkboxes select which budgets he wants to see, by default only private is selected, but user can also select shared at the same time, then he can see both (you should remember user selection and show same as he selected next time)."

**Notes / domain-specific follow-ups raised by user:**
- Each workspace has wallets assigned to it (workspace_id FK on accounts → Phase 2).
- SHARED workspace has per-member contribution shares — global percentage AND per-category percentage. Edited on workspace edit page.
- Member can add money to shared wallet in any currency; system shows FX-preview ("will convert at rate X") and converts.
- If a member deposits more than their share → emit task to refund them OR ask other member to top up more.
- Shared reserve attached to shared account.

These domain mechanics fall outside Phase 1 (they live in Phase 2 / 3 / 4). User explicitly authorized: "Add to REQUIREMENTS.md + ROADMAP.md now". Captured as TENT-09..13, MONY-09, BDGT-08, EXPN-13, RSRV-08, TASK-07, TASK-08 (12 new requirements; +5 to Phase 1, +2 to Phase 2, +1 to Phase 3, +2 to Phase 4; v1 total now 138).

---

## RLS / Tenant Context Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Array GUC | `app.tenant_ids` array; RLS uses `= ANY(...)`. Single query reads cross-workspace. | ✓ |
| User-id GUC + membership join | `app.user_id`; RLS predicate joins `workspace_members`. Slightly more dynamic, more index pressure. | (rejected) |
| Per-query single tenant | One workspace per query; app fans out N queries. Simplest predicate; harder cross-ws aggregates. | (rejected) |

**User's choice:** Array GUC.
**Notes:** Captured as D-08 in CONTEXT.md. Tenant-leak CI gate (D-11) verifies fail-closed behavior when GUC is unset.

---

## Auto-Create Workspace at Signup

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one private workspace | Reduces empty-state friction; user can rename later. | (rejected) |
| **No — user must create their first workspace** | Signup lands on "create your first budget" empty state. | ✓ |

**User's choice:** No.
**Notes:** Captured as D-03. Empty state is intentional — every workspace creation is a deliberate act.

---

## Workspace `kind` Field — Explicit or Computed

| Option | Description | Selected |
|--------|-------------|----------|
| **Explicit `kind` enum (PRIVATE \| SHARED)** | Stored on workspace row. UI groups filter cleanly. | ✓ |
| Computed from member count | PRIVATE = 1 member, SHARED = >1. No enum. Ambiguous edge cases. | (rejected) |

**User's choice:** Explicit.
**Notes:** Captured as D-02. Inviting a member to a PRIVATE workspace is rejected at the application layer — owner must convert via explicit "convert to shared" flow (deferred UX detail noted in 01-CONTEXT.md `<deferred>`).

---

## Cross-Workspace Display Currency

| Option | Description | Selected |
|--------|-------------|----------|
| **User display-currency setting** | User picks one global display currency in their settings; cross-ws totals convert to it via FX. Each per-ws view still uses its own default. | ✓ |
| Per-workspace group, no merge | Side-by-side totals; no merged number. | (rejected) |
| First-selected workspace's default | Order-dependent; brittle. | (rejected) |

**User's choice:** "On the global level user should be able to select default currency per workspace. One workspace may have only one currency. But when user adds money to shared wallet he may select currency and that will be automatically converted by actual exchange rate." Plus follow-up: "Users totals (from all his workspaces) should be in a globally selected currency, the currency user selected in settings. But each workspace should be shown in currency that workspace is configured in."

**Notes:** Captured as D-04 (workspace `default_currency` immutable post-creation) + D-05 (user `display_currency` global setting) + MONY-09 (new requirement). EXPN-13 (FX-preview deposit) captures the "add money to shared wallet, see rate before save" UX in Phase 2.

---

## Capture Strategy for New Domain Requirements

| Option | Description | Selected |
|--------|-------------|----------|
| **Add to REQUIREMENTS.md + ROADMAP.md now** | New req IDs added; phase counts updated; flow into Phase 2/3/4 plans. | ✓ |
| Defer to v1.x | Park in CONTEXT.md only; v1 ships equal-share co-ownership. | (rejected) |
| Capture in Deferred + decide per-feature later | Park with target-phase suggestions; promote during Phase 2 discuss. | (rejected) |

**User's choice:** Add now.
**Notes:** REQUIREMENTS.md updated with TENT-09..13, MONY-09, BDGT-08, EXPN-13, RSRV-08, TASK-07, TASK-08. ROADMAP.md updated: Phase 1 reqs 37→43, Phase 2 27→29, Phase 3 20→21, Phase 4 17→19; total v1 reqs 126→138; Phase 1 success criterion #2 rewritten to reflect multi-workspace mechanic.

---

## Claude's Discretion (areas the user did NOT pick to discuss but are still Phase 1 implementation decisions)

These were resolved in `01-CONTEXT.md` rather than asked, partly because they are technical-implementation rather than vision-level, partly because STATE.md flagged two of them as already-open. They are tagged D-XX in CONTEXT.md so the planner can re-open any of them with explicit cause.

- **Family-workspace mechanic** (Better-Auth `organization` plugin vs domain-owned tables) → resolved D-12 = use the plugin as source of truth.
- **Crypto-shredding key store** → resolved D-16 = libsodium app-side + KEK from env.
- **Postgres schema layout** → resolved D-17 = real Postgres schemas, one per bounded context.
- **Email verification policy** → resolved D-13 = grace login, banner + verified-action gate.
- **Password reset TTL** → resolved D-14 = 30 minutes, single-use.
- **Session storage** → resolved D-15 = Better-Auth default Postgres-backed sessions.
- **Result type library** → resolved D-21 = neverthrow.
- **Public-facing IDs** → resolved D-22 = UUID v7 internal, nanoid(12) for slugs.
- **`audit_history` shape** → resolved D-24 = typed-event log with full row before/after.
- **Outbox dispatcher mechanic** → resolved D-25 = pg-boss + `SKIP LOCKED`.
- **Monorepo tooling** → resolved D-26 = Bun workspaces (no Turborepo for v1).
- **Test runner split** → resolved D-28 = bun:test backend, Vitest 4 frontend, Playwright E2E, shared Compose `test-db` over testcontainers.
- **Migration role separation** → resolved D-18 = dedicated `migrator` role + advisory lock + one-shot init container.
- **i18n catalog format** → resolved D-29 = next-intl JSON for web, React Email locale templates for transactional email.

## Deferred Ideas

(All listed in `01-CONTEXT.md` `<deferred>` block. Most were promoted to formal v1 requirements; remainder are workflow notes for Phase 2 plan-phase or v1.x backlog.)

- **PRIVATE → SHARED conversion flow** — UX detail for Phase 1 plan-phase.
- **Workspace deletion / archive** — v1.x.
- **Cross-workspace transfer** — v2+.
