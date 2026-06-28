---
phase: 09-investments-wallet
slug: investments-wallet
status: verified
threats_total: 19
threats_closed: 19
threats_open: 0
audited_at: 2026-06-28
asvs_level: 2
block_on: high
---

# Phase 9 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.
> Retroactive audit — phase predates the secure-phase gate.

---

## Trust Boundaries

| Boundary                                                                                                        | Description                                                                                                                                                | Data Crossing                                      |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| client → `/budgets/:budgetId/investments/*`                                                                     | Untrusted JSON; Zod `safeParse` per state-changing endpoint; tenant from `pickTenant(c)` (never client-supplied); membership middleware + RLS as 2nd layer | Holding CRUD, reorder, on-add price fetch          |
| app_role conn → `budgeting.investments`                                                                         | Per-tenant RLS predicate on `app.tenant_ids`; FORCE RLS                                                                                                    | Holding rows (money cents, quantity)               |
| worker_role cron → `budgeting.investments`                                                                      | SELECT-only permissive cross-tenant scan policy for held-set reads; writes still go through `withTenantTx` (WITH CHECK)                                    | DISTINCT held `instrument_id`s, delisted-task emit |
| price adapters → external HTTP (Twelve Data / CoinGecko / metals.dev)                                           | Fixed provider host; symbol `encodeURIComponent` into query only; `AbortSignal.timeout`; symbol pre-validated against `instruments`                        | Instrument symbol out, price quote in              |
| app_role/worker_role → reference tables (`instruments`, `instrument_price_cache`, `instrument_price_snapshots`) | Grants only, NO RLS by design (no tenant data)                                                                                                             | Instrument metadata, cached/snapshot prices        |
| client → `POST /investments/price/:id`                                                                          | Server-side atomic counter `api_rate_limits` (10/user/min); not client-controlled                                                                          | On-add price preview                               |
| browser → investments UI (`wallets-tab/`)                                                                       | Render gated by `investmentsEnabled` from `useBudget` server DTO — convenience only; API is the real boundary                                              | Holdings display                                   |

---

## Threat Register

