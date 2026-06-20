---
quick_id: 260613-hig
type: execute
mode: quick
wave: 1
autonomous: false
files_modified:
  - packages/tenancy/src/adapters/persistence/workspace-repo.ts
  - packages/budgeting/src/adapters/persistence/task-repo.ts
  - drizzle/0034_budget_nav_perf_indexes.sql
  - drizzle/meta/_journal.json
  - apps/api/test/routes/budgets-active.test.ts
  - apps/web/src/app/[locale]/(app)/loading.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/loading.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/loading.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/loading.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/loading.tsx
  - packages/identity/src/adapters/persistence/better-auth.ts

must_haves:
  truths:
    - "GET /budgets/active returns in <~50ms (was ~1900ms) for uat-probe-1"
    - "listForUser returns byte-identical budget rows + pendingTasksCount pre/post fix"
    - "EXPLAIN of the rewritten query as app_role shows NO JIT block and total cost < 100k"
    - "Home-card badge count still equals the BDP banner count (banner parity)"
    - "Navigating home->BDP and between BDP tabs shows an instant skeleton (no ~2s frozen old page)"
    - "Session still validates AND revokes after logout with cookieCache enabled"
  artifacts:
    - path: "drizzle/0034_budget_nav_perf_indexes.sql"
      provides: "tenancy.budget_members(user_id) index (+ any EXPLAIN-justified index)"
      contains: "CREATE INDEX"
    - path: "packages/tenancy/src/adapters/persistence/workspace-repo.ts"
      provides: "scoped tk subquery + uuid-cast draft_id comparison"
    - path: "packages/budgeting/src/adapters/persistence/task-repo.ts"
      provides: "listPending uuid-cast draft_id comparison (kept in sync with tk)"
    - path: "apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx"
      provides: "Suspense skeleton for BDP route transitions"
  key_links:
    - from: "workspace-repo.ts tk subquery"
      to: "task-repo.ts listPending predicate"
      via: "identical pending-task actionability predicate"
      pattern: "payload_json->>'draft_id'\\)::uuid = el.id"
    - from: "drizzle/0034_*.sql"
      to: "drizzle/meta/_journal.json"
      via: "new journal entry idx 34"
      pattern: "0034_budget_nav_perf_indexes"
---

<objective>
Kill the ~1.9s-per-navigation cost on GET /budgets/active. The BDP layout calls
/budgets/active on EVERY navigation; the handler only calls
`workspaceRepo.listForUser`, whose SELECT costs ~1919ms — almost entirely
Postgres JIT compile time triggered by an unscoped pending-tasks subquery.

Make the query cheap BY CONSTRUCTION (cost < jit_above_cost 100k regardless of
the `SET LOCAL jit=off` GUC, which is verified ineffective in the live path):

1. Scope the `tk` pending-tasks aggregate to the user's budgets (was: ALL ~4446
   system-wide PENDING tasks).
2. Drop the `el.id::text = ...->>'draft_id'` cast that defeats the expense_ledger
   uuid PK index → use `(payload_json->>'draft_id')::uuid = el.id` with a
   malformed-uuid guard. Apply the SAME change to task-repo `listPending` so
   banner parity holds.
3. Add `tenancy.budget_members(user_id)` index via migration 0034.

Plus low-risk nav-feel wins: add `loading.tsx` skeletons (no Suspense boundary
exists anywhere today → every nav freezes the old page) and enable a short
Better Auth `session.cookieCache` (removes a session DB lookup on every API
fetch; a spendings nav = ~8 fetches = 8 session lookups today).

Purpose: dominant per-navigation latency win + instant-feeling navigation.
Output: rewritten scoped query, index migration, route skeletons, cookieCache.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
All claims confirmed against current code (file:line):

- Handler: apps/api/src/routes/budgets.ts:90-97 — only calls
  `workspaceRepo.listForUser(userId)`. Trivial.
