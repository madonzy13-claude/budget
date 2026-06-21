---
phase: 9
slug: investments-wallet
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed dimensions live in `09-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property               | Value                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Framework**          | bun:test (domain + API/DB integration) · Vitest 4 + happy-dom (web components) · Playwright (playwright-bdd) (E2E) |
| **Config file**        | `bunfig.toml` (80% domain threshold) · `apps/web/playwright.config.ts` (E2E source of truth)                       |
| **Quick run command**  | `make test`                                                                                                        |
| **Full suite command** | `make test && make ci-gate && (cd apps/web && bun run test) && make test-e2e`                                      |
| **Estimated runtime**  | ~120–240 seconds (excludes Docker spin-up + E2E)                                                                   |

---

## Sampling Rate

- **After every task commit:** Run `make test` (backend unit + integration for touched contexts)
- **After every plan wave:** Run full suite (`make test` + `make ci-gate` + web Vitest)
- **Before `/gsd-verify-work`:** Full suite + `make test-e2e` must be green against the running stack
- **Max feedback latency:** ~240 seconds

---

## Per-Task Verification Map

> Filled during Wave 0 / execution. One row per task; every INV-01..INV-16 requirement
> must map to at least one automated verification before sign-off.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior                    | Test Type   | Automated Command | File Exists | Status     |
| ------- | ---- | ---- | ----------- | ---------- | ---------------------------------- | ----------- | ----------------- | ----------- | ---------- |
| 9-01-01 | 01   | 1    | INV-XX      | T-9-01 / — | tenant isolation on holdings (RLS) | integration | `make test`       | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `packages/investments/test/` — domain unit stubs (holding value / profit-loss / weight / FX conversion)
- [ ] `apps/api/test/routes/` — investments route + RLS integration stubs (real Postgres, no mocks)
- [ ] price-provider adapter contract stubs (mocked HTTP for Twelve Data / CoinGecko / metals.dev)
- [ ] pg-boss snapshot job test stubs (price + FX daily snapshot)
- [ ] `apps/web/e2e/` — investments wallet `.feature` (playwright-bdd, fresh-user fixture)

_Existing infrastructure (bun:test, Vitest, Playwright) covers all phase frameworks — Wave 0 adds stubs only._

---

## Manual-Only Verifications

| Behavior                                     | Requirement       | Why Manual                                                                                         | Test Instructions                                                                                   |
| -------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Live price-provider free-tier quota behavior | INV (price fetch) | Free-tier throttle headers not safely live-testable in CI (would burn metals.dev 100 req/mo quota) | Stage once against real APIs in a throwaway run; assert no 429s; confirm metals fetch is daily-only |

_All other phase behaviors have automated verification._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 240s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
