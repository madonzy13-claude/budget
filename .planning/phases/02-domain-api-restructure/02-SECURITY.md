---
phase: 02
slug: domain-api-restructure
status: verified
threats_open: 0
asvs_level: 2
created: 2026-05-12
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Verdict:** SECURED — 21/21 closed (18 mitigate verified + 3 accepts documented)
**Auditor:** gsd-security-auditor (Sonnet 4.6)
**block_on:** high

---

## Trust Boundaries

| Boundary                                       | Description                                                          | Data Crossing                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Client → API (Hono routes)                     | Untrusted JSON bodies; Zod validates shape                           | Transaction edits, recurring-rule cadence, share-link create/revoke, ttlDays |
| API → Frankfurter FX                           | Unauthenticated external; rates bound-checked                        | FX rate (decimal string)                                                     |
| API → Postgres (app_role)                      | RLS + column-level GRANT enforce per-tenant + append-only invariants | Tenant-scoped rows; expense_ledger column-restricted UPDATE                  |
| pg-boss cron → DB (worker_role)                | Worker writes ledger drafts via limited GRANTs                       | recurring-rule generated drafts                                              |
| API → recurring-rules CRUD                     | Client supplies cadence + selectors; Zod discriminated union         | Cadence body                                                                 |
| API → reserve VIEW                             | RLS on base tables; view inherits via security_invoker               | Reserve aggregates                                                           |
| Recipient (unauth) → GET /budgets/join/{token} | Token IS the credential                                              | Budget name only (accepted disclosure)                                       |
| Recipient (post-auth) → POST /accept           | Better Auth addMember; race-safe accept                              | Membership grant                                                             |
| Owner → POST /share + DELETE /share/{id}       | Session + owner role on budget                                       | Share-link lifecycle                                                         |

---

## Threat Register

