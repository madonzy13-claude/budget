# Phase 6: Settings, Onboarding & Share UI - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 ships three settings-shaped form flows that share form primitives and locale rendering:

1. **Budget Settings tab** (`/budgets/[id]/settings`) — 5 vertically-stacked sections: Budget identity, Cushion mode toggle, Recurring rules CRUD, Members (SHARED only), Danger zone.
2. **Onboarding wizard** (`/budgets/new`) — 5-step budget-creation wizard reached after signup and from the switcher `+` button.
3. **Share-link recipient join page** — public confirmation page consuming the Phase 2 share-join backend.

Requirements: SETT-01..09, ONBD-01..09, SHRD-04. Section order, the 5 wizard steps, and redirect targets are FIXED by ROADMAP success criteria + `v1.1-SPEC` §6/§11 — discussion clarified HOW only.

**Not in this phase:** LLM/conversational onboarding (deferred, `v1.1-SPEC` §15); full i18n rewrite (Phase 8); revoke-share-links UI (SHRD-05 — not in Phase 6 requirement set); transfer ownership; restore-archived-budget UI; PWA/offline/push.
</domain>

<decisions>
## Implementation Decisions

### Settings field interaction

- **D-01:** Budget identity fields (name, currency) use **inline-autosave per field** — click → edit → blur saves → toast. Reuses the Phase 4 grid / Phase 5 Wallets autosave pattern. No Save button.
- **D-02:** Cushion mode toggle **persists instantly + toast** (`PATCH budgets.cushion_mode_enabled`). Effect is fully reversible (re-points all grid headers + reserve/overspent calc between the `planned` and `cushion` columns — no data lost), so no confirm dialog.
- **D-03:** Recurring rules section **reuses the existing Phase 4 components** (`recurring-rules-list`, `recurring-rule-form`); list rendered inline, add/edit form opens in the **Sheet** primitive. The standalone `/recurring` route is **retired** once Settings absorbs it.
- **D-04:** The 5 settings sections render as **accordion collapsibles** (one section open at a time). No accordion primitive exists in `components/ui/` yet — Phase 6 adds a Radix-backed `accordion.tsx`.

### Onboarding wizard

