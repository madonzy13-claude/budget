---
quick_id: 260613-pdb
type: execute
mode: quick
autonomous: false
files_modified:
  - apps/web/messages/en.json
  - apps/web/messages/pl.json
  - apps/web/messages/uk.json
  - apps/web/src/components/settings/cushion-section.tsx
  - apps/web/test/components/cushion-section.test.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx
must_haves:
  truths:
    - "Reserves INCLUDED empty slot shows the noCategories copy on ONE row at text-caption on a ~360px column in EN/PL/UK"
    - "Cushion preview renders NOTHING when no cushion requirement is configured (required_cents === 0), instead of 'Have €0 of €0 — target met'"
    - "Cushion preview still shows the met message when fully funded with a real requirement (required>0, shortfall<=0)"
    - "Cushion preview still shows the shortfall message when shortfall>0"
    - "Home→tab navigation into the BDP shows ONLY the tab-specific skeleton (one skeleton, not two)"
    - "Non-member loading another tenant's budget is still redirected to /{locale} (membership gate intact)"
    - "reservesEnabled cascading-hide still reaches BdpTabs; tasks banner, deep-link, tab order all unchanged"
  artifacts:
    - path: "apps/web/messages/en.json"
      provides: "shortened reserves.section.noCategories (EN)"
      contains: "noCategories"
    - path: "apps/web/messages/pl.json"
      provides: "shortened reserves.section.noCategories (PL)"
      contains: "noCategories"
    - path: "apps/web/messages/uk.json"
      provides: "shortened reserves.section.noCategories (UK)"
      contains: "noCategories"
    - path: "apps/web/src/components/settings/cushion-section.tsx"
      provides: "required_cents===0 → null preview guard"
      contains: "required_cents"
    - path: "apps/web/test/components/cushion-section.test.tsx"
      provides: "preview guard component tests (3 cases)"
    - path: "apps/web/src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx"
      provides: "Suspense-wrapped server child: membership gate + reservesEnabled + initial tasks"
      contains: "redirect"
    - path: "apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx"
      provides: "non-suspending layout chrome + Suspense(fallback=null) around data child"
      contains: "Suspense"
  key_links:
    - from: "layout.tsx"
      to: "budget-shell-data.tsx"
      via: "Suspense fallback={null}"
      pattern: "Suspense fallback=\\{null\\}"
    - from: "budget-shell-data.tsx"
      to: "redirect(`/${locale}`)"
      via: "membership miss on /budgets/active"
      pattern: "redirect\\("
    - from: "budget-shell-data.tsx"
      to: "BdpTabs reservesEnabled"
      via: "prop passthrough"
      pattern: "reservesEnabled"
---

<objective>
Three BDP/UI fixes, verified against current code (file:line confirmed):

1. **Reserves "No categories" wraps to 2 rows** → shorten the `reserves.section.noCategories` copy in all 3 locales so it fits one row at `text-caption` on a ~360px column, keeping the "add a category" intent.
2. **Cushion preview shows "Have €0 of €0 — target met" when nothing is configured** → when `required_cents === 0` (no cushion requirement) render NOTHING for the preview line. Keep shortfall (>0) and met (required>0 AND shortfall<=0) cases.
3. **BDP shows TWO loading skeletons (generic chrome THEN tab-specific)** → make the layout non-suspending: render static chrome synchronously, move the awaited data (membership gate + reservesEnabled + initial tasks) into a `Suspense fallback={null}` server child. DELETE `budgets/[id]/loading.tsx`. Only the child tab's `loading.tsx` shows. Membership gate, cascading-hide, tasks banner, deep-link all preserved.

Purpose: kill three visible papercuts (text wrap, meaningless preview, double skeleton flash).
Output: shortened i18n strings (3 locales), cushion null-guard + tests, non-suspending BDP layout + extracted data child, removed generic loading.tsx, regression-clean e2e.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<verified_facts>
ISSUE 1 — reserves noCategories (CONFIRMED current strings):

- Key path: `bdp.tab.reserves.section.noCategories` — en.json:821, pl.json:844, uk.json:844.
  Sibling `includedEmpty` is the OTHER empty state (excludedRows>0). Do NOT touch includedEmpty/excludedEmpty.
