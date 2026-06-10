---
phase: 3
slug: navigation-home-bdp-frame
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 03-RESEARCH.md `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (component)** | Vitest 4 + RTL + happy-dom (`apps/web/test/`) |
| **Framework (API)** | bun:test (`apps/api/test/`) |
| **Framework (E2E)** | playwright-bdd (Gherkin `.feature` + Page Objects) — see Wave 0 if not installed |
| **Config file (web)** | `apps/web/vitest.config.ts` |
| **Config file (api)** | `bunfig.toml` |
| **Quick run command** | `cd apps/web && bun run test --run -- nav home bdp` |
| **Full suite command** | `make test && make test-e2e` |
| **Estimated runtime** | ~90 seconds quick / ~6 minutes full |

---

## Sampling Rate

- **After every task commit:** Run quick command scoped to changed files
- **After every plan wave:** Run `make test` (Vitest + bun:test)
- **Before `/gsd-verify-work`:** Full suite (`make test && make test-e2e`) must be green
- **Max feedback latency:** 30 seconds for component tests; 90 seconds for API integration

---

## Per-Requirement Verification Map

| Req ID | Surface | Test Type | Automated Command | Test File (target) |
|--------|---------|-----------|-------------------|--------------------|
| NAV-01 | Top-nav button (budget name + icon + chevron) | component | `cd apps/web && bun run test budget-switcher` | `apps/web/test/components/nav/budget-switcher.test.tsx` |
| NAV-02 | Personal/Shared grouped dropdown | component + E2E | same + `make test-e2e -- nav-switcher` | `apps/web/test/components/nav/budget-switcher.test.tsx` + `tests/e2e/features/nav-switcher.feature` |
| NAV-03 | Aside `+` button → `/budgets/new` | component | `cd apps/web && bun run test budget-switcher` | same |
| NAV-04 | Click budget → `/budgets/[id]/spendings` | E2E | `make test-e2e -- nav-switcher` | `tests/e2e/features/nav-switcher.feature` |
| NAV-05 | `/workspaces` route deleted | unit (file absence) | `! test -e apps/web/src/app/workspaces/page.tsx` | inline assertion |
| HOME-01 | One card per accessible budget | component + E2E | `cd apps/web && bun run test home-page && make test-e2e -- home` | `apps/web/test/app/page.test.tsx` + `tests/e2e/features/home.feature` |
| HOME-02 | Card shows name + type + spent + wallets value (in display_currency) + overspent cats | component (mock RSC) + API integration | `cd apps/web && bun run test home-card && bun test apps/api/test/routes/budgets-home-summary.test.ts` | `apps/web/test/components/home/budget-card.test.tsx` + `apps/api/test/routes/budgets-home-summary.test.ts` |
| HOME-03 | Card click → `/budgets/[id]/spendings` | E2E | `make test-e2e -- home` | `tests/e2e/features/home.feature` |
| HOME-04 | Placeholder chart renders below cards | component | `cd apps/web && bun run test placeholder-chart` | `apps/web/test/components/home/placeholder-chart.test.tsx` |
| BDP-01 | Sticky pill tabs on `/budgets/[id]` | component + E2E (scroll position) | `cd apps/web && bun run test bdp-tabs && make test-e2e -- bdp-tabs` | `apps/web/test/components/bdp/tabs.test.tsx` + `tests/e2e/features/bdp-tabs.feature` |
| BDP-02 | Tab order Spendings/Reserves/Wallets/Settings + default Spendings | component | `cd apps/web && bun run test bdp-tabs` | same |
| BDP-03 | Task banner above tabs (count chip + expand) | component + API integration | `cd apps/web && bun run test task-banner && bun test apps/api/test/routes/tasks-pending.test.ts` | `apps/web/test/components/bdp/task-banner.test.tsx` + `apps/api/test/routes/tasks-pending.test.ts` |
| BDP-04 | Active pill yellow accent (DESIGN.md token) | component | `cd apps/web && bun run test bdp-tabs` | same as BDP-01 |
| BDP-05 | Browser back/forward respects tab routes | E2E | `make test-e2e -- bdp-tabs` | `tests/e2e/features/bdp-tabs.feature` |

*Status column omitted at draft — populated during execution.*

---

## Wave 0 Requirements

- [ ] Install `@tanstack/react-query` + `@tanstack/react-query-devtools` in `apps/web` (D-PH3-13 mandates 60s polling for task banner)
- [ ] Install `playwright-bdd` if not present (CLAUDE.md mandates Gherkin) OR document Path B fallback
- [ ] Spike: verify `users.display_currency` column exists (researcher open question #3) — migrate if missing
- [ ] Spike: confirm FX 409 stale behavior on display-only surfaces (researcher open question #2)
- [ ] Verify Phase 2 endpoint `/budgets/active` payload (researcher open question #1) — rename key or keep
- [ ] Test stubs created for each REQ row above (red baseline)
- [ ] `apps/web/test/setup/query-client.tsx` — shared QueryClient wrapper for Vitest

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Yellow accent hex matches DESIGN.md token | BDP-04 | Visual fidelity; component test asserts class, not rendered color | Open `/budgets/[id]` in Chrome DevTools; inspect active pill; confirm computed color = DESIGN.md `--color-accent-yellow` |
| Sticky tab shadow appears on scroll | BDP-01 | CSS-only; Playwright can assert sticky position but shadow is decorative | Scroll BDP page in browser; confirm shadow appears per DESIGN.md `--shadow-sticky` |
| Personal/Shared icon visual distinction | NAV-01 | Icon glyph correctness (lock vs people) | Open switcher; confirm Personal budgets show lock glyph, Shared show people glyph |

---

## Validation Sign-Off

- [ ] All requirement rows have automated verify command OR Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive requirements without automated verify
- [ ] Wave 0 covers all MISSING references (React Query, playwright-bdd, display_currency)
- [ ] No watch-mode flags in commands
- [ ] Feedback latency < 90s for full suite
- [ ] `nyquist_compliant: true` set in frontmatter after sign-off

**Approval:** pending