- The query: packages/tenancy/src/adapters/persistence/workspace-repo.ts:70-177.
  - lines 84-99: member budget_ids materialized into `app.tenant_ids` GUC
    (SET LOCAL, UUID-sanitized) BEFORE the main query. This list is already
    computed in app code — REUSE it to scope the `tk` subquery.
  - line 107: `SET LOCAL jit = off` (the dn1 mitigation — leave as harmless
    defense-in-depth, do NOT depend on it).
  - lines 126-158: the `tk` LEFT JOIN subquery — aggregates `budgeting.tasks`
    for ALL budgets system-wide (NO budget_id scope). 4446 PENDING rows live.
  - line 143: `el.id::text = t.payload_json->>'draft_id'` — `::text` cast
    defeats the expense_ledger uuid PK index → seq scan over 47,608 rows per
    CONFIRM_DRAFT task. THIS is the cost bomb.
  - line 159: `WHERE m.user_id = ${userId}` — drives the per-user scope of the
    OUTER query but does NOT reach inside `tk`.
- task-repo.ts listPending: packages/budgeting/src/adapters/persistence/task-repo.ts:144-170
  — the SAME actionability predicate (also `el.id::text = ...`). MUST stay in
  sync with `tk` (banner-parity test enforces). Both get the cast fix.
- draft_id is ALWAYS a uuid: create-recurring-rule.ts:178-186,196-208 sets
  `draft_id: draftId` where draftId = expense_ledger.id (uuid PK from RETURNING).
  ConfirmDraftPayload.draft_id: string (ports/task-repo.ts:69). The guard is
  only for legacy/malformed rows so the ::uuid cast can never throw.
- Migration mechanism: apps/migrator/src/migrate.ts uses drizzle journal-based
  `migrate()` with migrationsFolder = repo-root `drizzle/`. Journal at
  drizzle/meta/\_journal.json has 33 entries (all version "7"; last tag
  0033_app_role_category_purge_grants, idx 33). Next: idx 34, tag
  0034_budget_nav_perf_indexes. Migrations run inside the migrator tx → plain
  CREATE INDEX (not CONCURRENTLY) is correct for dev; CONCURRENTLY can't run in
  a tx anyway. (Prod note: this table is 7679 rows — plain CREATE INDEX locks
  it for milliseconds; acceptable. Documented in the migration header.)
- tenancy.budget_members: PK on id only, NO index on user_id (7679 rows).
- loading.tsx: ZERO exist anywhere in apps/web/src (confirmed by find). Home
  page (page.tsx:34) uses fetchActiveBudgets (cache()-wrapped) + per-card
  Suspense, but has no route-transition loading.tsx.
- better-auth.ts (packages/identity/.../better-auth.ts:40-184): NO `session`
  config block → no cookieCache → auth.api.getSession hits identity.sessions
  on every request.
- budget-fetch.server.ts:31 — serverApiFetch defaults cache:"no-store".
- BDP tab pages: spendings/page.tsx:58 + wallets/page.tsx:27 re-fetch
  /budgets/{id} that layout.tsx:57 already fetched (dedup opportunity, LOW
  priority — out of scope this plan, noted as follow-up).
  </verified_facts>

<rewritten_subquery>
The `tk` subquery becomes scoped + uuid-cast. memberBudgetIds is already
sanitized to UUID shape in app code (lines 91-93) — build a comma-quoted
literal IN-list (PG GUCs/IN-lists can't take binds in sql.raw, but the values
are already strictly /^[0-9a-fA-F-]{36}$/). Prefer correlating the subquery to
the OUTER budget (`t.budget_id = w.id`) so the planner restricts it to the
joined ~15 budgets — this avoids any raw IN-list injection entirely and is the
SAFEST construction:

LEFT JOIN LATERAL (
SELECT COUNT(\*)::bigint AS pending
FROM budgeting.tasks t
WHERE t.budget_id = w.id -- SCOPE: correlate to the outer budget
AND t.status = 'PENDING'
AND (
t.kind <> 'CONFIRM_DRAFT'
OR EXISTS (
SELECT 1
FROM budgeting.expense_ledger el
WHERE el.deleted_at IS NULL
AND el.dismissed_at IS NULL
AND el.confirmed_at IS NULL
AND el.tenant_id = t.tenant_id
AND (t.payload_json->>'draft_id') ~ '^[0-9a-fA-F-]{36}$' -- guard
AND (t.payload_json->>'draft_id')::uuid = el.id -- uuid PK index
AND NOT EXISTS (
SELECT 1
FROM budgeting.categories c
WHERE c.id = el.category_id
AND c.tenant_id = el.tenant_id
AND c.archived_at IS NOT NULL
)
)
)
) tk ON true

Notes:

- LATERAL correlation `t.budget_id = w.id` makes the planner aggregate ~15
  budgets' tasks, not 4446 — the cost driver disappears. (A non-lateral
  GROUP BY subquery with `t.budget_id IN (<member ids>)` is an acceptable
  alternative; LATERAL is cleaner and needs no raw IN-list.)
- The uuid-shape guard (`~ '^[0-9a-fA-F-]{36}$'`) is evaluated BEFORE the
  `::uuid` cast (Postgres AND short-circuits left→right at plan time for this
  shape; if the planner reorders, the regex still gates because both are in the
  same AND and the cast on a non-matching value is only reached for matching
  rows — verify in EXPLAIN that no cast error can occur on live data; all live
  draft_id values are uuids so this is belt-and-suspenders).
- Predicate semantics are byte-identical to the current `tk` and to
  task-repo.ts listPending EXCEPT cast form — RLS tenant joins
  (el.tenant_id = t.tenant_id, c.tenant_id = el.tenant_id) preserved verbatim.