- Current EN: "No categories yet — add a category in the Spendings tab first"
- Current PL: "Brak kategorii — najpierw dodaj kategorię na karcie Wydatki"
- Current UK: "Ще немає категорій — спершу додайте категорію на вкладці Витрати"
- Render: reserves-table-client.tsx:349-355 — `<div className="px-3 py-2 text-caption text-[var(--muted-foreground)]">{excludedRows.length===0 ? t("section.noCategories") : t("section.includedEmpty")}</div>`.
  The wrapper has NO nowrap/truncate — it wraps naturally. Goal = single line at normal widths via SHORTER copy (do not add truncate; truncation would hide meaning).

ISSUE 2 — cushion preview guard (CONFIRMED):

- cushion-section.tsx:203-258 `renderPreview()`. Order today:
  previewLoading → previewError → `if (!cushionSummary) return null;` →
  shortfall = BigInt(shortfall_cents); positive = shortfall>0n →
  positive ? t("cushion.preview",{...}) : t("cushion.previewMet",{...}).
- Keys: en.json:163 preview, 164 previewMet, 165 previewError (+ pl/uk same lines). NO i18n change for issue 2.
- "nothing configured" signal is required_cents===0 (CONFIRMED via packages/budgeting/src/application/get-cushion-summary.ts):
  - line 107-114: cushion_enabled=false → all-zero DTO, required_cents="0".
  - line 140-141: requiredCents = totalCushion × targetMonths → "0" when no cushion category limits.
    So `BigInt(cushionSummary.required_cents) === 0n` covers BOTH "feature off" and "on but no cushion categories" → both are "nothing to preview".
- Fix: add guard AFTER `if (!cushionSummary) return null;` and BEFORE computing shortfall:
  `if (BigInt(cushionSummary.required_cents) === 0n) return null;`
  This leaves met (required>0, shortfall<=0) and shortfall (>0) branches untouched.

ISSUE 3 — BDP double skeleton (CONFIRMED root cause):

- layout.tsx:49-108 `BdpLayout` is `async` and `await`s `Promise.all([serverApiFetch(null,"/budgets/active") [gate], serverApiFetch(id,`/budgets/${id}`) [reservesEnabled], fetchInitialTasks(id)])` at the TOP (line 55-59) BEFORE returning the chrome → the whole layout SUSPENDS → `budgets/[id]/loading.tsx` fires (generic pills + 4 content blocks). THEN the page (e.g. wallets) suspends → `wallets/loading.tsx` fires = TWO skeletons.
- `budgets/[id]/loading.tsx` was added TODAY (260613-hig) as a stopgap; it renders sticky-pills skeleton + content blocks (the unwanted first skeleton).
- Gate: layout.tsx:61-68 — if `/budgets/active` ok and `id` NOT in list → `redirect(`/${locale}`)`. SECURITY-CRITICAL.
- reservesEnabled: layout.tsx:70-74 → passed to BdpTabs (line 86). Cascading-hide surface 1 (D-PH5-R11).
- initialTasks: passed to BdpTabs (badges, line 87) AND ActivePillTaskSlider (line 101).
- ActivePillTaskSlider already in its own `<Suspense fallback={null}>` (line 97-103) for the deep-link `?task=` useSearchParams bailout.
- Tab loadings exist: wallets/reserves/settings/spendings/loading.tsx (260613-hig). These are the GOOD single skeletons we want to keep as the only fallback.
- Home loading: (app)/loading.tsx renders the home `<main>` grid skeleton. It is the PARENT segment's fallback. CONFIRMED: with the layout rendering chrome synchronously (no top-level await), navigating home→/budgets/[id] suspends only the PAGE slot (and the inner data child), NOT the layout, so the nearest fallback for the page slot is the tab's own loading.tsx — (app)/loading.tsx does NOT fire for a child segment whose own layout has already committed.

E2E (CONFIRMED): apps/web/e2e/features/bdp-tab-frame.feature — scenarios @tasks-geometry + untagged (redirect-to-wallets, pill nav, back/forward, deep-link, mobile collapse, overscroll). Steps in e2e/steps/common-steps.ts ("I open the BDP for {string}" → goto /en/budgets/{freshUser.budgetId}; "the URL ends with {string}" assertion line 238). These MUST stay green.
MEMBERSHIP GATE: NO dedicated non-member e2e exists. fresh-user-per-scenario.ts has no second-user / addMember helper — a real non-member browser e2e needs new two-user fixture machinery (out of scope for a 3-task quick). Membership gate is guarded structurally instead (see T2 verify): assert the gate code path (redirect on /budgets/active miss) lives in the data child and still runs before BdpTabs renders.
</verified_facts>

