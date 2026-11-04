---
phase: 14
slug: multi-currency-budgets-changeable-budget-currency-per-catego
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                                                 | Description                                                     | Data Crossing                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Client → API (category / limit / currency / adjust / transaction routes) | Member-supplied currencies and amounts                          | Currency codes (validated against FIAT_CURRENCIES), cents as strings or integers |
| API → Postgres (tenant tx, RLS)                                          | Every money read and write runs in withTenantTx under FORCE RLS | Tenant money data (PII)                                                          |
| Postgres reference data (fx_rates)                                       | RLS-free rate table read by fx_convert (SECURITY INVOKER)       | Public exchange rates                                                            |
| Migrator → Postgres (0104 / 0105)                                        | Backfill with FORCE RLS lifted, then restored                   | Categories, limits, adjustments                                                  |

---

## Threat Register

| Threat ID | Category               | Component                             | Disposition | Mitigation                                                                                                                                                                                                                          | Status |
| --------- | ---------------------- | ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-14-01   | Tampering              | 0104 backfill under FORCE RLS         | mitigate    | NO FORCE / FORCE restore pair; psql check (c)+(d) after migrate                                                                                                                                                                     | closed |
| T-14-02   | Information disclosure | fx_convert                            | mitigate    | SECURITY INVOKER; reads only RLS-free reference table fx_rates; no tenant data touched                                                                                                                                              | closed |
| T-14-03   | Tampering              | fabricated rate                       | mitigate    | NULL for unknown pair, test asserts NULL; no COALESCE to 1                                                                                                                                                                          | closed |
| T-14-04   | Denial of service      | fx_convert without index              | mitigate    | ::bpchar cast + perf test < 500 ms + EXPLAIN assertion                                                                                                                                                                              | closed |
| T-14-05   | Tampering (SQLi)       | fx-sql.ts fragments                   | mitigate    | Drizzle `sql` bind params only; no sql.raw                                                                                                                                                                                          | closed |
| T-14-06   | Tampering              | float money in settlement             | mitigate    | bigint + Big with explicit rounding; eslint no-float-money; source guard test for Number(/parseFloat                                                                                                                                | closed |
| T-14-07   | Tampering              | missing rate treated as 1             | mitigate    | null rate → `unconvertible`, never par conversion; tested                                                                                                                                                                           | closed |
| T-14-08   | Tampering              | money precision                       | mitigate    | bigint + convertCents explicit rounding; eslint no-float-money                                                                                                                                                                      | closed |
| T-14-09   | Tampering              | fx_rates pollution by E2E             | mitigate    | provider 'e2e-seed', ON CONFLICT DO NOTHING (never overwrite real rates), delete only RETURNING rows                                                                                                                                | closed |
| T-14-10   | Information disclosure | i18n strings                          | accept      | static copy, no PII                                                                                                                                                                                                                 | closed |
| T-14-11   | Tampering              | currency field                        | mitigate    | z.enum(FIAT_CURRENCIES) — 422 for anything else (no FX history outside the 8)                                                                                                                                                       | closed |
| T-14-12   | Information disclosure | category lookup in create-transaction | mitigate    | lookup inside withTenantTx with tenant_id predicate + RLS; 404 for foreign ids                                                                                                                                                      | closed |
| T-14-13   | Elevation              | category create                       | accept      | existing membership gate unchanged                                                                                                                                                                                                  | closed |
| T-14-14   | Information disclosure | target currency source                | mitigate    | budget currency read from tenancy.budgets in the tenant tx, never from request                                                                                                                                                      | closed |
| T-14-15   | Tampering (SQLi)       | new SQL                               | mitigate    | Drizzle bind params; no sql.raw                                                                                                                                                                                                     | closed |
| T-14-16   | Denial of service      | per-row fx_convert                    | mitigate    | relies on plan 01 index-backed fn; fixture + existing route latency unchanged (record timing)                                                                                                                                       | closed |
| T-14-17   | Tampering              | missing rate → par                    | mitigate    | NoFxRateAvailable → 0 + fxUnavailable flag, never rate 1                                                                                                                                                                            | closed |
| T-14-18   | Denial of service      | summary fails on one missing pair     | mitigate    | per-row fallback, summary never throws on FX                                                                                                                                                                                        | closed |
| T-14-19   | Tampering (SQLi)       | new SQL fragments                     | mitigate    | Drizzle bind params only                                                                                                                                                                                                            | closed |
| T-14-20   | Denial of service      | slower overview                       | mitigate    | timing recorded, < 500 ms gate                                                                                                                                                                                                      | closed |
| T-14-21   | Information disclosure | cross-tenant                          | mitigate    | tenant_id predicates kept; run `make ci-gate` at phase end (plan 19)                                                                                                                                                                | closed |
| T-14-22   | Tampering (SQLi)       | raw SQL in application files          | mitigate    | bind params only; no sql.raw                                                                                                                                                                                                        | closed |
| T-14-23   | Tampering              | missing wallet rate                   | mitigate    | sumWalletsToCurrency existing stale/skip semantics; no rate 1                                                                                                                                                                       | closed |
| T-14-24   | Tampering (SQLi)       | targetCurrency param                  | mitigate    | value from tenancy.budgets, bound param                                                                                                                                                                                             | closed |
| T-14-25   | Repudiation            | snapshot rewrite                      | mitigate    | stored snapshots never updated; conversion on read only                                                                                                                                                                             | closed |
| T-14-26   | Tampering              | money math in loader                  | mitigate    | bigint + convertCents only; eslint no-float-money                                                                                                                                                                                   | closed |
| T-14-27   | Denial of service      | replay throws on missing rate         | mitigate    | skip + fxUnavailable flag                                                                                                                                                                                                           | closed |
| T-14-28   | Information disclosure | new per-row query                     | mitigate    | tenant_id + budget_id predicates inside withTenantTx                                                                                                                                                                                | closed |
| T-14-29   | Tampering              | payload amounts                       | mitigate    | server-computed only; bigint serialized as string; clients never write payload                                                                                                                                                      | closed |
| T-14-30   | Information disclosure | wallet totals query                   | mitigate    | tenant_id predicate + RLS                                                                                                                                                                                                           | closed |
| T-14-31   | Denial of service      | missing rate breaks task recompute    | mitigate    | unconvertible currencies isolated by settlement; recompute never throws on FX                                                                                                                                                       | closed |
| T-14-32   | Information disclosure | reserves summary                      | mitigate    | existing tenant-scoped route + membership gate unchanged; route test covers non-member 403/404 as today                                                                                                                             | closed |
| T-14-33   | Tampering              | bigint precision in JSON              | mitigate    | all cents serialized as strings                                                                                                                                                                                                     | closed |
| T-14-34   | Tampering (XSS)        | payload strings                       | mitigate    | rendered as React text nodes; no dangerouslySetInnerHTML; currency codes from server enum                                                                                                                                           | closed |
| T-14-35   | Tampering              | E2E seed                              | accept      | test-only, fresh user tenant                                                                                                                                                                                                        | closed |
| T-14-36   | Tampering              | wallet currency                       | mitigate    | existing Zod regex on wallet currency kept; unconvertible currencies isolated by settlement (no rate 1, no crash) — tested                                                                                                          | closed |
| T-14-37   | Elevation              | wallet update                         | accept      | existing membership gate unchanged; route test keeps non-member case                                                                                                                                                                | closed |
| T-14-38   | Tampering              | currency                              | mitigate    | z.enum(FIAT_CURRENCIES)                                                                                                                                                                                                             | closed |
| T-14-39   | Elevation / IDOR       | category id                           | mitigate    | tenant-scoped lookup under RLS; 404 for foreign ids; same permission gate as PATCH /:id (tested)                                                                                                                                    | closed |
| T-14-40   | Tampering              | partial write                         | mitigate    | currency + segments in one tx with advisory lock; rate failure aborts before writes                                                                                                                                                 | closed |
| T-14-41   | Repudiation            | limit history                         | mitigate    | past segments never rewritten (closed months frozen) — superseded 2026-11-04 (14-25, owner): a change from a PAST month rewrites only that month's segment (split, converted from converted_from); ledger never rewritten (T-14-48) | closed |
| T-14-42   | Tampering              | client-side preview value             | mitigate    | preview is display-only; server converts authoritatively (plan 16)                                                                                                                                                                  | closed |
| T-14-43   | Tampering (XSS)        | pair/currency in error copy           | mitigate    | i18n interpolation as text; values from server enum                                                                                                                                                                                 | closed |
| T-14-44   | Tampering              | client-chosen currency                | accept      | server validates currencyOrig regex and converts; client default is convenience only                                                                                                                                                | closed |
| T-14-45   | Elevation              | non-owner currency change             | mitigate    | existing touchesIdentity owner gate; 403 test                                                                                                                                                                                       | closed |
| T-14-46   | Tampering              | currency value                        | mitigate    | z.enum(FIAT_CURRENCIES) on route, budgets create/update and tenancy schema; 422 test                                                                                                                                                | closed |
| T-14-47   | Tampering (SQLi)       | removed hasTransactions guard path    | mitigate    | no new sql.raw; existing sanitised uuid path unchanged                                                                                                                                                                              | closed |
| T-14-48   | Repudiation            | ledger rewrite on change              | mitigate    | no ledger UPDATE on change; byte-identical rows asserted                                                                                                                                                                            | closed |
| T-14-49   | Elevation              | member sees enabled picker            | mitigate    | UI gate !isOwner → read-only; server 403 is authoritative (plan 19)                                                                                                                                                                 | closed |
| T-14-50   | Information integrity  | stale cached totals                   | mitigate    | budget-scoped invalidation + reload scenario in E2E                                                                                                                                                                                 | closed |
| T-14-51   | Information disclosure | cross-tenant leakage in new queries   | mitigate    | make ci-gate (6 tenant-leak tests) must pass                                                                                                                                                                                        | closed |
| T-14-SC   | Tampering              | package installs                      | accept      | phase installs no packages (RESEARCH Package Legitimacy Audit: none)                                                                                                                                                                | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                         | Accepted By          | Date       |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- | ---------- |
| AR-14-01 | T-14-10    | i18n strings are static copy, no PII                                                                              | plan 14 threat model | 2026-11-03 |
| AR-14-02 | T-14-13    | category create keeps the existing membership gate                                                                | plan 14 threat model | 2026-11-03 |
| AR-14-03 | T-14-35    | E2E seed is test-only, inside a fresh user's tenant                                                               | plan 14 threat model | 2026-11-03 |
| AR-14-04 | T-14-37    | wallet update keeps the existing membership gate                                                                  | plan 14 threat model | 2026-11-03 |
| AR-14-05 | T-14-44    | the client currency default is a convenience; the server validates (tightened to FIAT_CURRENCIES by review WR-03) | plan 14 threat model | 2026-11-03 |
| AR-14-06 | T-14-SC    | the phase installs no packages                                                                                    | plan 14 threat model | 2026-11-03 |
| AR-14-07 | T-14-41    | design change: a past-month currency change rewrites exactly that month's limit segment (owner decision, 14-25)   | owner                | 2026-11-04 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                                                    |
| ---------- | ------------- | ------ | ---- | --------------------------------------------------------- |
| 2026-11-04 | 52            | 52     | 0    | gsd-security-auditor (sonnet), spot-check of code + tests |

Scope notes for this audit:

- Mitigations were verified by reading code and tests. The DB suites, the fx_convert perf test and `make ci-gate` were NOT re-run by the auditor.
- T-14-21 and T-14-51 rest on the 14-21 ci-gate run (80/0). The DB suites did run in the phase regression: backend 2383 pass + 2 pre-phase baseline fails, 2026-11-04.
- T-14-39: the currency route has no owner-only gate, matching PATCH /categories/:id as the plan required; tenant scoping is by RLS (404 for a foreign id is tested).
- T-14-50 (budget-scoped invalidation) was cited from the plan, not re-verified.
- Plans 14-22 to 14-25 added no threat rows.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