| Threat ID                | Category                    | Component                                | Disposition | Mitigation                                                                                                                                                                                                                                                                                             | Status |
| ------------------------ | --------------------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T-02-01                  | Tampering                   | FX boundary (PATCH re-FX)                | mitigate    | Zod 3-char ISO + supported_currencies; rate cap 0<rate<1e6 in `edit-transaction.ts:103-107` (`Number.isFinite` + bounds guard); 5/5 unit tests in `edit-transaction-fx-bounds.test.ts`                                                                                                                 | closed |
| T-02-02                  | Tampering                   | PATCH /transactions/[id]                 | mitigate    | Server-side re-FX mandatory when currency/date changes; amount_converted_cents never from client body — `edit-transaction.ts:79-82,98,118`                                                                                                                                                             | closed |
| T-02-09                  | EoP                         | expense_ledger.UPDATE perm               | mitigate    | Column-level GRANT UPDATE whitelist; id/tenant_id/budget_id/created_at excluded — `apps/migrator/post-migration.sql:691-694`                                                                                                                                                                           | closed |
| T-02-INCOME              | Tampering                   | POST kind classifier via negative amount | accept      | UX shortcut D-PH2-09; server canonicalizes via Math.abs + kind tag — `create-transaction.ts:66`                                                                                                                                                                                                        | closed |
| T-02-03                  | Tampering / Repudiation     | Recurring engine catch-up loop           | mitigate    | UNIQUE index (recurring_rule_id, date) WHERE recurring_rule_id IS NOT NULL; INSERT ON CONFLICT DO NOTHING — `0013.sql:230`, `recurring-engine.ts:135`                                                                                                                                                  | closed |
| T-02-CADENCE-INJECTION   | Tampering                   | POST /recurring-rules cadence body       | mitigate    | Zod discriminatedUnion; DB CHECKs yearly_month_chk + cadence_anchor_chk — `recurring-rules.ts:20`, `0013.sql:297-322`                                                                                                                                                                                  | closed |
| T-02-WORKER-FX           | Tampering                   | Worker FX during draft INSERT            | mitigate    | `computeRecurringFx` (`recurring-engine-fx.ts`) invoked from both engine copies; cross-currency path calls FxProvider, enforces 0<rate<1e6; worker bootstrap wires `fxProvider` from `createBudgetingModule` at `apps/worker/src/worker.ts:42`; 6/6 unit tests in `recurring-engine-fx-bounds.test.ts` | closed |
| T-02-CATCHUP-DOS         | DoS                         | Catch-up iteration count                 | accept      | Worst-case 365 inserts/tx acceptable at v1.1 household scale; profile in Phase 5                                                                                                                                                                                                                       | closed |
| T-02-04                  | Tampering / Info Disclosure | Cushion-mode-as-of-month drift           | mitigate    | View JOINs budget_mode_history SCD-2 with effective_from/effective_to semantics — `0014_fix_reserve_view.sql:83-87`                                                                                                                                                                                    | closed |
| T-02-RESERVE-TENANT-LEAK | Information Disclosure      | category_reserve_balance VIEW            | mitigate    | FORCE RLS on base tables (expense_ledger, category_limits, budget_mode_history); migration 0017 added security_invoker=true                                                                                                                                                                            | closed |
| T-02-RESERVE-OVERFLOW    | Tampering                   | Negative reserve clamp                   | mitigate    | GREATEST(0, ...) in base + recursive case — `0014_fix_reserve_view.sql:128,147` (RSRV-02)                                                                                                                                                                                                              | closed |
| T-02-05                  | Spoofing                    | Share-link token generation              | mitigate    | nanoid(32) — ~192-bit entropy URL-safe — `create-share-link.ts:45-46`                                                                                                                                                                                                                                  | closed |
| T-02-06                  | EoP                         | Revoked/expired/used link reuse          | mitigate    | Defense-in-depth WHERE accepted_by IS NULL AND revoked_at IS NULL AND expires_at > now() — `budget-share-link-repo.ts:155-157`; 409/410 differentiation                                                                                                                                                | closed |
| T-02-08                  | Information Disclosure      | Cross-tenant token probe                 | mitigate    | findByToken via withInfraTx (token is global credential); no enumeration endpoint; tenant-leak CI gate 26/26 — `budget-share-link-repo.ts:109,113`                                                                                                                                                     | closed |
| T-02-NON-OWNER           | EoP                         | Non-owner create/revoke                  | mitigate    | Owner role check via budget_members — `create-share-link.ts:40-41`, `revoke-share-link.ts:37-38`                                                                                                                                                                                                       | closed |
| T-02-TTL-BYPASS          | EoP                         | Client-supplied ttlDays                  | mitigate    | Zod z.number().int().min(1).max(90); server computes expires_at — `budgets.ts:272`                                                                                                                                                                                                                     | closed |
| T-02-PUBLIC-RESOLVE-LEAK | Information Disclosure      | GET resolve leaks budget name            | accept      | Budget name is minimum required for SHRD-04 confirmation; token bearer is intended recipient                                                                                                                                                                                                           | closed |
| T-02-07                  | Tampering / Repudiation     | Hex boundary breach                      | mitigate    | dep-cruiser rules ban drizzle-orm/hono/@hono/_/ai/@ai-sdk/_ from domain; `dep-cruiser-domain-isolation.test.ts:71` — 0 violations                                                                                                                                                                      | closed |
| T-02-SILENT-DB-DRIFT     | Tampering                   | Migration vs Drizzle schema drift        | mitigate    | `v11-shape.test.ts` 28 static-parse assertions on migration SQL + Drizzle files; `drift-repair-guard.sh`                                                                                                                                                                                               | closed |
| T-02-ORPHAN-ROUTE        | Tampering / Repudiation     | Route without integration test           | mitigate    | `route-coverage-audit.test.ts:34-69` iterates apps/api/src/routes/\*.ts; 1/1 pass                                                                                                                                                                                                                      | closed |
| T-02-COVERAGE-REGRESSION | Repudiation                 | Domain coverage <80%                     | mitigate    | bunfig.toml coverageThreshold=0.80 — `bunfig.toml:12`                                                                                                                                                                                                                                                  | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Resolved Threats — Fix Log (2026-05-12)