<interfaces>
From cushion-section.tsx (CushionSummaryPayload, line 53+):
```typescript
interface CushionSummaryPayload {
  required_cents: string;
  actual_cents: string;
  shortfall_cents: string;
  currency: string;
  enabled: boolean;
  target_months: number;
}
```
From layout.tsx (props + helpers to relocate):
```typescript
interface BdpLayoutProps { children: React.ReactNode; params: Promise<{ locale: string; id: string }>; }
async function fetchInitialTasks(budgetId: string): Promise<TaskSummary[]> // -> move into budget-shell-data.tsx
// serverApiFetch(budgetIdOrNull, path) sets X-Budget-ID when first arg non-null (Pitfall 4 guard)
// redirect from next/navigation; BdpTabs + ActivePillTaskSlider consume {locale,budgetId,reservesEnabled,initialTasks}
```
i18n check (no npm alias): `cd apps/web && bun run scripts/check-i18n-completeness.ts`
Component tests: `cd apps/web && bun run test` (Vitest + happy-dom). Existing cushion tests live under apps/web/test/ (see MEMORY: cushion-section onBlur Vitest tests).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Issue 1 (shorten noCategories, 3 locales) + Issue 2 (cushion required===0 null-guard + tests)</name>
  <files>apps/web/messages/en.json, apps/web/messages/pl.json, apps/web/messages/uk.json, apps/web/src/components/settings/cushion-section.tsx, apps/web/test/components/cushion-section.test.tsx</files>
  <behavior>
    Cushion preview guard (write/extend Vitest first, RED):
    - required_cents="0", actual="0", shortfall="0" → renderPreview produces NO preview text (no "target met", no "short by"). Assert the previewMet/preview copy is absent.
    - required_cents>0, shortfall_cents<=0 (e.g. required="50000", actual="50000", shortfall="0") → shows cushion.previewMet ("…target met").
    - shortfall_cents>0 (e.g. required="50000", actual="10000", shortfall="40000") → shows cushion.preview ("…short by…").
    - previewError state still shows previewError; previewLoading still shows the pulse skeleton (don't regress).
  </behavior>
  <action>
    ISSUE 1 — shorten `reserves.section.noCategories` in ALL 3 locales (keep "add a category" intent; the "in the Spendings tab" locator may be trimmed; must fit one line at text-caption on ~360px). Use these final strings (planner picks; each short + meaningful per locale):
      - en.json:821  "noCategories": "No categories yet — add one in Spendings"
      - pl.json:844  "noCategories": "Brak kategorii — dodaj w Wydatkach"
      - uk.json:844  "noCategories": "Немає категорій — додайте у Витратах"
    Edit ONLY the noCategories value; leave includedEmpty/excludedEmpty/excluded/active/included untouched. Keep JSON well-formed (trailing comma matches sibling lines).

    ISSUE 2 — in cushion-section.tsx renderPreview() (line ~216), add the guard immediately after `if (!cushionSummary) return null;`:
      `if (BigInt(cushionSummary.required_cents) === 0n) return null;`
    Do NOT alter the shortfall/met branches below it. Rationale comment: "required_cents===0 means no cushion requirement configured (feature off OR no cushion category limits) — nothing to preview; avoids the meaningless 'Have 0 of 0 — target met'. Verified via get-cushion-summary.ts (zero DTO when disabled; Σ limits × months = 0 when no cushion categories)."

    TESTS — add/extend apps/web/test/components/cushion-section.test.tsx with the three <behavior> cases. Mock the cushion-summary fetch/query so cushionSummary resolves to each payload; render CushionSection (or the preview unit if it's exported) and assert presence/absence of the translated preview strings. Reuse the existing test's render harness + next-intl test provider pattern (check the existing cushion test file first for the established mocking approach — do not invent a new one).

  </action>
  <verify>
    <automated>cd apps/web && bun run scripts/check-i18n-completeness.ts && bun run test -- cushion-section</automated>
  </verify>
  <done>i18n completeness passes (3 locales in sync, no missing/extra keys); cushion-section tests pass with all 3 preview cases green (required=0 → no preview line; required>0 met → met; shortfall>0 → shortfall); noCategories strings shortened in en/pl/uk only.</done>
</task>

<task type="auto">
  <name>Task 2: Issue 3 — BDP single skeleton via non-suspending layout + extracted Suspense data child; delete generic loading.tsx (Option A)</name>
  <files>apps/web/src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx, apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx</files>
  <action>
    CHOSEN: Option A (preferred). Make the layout NOT suspend; move ALL awaited data into a Suspense-wrapped server child so only the child tab page's loading.tsx shows.

    1. CREATE budget-shell-data.tsx — an `async` server component (no "use client"). Move into it, verbatim, the data work currently at layout.tsx:39-103:
       - `fetchInitialTasks(budgetId)` helper.
       - `await Promise.all([serverApiFetch(null,"/budgets/active"), serverApiFetch(id,`/budgets/${id}`), fetchInitialTasks(id)])`.
       - The membership gate: if `/budgets/active` ok and `id` NOT in list → `redirect(`/${locale}`)` (KEEP EXACTLY — security-critical; redirect() from a Suspense child works in App Router server components).
       - reservesEnabled read (default true).
       - Render the sticky band wrapper `<div className="sticky top-0 z-40 border-b … bg-[var(--canvas-dark)]" data-testid="bdp-sticky-wrapper" data-bdp-tabs>` containing `<BdpTabs locale budgetId reservesEnabled initialTasks />`, AND the `<Suspense fallback={null}><ActivePillTaskSlider …/></Suspense>` strip.
       Props: `{ locale: string; id: string }`.
       IMPORTANT ordering: the membership redirect MUST execute before any budget-scoped UI commits — it does, because redirect() throws before the return. The chrome rendered here is generic (pills + slider), and the page itself is RLS-protected via X-Budget-ID, so no other-tenant data leaks even though the band renders.

    2. REWRITE layout.tsx to NOT await at top level. The layout returns synchronously:
       ```tsx
       export default async function BdpLayout({ children, params }: BdpLayoutProps) {
         const { locale, id } = await params; // params await is fine — it does not gate on network
         return (
           <>
             <Suspense fallback={null}>
               <BudgetShellData locale={locale} id={id} />
             </Suspense>
             <div className="pb-shell-safe">{children}</div>
           </>
         );
       }
       ```
       Notes: keep `await params` (cheap, not a network suspend). The band + slider move INTO BudgetShellData (so they appear once data resolves; fallback={null} means no band flicker — acceptable, the band is lightweight and the tab skeleton carries the perceived-load). The `pb-shell-safe` content wrapper for `{children}` stays in the layout so the page slot's own loading.tsx renders inside the correct bottom-clearance wrapper.
       Keep the existing file header doc comment; add a line noting the non-suspending refactor (quick-260613-pdb) and WHY (kill the double skeleton; chrome no longer top-level-awaits).

    3. DELETE apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx — with the layout no longer suspending, the generic skeleton is dead. Removing it does NOT fall back to (app)/loading.tsx for the page slot: the BDP layout commits synchronously, so the page slot's nearest fallback is the tab's own loading.tsx (wallets/reserves/spendings/settings). (app)/loading.tsx only covers the home segment, which is not re-entered on home→tab nav once /budgets/[id] layout has committed.

    DO NOT change: BdpTabs, ActivePillTaskSlider, tab loading.tsx files, the z-stack classes, data-testid="bdp-sticky-wrapper", data-bdp-tabs, pb-shell-safe.

  </action>
  <verify>
    <automated>cd apps/web && rm -f "src/app/[locale]/(app)/budgets/[id]/loading.tsx"; test ! -f "src/app/[locale]/(app)/budgets/[id]/loading.tsx" && grep -q "Suspense fallback={null}" "src/app/[locale]/(app)/budgets/[id]/layout.tsx" && grep -v '^[[:space:]]*[/*]' "src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx" | grep -q "redirect(" && grep -v '^[[:space:]]*[/*]' "src/app/[locale]/(app)/budgets/[id]/layout.tsx" | grep -cq "await serverApiFetch" && echo "FAIL: layout still awaits fetch at top level" || (bun run typecheck && echo STRUCT_OK)</automated>
  </verify>
  <done>budget-shell-data.tsx exists with the membership gate (redirect on /budgets/active miss), reservesEnabled, initialTasks, band + slider; layout.tsx no longer awaits serverApiFetch at top level and wraps BudgetShellData in Suspense fallback={null}; budgets/[id]/loading.tsx deleted; typecheck passes. Structural guard: layout has no top-level serverApiFetch await; gate's redirect lives in the data child.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Rebuild web, regression e2e, and on-device verify all 3 fixes</name>
  <what-built>
    (1) Shortened reserves noCategories copy (EN/PL/UK) so the INCLUDED empty slot fits one row.
    (2) Cushion preview returns null when required_cents===0 (no more "Have €0 of €0 — target met").
    (3) BDP layout no longer suspends; generic budgets/[id]/loading.tsx removed → only the tab-specific skeleton shows on home→tab nav. Membership gate / reservesEnabled / tasks banner / deep-link preserved.
    Messages are bundled at build → web MUST be rebuilt (MEMORY: always rebuild web after frontend edits + verify served bundle).
  </what-built>
  <how-to-verify>
    AUTOMATED FIRST (Claude runs before asking):
    1. Rebuild + restart web: `docker compose build web && make restart-web` then confirm `docker compose ps` shows web recently restarted + healthy. If a change won't appear, --no-cache rebuild (MEMORY: build cache ships stale images) and verify the SERVED bundle.
    2. Regression e2e (must stay green): `cd apps/web && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bun run e2e -- --grep "@tasks-geometry|BDP tab frame"` (or run the full bdp-tab-frame feature). The redirect-to-wallets, pill nav, back/forward, deep-link, mobile-collapse, overscroll, and geometry scenarios MUST pass — this proves the non-suspending layout did not regress tab framing, the band, or deep-link.
    3. Cushion unit cases already green from T1 (bun run test -- cushion-section).

    MANUAL (on device, https://budget-dev.madonzy.com — HTTPS needed for SW/PWA):
    A. Reserves tab on a fresh budget with NO categories → the INCLUDED empty slot reads the shortened copy on ONE row (no wrap) at phone width (~360px). Switch locale to PL and UK → still one row, still meaningful.
    B. Settings → Cushion, with cushion OFF or no cushion categories → the preview line shows NOTHING (no "Have €0 of €0 — target met"). Then configure a cushion requirement → preview reappears (met or short-by as appropriate).
    C. From Home, tap into a budget → observe ONLY ONE skeleton (the tab's), no generic chrome-then-tab double flash. Try a couple tabs (wallets, reserves).
    D. Membership gate sanity: deep-link to a budget id you are NOT a member of (or another tenant's id) → you are redirected to home, NOT shown the band/another tenant's data.

  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (e.g. "PL still wraps", "double skeleton still on reserves", "non-member saw the band").</resume-signal>
</task>

</tasks>

<verification>
- i18n completeness green; noCategories shortened in 3 locales only.
- cushion-section tests: required=0 → no preview line; required>0 met → met; shortfall>0 → shortfall.
- typecheck green; budgets/[id]/loading.tsx deleted; layout non-suspending (no top-level serverApiFetch await); redirect gate present in budget-shell-data.tsx.
- bdp-tab-frame + @tasks-geometry e2e green against budget-dev.madonzy.com.
- On-device: one-row copy (3 locales), suppressed empty cushion preview, single tab skeleton, membership redirect intact.
</verification>

<success_criteria>

- Reserves INCLUDED empty slot: one row, EN/PL/UK, ~360px, meaningful.
- No "Have €0 of €0 — target met" when nothing configured; real met/shortfall cases unchanged.
- Single (tab-specific) skeleton on home→tab nav; membership gate, reservesEnabled cascading-hide, tasks banner, deep-link all unregressed.
- All existing suites + new cushion tests pass; web rebuilt and served bundle verified.
  </success_criteria>

<output>
After completion, create `.planning/quick/260613-pdb-reserves-nocategories-one-row-text-hide-/260613-pdb-SUMMARY.md`
</output>
