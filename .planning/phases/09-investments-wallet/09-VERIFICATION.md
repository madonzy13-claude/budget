---
status: human_needed
phase: 09-investments-wallet
verified: 2026-06-21
plans: 7/7
requirements:
  [
    INV-01,
    INV-02,
    INV-03,
    INV-04,
    INV-05,
    INV-06,
    INV-07,
    INV-08,
    INV-09,
    INV-10,
    INV-11,
    INV-12,
    INV-13,
    INV-14,
    INV-15,
    INV-16,
  ]
---

# Phase 09 — Investments Wallet: Verification

## Goal

Feature-flagged investments holdings tracker: a flag-gated Investments section on
the Wallets tab with grouped holdings, value / P-L% / weight%, sheet-only editing,
instrument search, DnD reorder + group reassignment, and optimistic mutations —
backed by domain model, RLS-scoped persistence, price adapters, worker jobs, and
a budget-scoped API.

## Automated checks — PASS

- Backend domain + adapters (waves 1-3): bun:test green; migration 0038 applied;
  ci-gate tenant-leak 54/54 (09-05).
- Web: vitest investments 11/11; typecheck 0; eslint --max-warnings=0 clean;
  check:i18n PASS (EN/PL/UK).
- E2E `@investments-wallet`: 6 passed (chromium + mobile), incl. a reload-persistence
  guard added after UAT exposed a path 404 the optimistic insert had masked.

## Live verification (Playwright MCP, budget-dev.madonzy.com)

- Flag toggle reactivity both directions (Settings → Wallets, NO reload).
- Instrument search "BTC" → "Bitcoin (BTC)".
- Custom holding → Type dropdown selectable (no search-overlay intercept).
- Group combobox free-type → `Create "Test"`.
- Optimistic create PERSISTS after reload (BTC · USD · 120 · +20.0% · grouped
  "Test · 100% of portfolio").
- Onboarding Investments feature toggle → budget created with the flag on.

## must_haves

| Requirement                                              | Status                             |
| -------------------------------------------------------- | ---------------------------------- |
| INV-01/02 flag gates section, renders last               | ✓ verified live                    |
| INV-05 group autocomplete (existing + free-type)         | ✓ verified live                    |
| INV-06 sheet-only editing, no inline input               | ✓ vitest + live                    |
| INV-09/10 row + group render (value/P-L/weight, group-%) | ✓ verified live                    |
| INV-11 DnD reorder/group-reassign/cross-section reject   | ⚠ logic shipped; visual feel → UAT |
| INV-16 optimistic create/edit/reorder via clientApiWrite | ✓ verified live (persists)         |

## Post-completion evolution (2026-06-21) — see 09-ADDENDUM-type-first.md

After completion, owner UAT drove: (1) five defect fixes incl. the budget-scoped API
path 404 the optimistic insert had masked; (2) provider rework (Finnhub US / Twelve
Data non-US+metals / CoinGecko crypto, multi-key failover, env cadence; metals.dev
dropped); (3) the **type-first redesign** (11 UI types, metals metal/kind/UoM, migration
0039). Re-verified: 19 domain + 16 adapter + 12 web tests, typecheck 0, i18n PASS,
6 @investments-wallet E2E (0 flaky), and live Playwright (type-first ordering, per-type
field swap, type-filtered autocomplete, manual add persists with ui_type). Full detail
in the addendum.

## Status: human_needed

Functional path verified. Visual/interaction polish + live tracked-price (needs
provider API keys) deferred to UAT — see `09-HUMAN-UAT.md` (6 pending items).
Owner elected to defer manual testing to the UAT phase.