### T-02-01 — FX rate bounds enforced on PATCH path

`packages/budgeting/src/application/edit-transaction.ts:97-109` — after `fxProvider.rateAsOf()`, the rate is parsed via `Number()` and rejected when `!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6` (mirror of `create-transaction.ts:101-103`). Returns `err(new Error(...))` before persistence, so no out-of-bound rate can reach `transactionRepo.updateInPlace()`.

Unit tests (`packages/budgeting/test/ledger/edit-transaction-fx-bounds.test.ts`, 5/5 pass): rate `0`, negative, `>= 1e6`, `NaN` all rejected with `updates.length === 0`; in-bounds rate (`0.85`) persists normally.

### T-02-WORKER-FX — Worker invokes FxProvider with bounds enforcement

New helper `computeRecurringFx` at `packages/budgeting/src/application/recurring-engine-fx.ts` encapsulates the cross-currency branch and the `0 < rate < 1e6` guard. Both engine copies (`apps/worker/src/handlers/recurring-engine.ts`, `packages/budgeting/src/application/recurring-engine.ts`) now call the helper from the catch-up loop instead of hardcoding `fxRate = "1"`. `runRecurringEngine` accepts an optional `fxProvider` (defaults to `InMemoryFxProvider` for backwards-compat with same-currency tests). `apps/worker/src/worker.ts:42` passes the real `fxProvider` constructed by `createBudgetingModule({ fxCache })`.

Unit tests (`packages/budgeting/test/recurring-engine-fx-bounds.test.ts`, 6/6 pass, 100% coverage on `recurring-engine-fx.ts`): same-currency skips FX provider; cross-currency invokes provider and computes `amount_converted_cents = round(amount_original_cents * rate)`; rate `0`, negative, `>= 1e6`, `NaN` all throw `FX rate out of bounds`. Existing worker integration suite (`apps/worker/test/handlers/recurring-engine.test.ts`, 5/5 pass) and transactions route suite (`apps/api/test/routes/transactions.test.ts`, 10/10 pass) remain green — no regression.

---

## Accepted Risks Log

| Risk ID  | Threat Ref               | Rationale                                                                                                                                                                             | Accepted By         | Date       |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- |
| AR-02-01 | T-02-INCOME              | Negative amount as INCOME classifier is deliberate UX shortcut per D-PH2-09; server canonicalizes via Math.abs + kind tag; actorUserId in audit log makes reclassification traceable. | Phase 02 plan owner | 2026-05-12 |
| AR-02-02 | T-02-CATCHUP-DOS         | Worst-case 365 inserts per tx for a daily rule paused 1 year is acceptable at v1.1 household scale; profile in Phase 5 if needed.                                                     | Phase 02 plan owner | 2026-05-12 |
| AR-02-03 | T-02-PUBLIC-RESOLVE-LEAK | Budget name disclosure is the minimum required for SHRD-04 join-confirmation UX; token bearer is the intended recipient; no financial data is exposed.                                | Phase 02 plan owner | 2026-05-12 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                            |
| ---------- | ------------- | ------ | ---- | --------------------------------- |
| 2026-05-12 | 21            | 19     | 2    | gsd-security-auditor (Sonnet 4.6) |

---

## Implementation Notes

- T-02-09 GRANT UPDATE uses column `transaction_date` (not `date`) — correct; v1.1 actual column name is `transaction_date`.
- T-02-RESERVE-TENANT-LEAK hardened beyond plan via migration 0017 (`security_invoker=true`) during UAT — defense-in-depth.
- T-02-SILENT-DB-DRIFT uses static parse by design (no live DB dependency); v11-shape gate covers migration SQL + Drizzle schema files.
- Migration chain inconsistency (0013 Section E broken VIEW fixed by 0014) documented in `02-VERIFICATION.md` §Deviations D1 — not a security gap.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed — **currently 2; blocked**
- [ ] `status: verified` set in frontmatter

**Approval:** pending — phase advancement blocked until T-02-01 and T-02-WORKER-FX mitigations are implemented or formally accepted as risks.