- Keep `SET LOCAL jit = off` (line 107) as-is (harmless).
  </rewritten_subquery>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scope tk subquery + uuid-cast draft_id + budget_members(user_id) index</name>
  <files>packages/tenancy/src/adapters/persistence/workspace-repo.ts, packages/budgeting/src/adapters/persistence/task-repo.ts, drizzle/0034_budget_nav_perf_indexes.sql, drizzle/meta/_journal.json, apps/api/test/routes/budgets-active.test.ts</files>
  <behavior>
    Correctness (TDD — write/extend these in budgets-active.test.ts FIRST, RED before code):
    - Seed a multi-budget fixture for ONE user that includes:
      (a) a budget with N actionable PENDING tasks (RESERVE_TOPUP / CUSHION_BELOW_TARGET),
      (b) a CONFIRM_DRAFT with a LIVE draft (counts),
      (c) a CONFIRM_DRAFT whose draft has an ARCHIVED category (Maczfit shape — NOT counted),
      (d) an orphan CONFIRM_DRAFT with empty/missing draft_id (NOT counted).
      Reuse packages/budgeting/test/draft-task-fixtures.ts (seedDraftWithTask,
      seedReserveTopupTask) — already imported by the existing parity test.
    - Test A (identical rows/counts): listForUser returns the SAME set of budget
      ids and the SAME pendingTasksCount per budget as the pre-fix query for the
      same user. (The existing "identical rows" + "banner parity" tests already
      pin this — keep them GREEN; add the archived-orphan multi-budget case.)
    - Test B (no JIT / cost gate): run EXPLAIN (FORMAT JSON) of the rewritten
      query as app_role under withUserContext (real GUCs, NOT superuser). Assert
      the plan JSON contains NO "JIT" node with "Functions" > 0 / "Inlining":true,
      AND "Total Cost" (root plan node) < 100000. This is the by-construction
      proof — independent of the jit GUC.
    - Test C (parity stays green): the existing "excludes non-actionable
      CONFIRM_DRAFT" parity test must pass unchanged (the badge count == banner
      count after the cast change applies to BOTH listForUser tk and listPending).
  </behavior>
  <action>
    1. Rewrite the `tk` subquery in workspace-repo.ts listForUser (lines ~126-158)
       to the LATERAL scoped form in <rewritten_subquery> above: correlate
       `t.budget_id = w.id`, replace `el.id::text = t.payload_json->>'draft_id'`
       with the uuid-shape guard + `(t.payload_json->>'draft_id')::uuid = el.id`.
       Preserve EVERY other predicate verbatim (status, tenant joins, deleted/
       dismissed/confirmed NULL checks, archived-category NOT EXISTS). Keep the
       outer `WHERE m.user_id = ${userId} AND w.archived_at IS NULL`. Keep the
       `SET LOCAL jit = off` line (defense-in-depth; do not rely on it). Update
       the big comment block to describe the new scoping + cast and reference
       260613-hig.
    2. Apply the SAME cast fix to task-repo.ts listPending (lines ~150-168):
       replace `el.id::text = tasks.payload_json->>'draft_id'` with the uuid-shape
       guard + `(tasks.payload_json->>'draft_id')::uuid = el.id`. This keeps the
       two predicates byte-identical (banner parity). Update the in-code comment
       noting both copies are kept in sync (asserted by budgets-active.test.ts).
    3. Create drizzle/0034_budget_nav_perf_indexes.sql:
         CREATE INDEX IF NOT EXISTS budget_members_user_id_idx
           ON tenancy.budget_members (user_id);
       Header comment: why (WHERE m.user_id seq-scans 7679 rows; raises estimate),
       plain CREATE INDEX is correct (migrator runs in a tx; CONCURRENTLY can't);
       prod lock is sub-second on 7679 rows. Do NOT add tasks(status,budget_id)
       or categories/expense_ledger(tenant_id) blindly — only add them in THIS
       file if Test B's EXPLAIN (after the scoping rewrite) still shows a costly
       seq scan inside tk; decide from the plan, document the decision in the
       header either way.
    4. Append the journal entry for 0034 to drizzle/meta/_journal.json: a new
       entry `{ "idx": 34, "version": "7", "when": <epoch_ms>, "tag":
       "0034_budget_nav_perf_indexes", "breakpoints": true }` matching the
       existing entry shape (mirror entry idx 33 exactly except idx/when/tag).
       Drizzle journal-based migrate() applies by journal order — the entry is
       REQUIRED or the .sql is ignored.
    5. Run the migration locally against the dev DB (make restart-api brings the
       migrator up, or run apps/migrator directly via infisical) and confirm
       0034 applies cleanly + the index exists (\d tenancy.budget_members).
  </action>
  <verify>
    <automated>cd /home/claude/budget && make test 2>&1 | grep -iE "budgets-active|banner parity|JIT|FAIL|pass" | head -40</automated>
    <automated>cd /home/claude/budget && bun test apps/api/test/routes/budgets-active.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>
    - budgets-active.test.ts: Test A (identical rows/counts incl archived-orphan
      multi-budget case), Test B (no-JIT + cost<100k via EXPLAIN as app_role),
      Test C (banner parity) all GREEN.
    - tk subquery scoped to the user's budgets (correlated t.budget_id = w.id);
      no `::text` cast remains in either tk or listPending; uuid-shape guard
      present in both.
    - 0034_budget_nav_perf_indexes.sql exists, journal entry idx 34 added,
      migration applied cleanly, budget_members_user_id_idx exists in dev DB.
    - make test shows no NEW failures vs baseline (the ~292 pre-existing
      bun-sweep failures are unrelated — verify with the correct runner above).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add loading.tsx Suspense skeletons for home + BDP segments</name>
  <files>apps/web/src/app/[locale]/(app)/loading.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/loading.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/loading.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/loading.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/settings/loading.tsx</files>
  <action>
    Add Next.js App Router `loading.tsx` files so every navigation shows an
    instant skeleton instead of freezing the old page while server RSC data
    loads (~2s today, ~5ms after Task 1 but the skeleton still removes the
    blank-transition jank and helps perceived perf on slow networks).
    - (app)/loading.tsx — home grid skeleton: reuse the existing home-card
      skeleton primitive if HomeCardsGrid exposes one (grep components/budgeting
      for a Skeleton / card-skeleton); otherwise a simple set of pulsing card
      placeholders matching the home grid layout. Match DESIGN.md (Binance dark
      canvas, var(--canvas-dark), single yellow accent — NO new colors).
    - budgets/[id]/loading.tsx — BDP shell skeleton: sticky pill-tabs row
      placeholder + a content block placeholder under it (mirror layout.tsx
      structure: top-0 z-40 band, then content). Covers all tab segments unless
      a more specific one exists.
    - spendings/wallets/reserves/settings loading.tsx — per-tab skeletons sized
      to each tab's dominant content (spendings grid rows, wallet rows, reserve
      rows, settings form rows). Keep them lightweight client-free server
      components (no hooks). Reuse any existing skeleton component primitives;
      do not invent new design tokens.
    Run an impeccable sweep: skeletons must use existing primitives + tokens,
    no layout shift vs the loaded page, no new colors/fonts.
  </action>
  <verify>
    <automated>cd /home/claude/budget && ls apps/web/src/app/[locale]/(app)/loading.tsx apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/loading.tsx apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/loading.tsx apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/loading.tsx apps/web/src/app/[locale]/(app)/budgets/[id]/settings/loading.tsx</automated>
    <automated>cd /home/claude/budget/apps/web && bun run build 2>&1 | grep -iE "loading|error|Compiled|Failed" | head -20</automated>
  </verify>
  <done>
    All six loading.tsx files exist, build compiles them, skeletons use existing
    primitives/tokens (DESIGN.md compliant), no layout shift vs loaded page.
  </done>