| Threat ID | Category                                   | Component                                 | Disposition | Mitigation (file:line)                                                                                                                                                                                                     | Status |
| --------- | ------------------------------------------ | ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-09-01   | Information Disclosure                     | `budgeting.investments` holdings RLS      | mitigate    | `ENABLE RLS` + `investments_tenant_isolation` (USING+WITH CHECK on `app.tenant_ids`) `drizzle/0038_phase09_investments.sql:91-99`; FORCE RLS `apps/migrator/post-migration.sql:782`; GRANT `:781`                          | closed |
| T-09-02   | Tampering                                  | `tasks_kind_chk` + `holding_type` CHECK   | mitigate    | `tasks_kind_chk` DROP+ADD 4-value incl `INVESTMENT_INSTRUMENT_DELISTED` `0038:110-115`; `investments_holding_type_chk` 9-value `0038:86-87`                                                                                | closed |
| T-09-03   | Denial of Service                          | Instrument trigram search index           | mitigate    | `CREATE EXTENSION pg_trgm` `0038:13` + GIN `instruments_search_gin` `0038:45-46`; 2-char min `instrument-repo.ts:55-56`                                                                                                    | closed |
| T-09-04   | Tampering                                  | portfolio-metrics weight/P-L math         | mitigate    | `import Big` + all arithmetic via big.js `portfolio-metrics.ts:10,32-201`; cents stay bigint→string at boundary                                                                                                            | closed |
| T-09-05   | Information Disclosure                     | domain entity import hygiene              | mitigate    | `holding.ts` plain class, zero drizzle/Hono/adapter imports `:1-112`                                                                                                                                                       | closed |
| T-09-06   | Tampering (SSRF/symbol injection)          | price-provider adapters                   | mitigate    | fixed hosts `twelve-data.ts:17` / `coingecko.ts:17` / `metals-dev.ts:16`; `encodeURIComponent` `:36/:36/:37`; `AbortSignal.timeout` `:40/:40/:41`; symbol pre-validated `fetch-instrument-price.ts:78`                     | closed |
| T-09-07   | Information Disclosure                     | provider adapter logging                  | mitigate    | keys constructor-injected (`twelve-data.ts:22-27`, `coingecko.ts:22-27`, `metals-dev.ts:20-23`); grep `apiKey`+logger in adapters = 0 matches                                                                              | closed |
| T-09-08   | Tampering (search injection)               | `InstrumentRepo.search`                   | mitigate    | bound `sql` params `${q}`/`${ac}`, no interpolation `instrument-repo.ts:61-76`                                                                                                                                             | closed |
| T-09-09   | Denial of Service (quota)                  | metals.dev daily-only                     | mitigate    | `MetalsDailyOnlyError` thrown when `context==='hourly'` before any fetch `metals-dev.ts:31-33`                                                                                                                             | closed |
| T-09-10   | Denial of Service (quota)                  | hourly price cron                         | mitigate    | `SELECT DISTINCT` held set in ONE query + `refresh_cadence <> 'daily'` + `provider NOT LIKE 'manual%'` `instrument-price-hourly.ts:36-48`; `withInfraTx` `:34`                                                             | closed |
| T-09-11   | Tampering (duplicate-task)                 | delisted-task emit dedup                  | mitigate    | partial unique idx `tasks_investment_delisted_dedup_idx` `0038:121-123`; emit `ON CONFLICT DO NOTHING` `task-repo.ts:327`; inside `withTenantTx` `instruments-daily-seed.ts:148`                                           | closed |
| T-09-12   | Information Disclosure                     | reference-data jobs touch all instruments | mitigate    | reference tables no RLS, grants only `post-migration.sql:795-796`; jobs use `withInfraTx` (worker_role) `instrument-price-hourly.ts:34`, `instruments-daily-seed.ts:97,119,134`, `investment-snapshot-daily.ts:31,49`      | closed |
| T-09-13   | Information Disclosure (test gap)          | tenant-leak CI gate                       | mitigate    | `USER-DATA-TABLES.txt:38` registers `budgeting.investments TENANT-SCOPED`; live Layer-2 RLS assertion `tests/tenant-leak/investments-cross-tenant.test.ts:107-128`                                                         | closed |
| T-09-14   | Elevation of Privilege (authz)             | investments routes                        | mitigate    | `pickTenant(c)` `investments.ts:13-16` used in every handler (`:64,79,137,166,198`); RLS 2nd layer; no client-supplied tenant                                                                                              | closed |
| T-09-15   | Tampering (cross-section reorder)          | `POST /investments/reorder`               | mitigate    | `reorderHoldings` validates every `orderedId` ∈ tenant holdings → `holding_id_not_in_section` `reorder-holdings.ts:22-25`                                                                                                  | closed |
| T-09-16   | Elevation of Privilege (rate-limit bypass) | on-add price fetch                        | mitigate    | `api_rate_limits` table `0038:129-134`; atomic upsert `INSERT…ON CONFLICT DO UPDATE SET count = count+1 RETURNING count`, `RATE_LIMIT=10`, server-side `fetch-instrument-price.ts:100-109`; route 429 `investments.ts:121` | closed |
| T-09-17   | Input Validation                           | POST/PATCH bodies                         | mitigate    | `safeParse` every endpoint (`investments.ts:56,141,171`); `holdingTypeSchema` 9-value `z.enum` `contracts/api.ts:9-19`; numeric→`numericString`→big.js `:71-73`                                                            | closed |
| T-09-18   | Tampering (client flag bypass)             | `investments_enabled` render              | mitigate    | flag from `useBudget` server DTO `investments-section.tsx:226-234`; render gate `:661` (`if (!investmentsEnabled) return null`); real boundary is T-09-14 + RLS                                                            | closed |
| T-09-19   | Information Disclosure (XSS)               | holding/group/instrument name render      | mitigate    | grep `dangerouslySetInnerHTML` across all 7 investment components (`wallets-tab/`) = 0 matches; all strings render as React text nodes                                                                                     | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

No accepted risks — all 19 threats carry `mitigate` disposition and are closed in code.

---

## Unregistered Flags

None. A new RLS policy `investments_worker_cron_scan` (SELECT-only, permissive, worker_role only, `post-migration.sql:790-792`) surfaced during implementation — intentional, maps to registered threats T-09-10 / T-09-12 (cron held-set cross-tenant reads). Correctly narrowed: SELECT-only, worker_role-only; all worker writes still pass through `withTenantTx` so `investments_tenant_isolation` WITH CHECK applies. Not a gap.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-06-28 | 19            | 19     | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