- **D-05:** Wizard is a **single-page step machine** at `/budgets/new` — one route, React step state, no per-step URLs.
- **D-06:** Partial answers persist by **creating the budget row at step 1** and PATCHing it on every subsequent step. `onboarding_progress(user_id, step, completed_at)` tracks only the step number (matches the spec's 3-column schema exactly). Resume re-opens the half-built budget at the saved step.
- **D-07:** Step progress shown as a **numbered 1–5 segmented stepper**.
- **D-08:** Incomplete `onboarding_progress` on sign-in → **force-redirect into the wizard** at the saved step (layout/middleware guard). Back navigation between steps allowed.

### Danger zone & archive

- **D-09:** Archive = set `archived_at` and **hide the budget from home cards + the switcher dropdown**. Data fully retained in DB.
- **D-10:** **No restore/un-archive UI in v1.1** — archive is one-way in the UI (DB row kept).
- **D-11:** Archive + Delete are **owner-only**. Non-owner members see only "Leave budget" in the Danger zone.
- **D-12:** Last-owner protection: a SHARED budget's last owner is **blocked from "Leave budget"**; message directs them to Delete instead. No ownership-transfer feature in v1.1.
- **D-13:** Delete keeps the spec-locked **typed-name confirmation** (type exact budget name to enable hard-delete) in an `alert-dialog`.

### Members & share-link

- **D-14:** "Generate share link" → **shows the URL in a read-only field with a Copy button**. The generated link is **ephemeral** — displayed for the current session, gone on reload; no persistent outstanding-links list (that is SHRD-05, out of Phase 6 scope).
- **D-15:** Share links use a **fixed 7-day TTL** — no TTL picker in the UI. SHRD-03 "configurable" is satisfied at the API level only.
- **D-16:** Revoking a member requires a **confirm dialog** (`alert-dialog`) — destructive and affects another person's access.

### Claude's Discretion

- Which accordion section is open by default (suggest Budget identity).
- Exact stepper / progress visual treatment within DESIGN.md tokens; toast copy wording.
- Whether the stray `/onboarding` route is hard-deleted or redirected to `/budgets/new`.
- Members section is simply hidden for PRIVATE budgets; empty-state copy is discretionary.
- Field ordering inside the recurring-rule-form Sheet.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 6 — scope, success criteria 1–5, depends-on Phase 5
- `.planning/REQUIREMENTS.md` §SETT (SETT-01..09), §ONBD (ONBD-01..09), §SHRD (SHRD-04) — locked REQ-IDs for this phase

### Milestone spec

- `.planning/v1.1-SPEC.md` §6 (Settings tab — 5 sections), §11 (Onboarding wizard — 5 steps + `onboarding_progress`), §2 (routes — `/budgets/new`, `/budgets/[id]/settings`), §15 (out of scope — **LLM onboarding deferred, manual templates only**)
- `.planning/PROJECT.md` — milestone goal, dual planned/cushion budget concept, GDPR right-to-delete

### Project conventions

- `CLAUDE.md` — TDD-first, no DB mocks, hexagonal per context, Money at adapter boundary, DESIGN.md authority, Docker on for verification, EN/PL/UK from day one
- `DESIGN.md` — Binance dark canvas, single yellow accent (yellow = primary action only; neutral `+Add`/Back/Skip buttons), Inter + IBM Plex Sans

### Prior-phase carry-forward (locked decisions still in force)

- `.planning/phases/03-navigation-home-bdp-frame/03-CONTEXT.md` — BDP tab frame, sticky pill tabs, yellow-accent discipline, budget switcher `+` button
- `.planning/phases/04-spendings-grid/04-CONTEXT.md` — inline-edit + autosave + toast pattern, recurring drafts, field components in `components/budgeting/fields/`
- `.planning/phases/05-reserves-wallets-tabs/05-CONTEXT.md` — Wallets inline-edit interaction model, toast/notification primitive API

### CI gates & tests

- `make test` — bun:test backend unit + integration (new tests for budget identity PATCH, cushion toggle, archive/delete, generate-link, onboarding endpoints)
- `make test-e2e` — Playwright BDD (Gherkin); new features: settings sections, onboarding wizard end-to-end, share-link recipient join
- `make ci-gate` — tenant-leak gate; new `onboarding_progress` table + new routes must pass cross-tenant tests
- `cd apps/web && bun run test` — Vitest component tests for new settings/wizard/join components
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `apps/web/src/components/budgeting/recurring-rules-list.tsx` + `recurring-rule-form.tsx` — Phase 4 recurring CRUD; reuse directly in the Settings Recurring section (form in Sheet).
- `apps/web/src/components/ui/sheet.tsx` — Radix Dialog right-side panel; hosts the recurring-rule-form.
- `apps/web/src/components/ui/alert-dialog.tsx` — confirmation dialogs for Delete (typed-name), revoke member, blocked Leave.
- `apps/web/src/components/ui/` primitives available: button, input, label, select, checkbox, badge, tooltip, separator, tabs, dialog, popover, sonner (toast), card, command, avatar, skeleton. **No accordion** — Phase 6 must add `accordion.tsx` (Radix Accordion).
- `apps/web/src/components/budgeting/fields/` — `amount-input`, `date-input`, `fx-preview-line` — reuse in recurring-rule-form and currency input.
- `apps/web/src/components/settings/` — `display-currency-picker`, `locale-select`, `sessions-list` — these belong to the _global account_ settings page (`/settings`), distinct from the budget Settings tab; useful as form-section pattern references.
- `apps/api/src/routes/share-join.ts` — **share-join backend already shipped (Phase 2)**: `GET /budgets/join/:token` (public — returns `{budgetName,isExpired,isRevoked,isUsed}`), `POST /budgets/join/:token/accept` (auth — `{budgetId}`; 410 Revoked/Expired, 409 AlreadyUsed). The recipient join page consumes these directly.
- `packages/tenancy` — `DrizzleBudgetShareLinkRepo`, `resolveShareLink`, `acceptShareLink` (share-link application services).

### Established Patterns

- Inline-edit + autosave + toast — Phase 4 grid, Phase 5 Wallets. Budget identity fields (D-01) follow it exactly.
- `cushion_mode_enabled` already wired: column at `packages/tenancy/src/adapters/persistence/schema.ts:37`, domain at `packages/tenancy/src/domain/budget.ts:19`, exposed by `apps/api/src/routes/budgets.ts:138`. Phase 6 adds the toggle UI + a PATCH path.
- Routes live under `apps/web/src/app/[locale]/(app)/` — locale-prefixed Next App Router.
- Better Auth organizations plugin backs SHARED budgets (org row = shared budget); members list + roles (owner/member) come from the org.

### Integration Points

- `apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx` — currently a **placeholder**; Phase 6 fills it with the 5-section accordion.
- `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` — currently a **placeholder**; Phase 6 fills it with the 5-step wizard.
- Stray `apps/web/src/app/[locale]/(app)/onboarding/page.tsx` — a second onboarding route; reconcile (delete or redirect). Canonical wizard route is `/budgets/new` per `v1.1-SPEC` §2.
- Standalone `apps/web/src/app/[locale]/(app)/recurring/` route — retire once the Settings Recurring section absorbs it (D-03).
- New DB table `onboarding_progress(user_id, step, completed_at)` — **does not exist**; Phase 6 adds it (dev DB is nuked, no migration script per milestone policy).
- New recipient-facing share-link join page route — public for the view step (no auth gate), auth required to accept.
- Backend endpoints to add/verify in `apps/api/src/routes/budgets.ts`: budget identity PATCH (name/currency), cushion toggle PATCH, archive, hard-delete, generate-share-link (create), revoke member, leave budget. `grep` of the route file returned no obvious handler list — **researcher must enumerate what already exists vs. is new**.

### Open implementation details (for researcher / planner)

- Budget created at step 1 (D-06) but `currency` is set at step 2 — decide: step 1 INSERTs with a locale-guessed default currency then step 2 PATCHes, OR defer the INSERT to the end of step 2. Currency column is likely `NOT NULL`.
- "Currency editable until first transaction, then locked + tooltip" (SETT-02) — needs a backend signal for "budget has ≥1 transaction". Check whether the budgets API already exposes a transaction count / first-txn flag.
- Force-redirect on incomplete onboarding (D-08) — needs a layout or middleware guard reading `onboarding_progress`.
- Clipboard copy of the share URL needs a secure context (https) — relevant for E2E base-URL setup.
  </code_context>

<specifics>
## Specific Ideas

- **Onboarding is manual templates only — NO LLM.** `v1.1-SPEC` §15 explicitly defers the LLM/conversational onboarding wizard. The "conversational Q&A wizard" in `PROJECT.md` Requirements is a future-version aspiration; Phase 6 ships the deterministic 5-step form.
- **Starter categories are a fixed list:** Housing, Groceries, Transport, Eating Out, Entertainment, Health, Subscriptions, Other — each selected category pre-populates `planned = 0` and `cushion = 0`.
- **Yellow-accent discipline is sacred** (carry-forward from Phase 3). Wizard primary CTA ("Next" / "Create budget") = yellow; "Skip" / "Back" = neutral. `+Add` dashed buttons stay neutral.
- **Cushion mechanic** (informs implementation): every category carries two limits — `planned` (normal) and `cushion` (tighter safety budget). `cushion_mode_enabled` is a budget-wide switch selecting which column is the active limit for grid headers, overspent detection, and reserve auto-compute. Toggling never mutates the underlying numbers.
- New Phase 6 UI strings delivered in **EN + PL + UK** per project rule, even though the full i18n rewrite is Phase 8.
  </specifics>

<deferred>
## Deferred Ideas

- **Restore / un-archive budget UI** — no un-archive surface in v1.1; candidate for a later phase.
- **Outstanding share-links list with per-link revoke (SHRD-05)** — not in Phase 6's requirement set (Phase 6 covers SHRD-04 only); Phase 6 is generate-only.
- **Transfer ownership** — no ownership-transfer feature in v1.1; last owner must Delete the budget.
- **Share-link TTL picker** — fixed 7-day TTL in v1.1; configurable TTL UI deferred.

None — discussion stayed within phase scope.
</deferred>

---

_Phase: 6-settings-onboarding-share-ui_
_Context gathered: 2026-05-22_