</task>

<task type="auto">
  <name>Task 3: Enable Better Auth session.cookieCache (short TTL)</name>
  <files>packages/identity/src/adapters/persistence/better-auth.ts, apps/api/test/ (new or existing identity/session test)</files>
  <action>
    Add a `session` config block to betterAuth() in better-auth.ts with a short
    signed cookieCache so auth.api.getSession reads the session from a signed
    cookie instead of hitting identity.sessions on EVERY API request (a single
    spendings nav fires ~8 api fetches = 8 session DB lookups today).
      session: {
        cookieCache: { enabled: true, maxAge: 60 }, // 60s — short TTL so
        // logout/revocation takes effect within one minute; the cache is a
        // signed snapshot, not a bypass of session expiry.
      }
    Keep the TTL short (30-60s) so session revocation (logout / expiry) still
    takes effect promptly. Verify Better Auth v1.4 cookieCache option shape
    against the installed version before finalizing (Context7: better-auth
    "session cookieCache"); adjust the key path if the API differs.
  </action>
  <verify>
    <automated>cd /home/claude/budget && bun test 2>&1 | grep -iE "session|cookieCache|revoke|logout|FAIL|pass" | head -30</automated>
  </verify>
  <done>
    - session.cookieCache enabled with a 30-60s TTL in better-auth.ts.
    - A test proves: a valid session still authenticates (getSession returns the
      user) AND after sign-out the session no longer validates (revocation works
      within TTL). No existing identity/auth test regresses.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Scoped+uuid-cast pending-tasks query (Task 1), route skeletons (Task 2),
    session cookieCache (Task 3). Backend rebuilt + migrated; web rebuilt.
  </what-built>
  <how-to-verify>
    Claude does the deploy + measurement FIRST, then hands you the numbers:

    Deploy (Claude runs):
    1. Rebuild + migrate backend: `docker compose build api worker && make restart-api && make restart-worker`
       (worker shares the budgeting/tenancy packages; migrator runs on api up
       and applies 0034). Confirm migrator log shows "[migrator] complete" and
       0034 applied; confirm `docker compose ps` shows api/worker recently
       restarted + healthy.
    2. Rebuild web (loading.tsx + cookieCache touch nothing client-bundled for
       web, but skeletons ARE bundled): `docker compose build web && make restart-web`.
       Verify served bundle is fresh (image id / .next) per project memory
       (Docker build cache can ship STALE images — use --no-cache if a change
       won't appear).

    Live before/after measurement (Claude runs against https://budget-dev.madonzy.com,
    user uat-probe-1 / TestPass123!):
    3. Time GET /budgets/active 5× — assert median drops from ~1900ms to <~50ms.
    4. Capture EXPLAIN (as app_role) on the live DB proving no JIT block + cost
       < 100k (use the diagnosis harness from the dn1 investigation).
    5. Playwright/manual: log in as uat-probe-1, navigate home -> a budget (BDP)
       -> spendings -> wallets. Confirm a skeleton flashes instantly on each nav
       (no ~2s frozen old page).

    Then YOU confirm:
    - Home and BDP nav FEEL instant (skeleton appears immediately).
    - Badges on home cards still match the per-pill task counts inside the budget.
    - Login/logout still works (cookieCache didn't break auth).

  </how-to-verify>
  <resume-signal>Type "approved" or describe what's still slow / wrong.</resume-signal>
</task>

</tasks>

<verification>
- make test: budgets-active.test.ts (Test A identical rows, Test B no-JIT+cost
  gate, Test C banner parity) GREEN; no NEW failures vs baseline.
- Migration 0034 applies cleanly; budget_members_user_id_idx exists.
- EXPLAIN (app_role, real GUCs) of listForUser: no JIT block, total cost < 100k.
- Live: GET /budgets/active median <~50ms (was ~1900ms); home->BDP nav shows
  instant skeleton; badges match banner; login/logout intact.
- make ci-gate (tenant-leak) stays GREEN — the scoping change preserves RLS
  tenant joins; run it since the query touches cross-tenant-sensitive paths.
</verification>

<success_criteria>
GET /budgets/active drops from ~1900ms to <~50ms by CONSTRUCTION (scoped tk +
uuid PK index usable + member index), proven by an app_role EXPLAIN with no JIT
and cost < 100k — NOT dependent on the jit GUC. Pending-task counts remain
byte-identical and banner parity holds. Navigation feels instant via loading.tsx
skeletons. Per-fetch session DB lookups removed via short-TTL cookieCache
without breaking revocation. Each fix is independently revertible; correctness
gates on Task 1's identical-rows + parity tests.
</success_criteria>

<deferred>
- spendings/wallets re-fetch /budgets/{id} that the BDP layout already fetched
  (spendings/page.tsx:58, wallets/page.tsx:27, layout.tsx:57) — dedupe by
  passing budget meta down or a request-scoped cache() wrapper. LOW priority
  once Task 1 makes the upstream call ~5ms; noted for a follow-up quick.
- "Why SET LOCAL jit=off at workspace-repo.ts:107 does NOT take effect in the
  live extended-protocol path" — unsolved. Left as harmless defense-in-depth;
  the by-construction fix makes it moot. Deferred investigation.
- reserves replay-on-read (sub-ms at current volume) and FX (cache-first, no
  hot-path network) — investigated, NOT touched.
</deferred>

<output>
After completion, create
`.planning/quick/260613-hig-budget-nav-perf-scope-pending-tasks-subq/260613-hig-SUMMARY.md`
with: before/after /budgets/active timings, the EXPLAIN no-JIT proof, the final
index decision (whether any extra index beyond budget_members(user_id) was
added and why), and confirmation of banner parity + auth revocation.
</output>
