---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 10
status: complete
---

# 15-10 Summary: read tools + presentation pass

## Built

- `apps/api/src/mcp/tools/present.ts` — one recursive pass: `*_cents`/`*Cents` → decimal string (key loses suffix) in the sibling currency that shares a name token (`amount_original_cents` ↔ `currency_original`), else a plain `currency` sibling, else the budget currency — never an unrelated sibling (caught `plannedCents` next to `limitCurrency`). USER_TEXT_KEYS → `{untrusted_user_text}`. `status`/`kind` values and any key containing "draft" are reworded (DRAFT → UNCONFIRMED, hasConfirmedDraft → hasConfirmedPayment).
- `tools/read.ts` — 12 read tools, all via `dispatch` only: list_budgets, get_budget_overview (6 overview GETs in parallel, default range = last 12 months), list_categories, search_transactions (15-03 route), spending_summary (≤24 months, sequential monthly GETs, BigInt sums), get_reserves, get_projection (optional days), list_tasks, list_wallets, list_investments (holdings + type-summary, or `asset_id` entries), list_scheduled_payments, get_fx_rate.

## Deviations

- **12 tools, not 13** — the ROADMAP/RESEARCH map has 12 including list_budgets; the plan's "13" double-counted.
- `get_fx_rate` takes `budget_id`: `/fx/*` sits behind `requireWorkspace`.
- `list_categories` returns categories only; limits/spend per month come from `spending_summary` (description says so) instead of a per-category `/limits/effective` fan-out.
- Parity-test RED was produced by stashing read.ts (impl was drafted first), then committing the failing test before the feat commit.

## Verification

present 7/0; read-tools 14/0 (structuredContent == present(route JSON with the user's cookie) for every tool; search pages 200/200/rest; B's note arrives as untrusted text; spending_summary = sum of monthly routes; >24 months → range_too_large; no "draft" in scheduled payments; foreign budget → isError, no data); registry 3/0 with 12 read tools; full test/mcp 53/0; tsc + eslint clean.
