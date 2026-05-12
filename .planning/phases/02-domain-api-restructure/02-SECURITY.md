---
phase: 02
slug: domain-api-restructure
status: draft
threats_open: 2
asvs_level: 2
created: 2026-05-12
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Verdict:** OPEN_THREATS — 19/21 closed, 2 open BLOCKERs
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

| Threat ID                | Category                    | Component                                | Disposition | Mitigation                                                                                                                                              | Status   |
| ------------------------ | --------------------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T-02-01                  | Tampering                   | FX boundary (PATCH re-FX)                | mitigate    | Zod 3-char ISO + supported_currencies; rate cap 0<rate<1e6 in edit-transaction service before persist                                                   | **open** |
| T-02-02                  | Tampering                   | PATCH /transactions/[id]                 | mitigate    | Server-side re-FX mandatory when currency/date changes; amount_converted_cents never from client body — `edit-transaction.ts:79-82,98,118`              | closed   |
| T-02-09                  | EoP                         | expense_ledger.UPDATE perm               | mitigate    | Column-level GRANT UPDATE whitelist; id/tenant_id/budget_id/created_at excluded — `apps/migrator/post-migration.sql:691-694`                            | closed   |
| T-02-INCOME              | Tampering                   | POST kind classifier via negative amount | accept      | UX shortcut D-PH2-09; server canonicalizes via Math.abs + kind tag — `create-transaction.ts:66`                                                         | closed   |
| T-02-03                  | Tampering / Repudiation     | Recurring engine catch-up loop           | mitigate    | UNIQUE index (recurring_rule_id, date) WHERE recurring_rule_id IS NOT NULL; INSERT ON CONFLICT DO NOTHING — `0013.sql:230`, `recurring-engine.ts:135`   | closed   |
| T-02-CADENCE-INJECTION   | Tampering                   | POST /recurring-rules cadence body       | mitigate    | Zod discriminatedUnion; DB CHECKs yearly_month_chk + cadence_anchor_chk — `recurring-rules.ts:20`, `0013.sql:297-322`                                   | closed   |
| T-02-WORKER-FX           | Tampering                   | Worker FX during draft INSERT            | mitigate    | Worker uses FxProvider port; rate bounds 0<rate<1e6 enforced                                                                                            | **open** |
| T-02-CATCHUP-DOS         | DoS                         | Catch-up iteration count                 | accept      | Worst-case 365 inserts/tx acceptable at v1.1 household scale; profile in Phase 5                                                                        | closed   |
| T-02-04                  | Tampering / Info Disclosure | Cushion-mode-as-of-month drift           | mitigate    | View JOINs budget_mode_history SCD-2 with effective_from/effective_to semantics — `0014_fix_reserve_view.sql:83-87`                                     | closed   |
| T-02-RESERVE-TENANT-LEAK | Information Disclosure      | category_reserve_balance VIEW            | mitigate    | FORCE RLS on base tables (expense_ledger, category_limits, budget_mode_history); migration 0017 added security_invoker=true                             | closed   |
| T-02-RESERVE-OVERFLOW    | Tampering                   | Negative reserve clamp                   | mitigate    | GREATEST(0, ...) in base + recursive case — `0014_fix_reserve_view.sql:128,147` (RSRV-02)                                                               | closed   |
| T-02-05                  | Spoofing                    | Share-link token generation              | mitigate    | nanoid(32) — ~192-bit entropy URL-safe — `create-share-link.ts:45-46`                                                                                   | closed   |
| T-02-06                  | EoP                         | Revoked/expired/used link reuse          | mitigate    | Defense-in-depth WHERE accepted_by IS NULL AND revoked_at IS NULL AND expires_at > now() — `budget-share-link-repo.ts:155-157`; 409/410 differentiation | closed   |
| T-02-08                  | Information Disclosure      | Cross-tenant token probe                 | mitigate    | findByToken via withInfraTx (token is global credential); no enumeration endpoint; tenant-leak CI gate 26/26 — `budget-share-link-repo.ts:109,113`      | closed   |
| T-02-NON-OWNER           | EoP                         | Non-owner create/revoke                  | mitigate    | Owner role check via budget_members — `create-share-link.ts:40-41`, `revoke-share-link.ts:37-38`                                                        | closed   |
| T-02-TTL-BYPASS          | EoP                         | Client-supplied ttlDays                  | mitigate    | Zod z.number().int().min(1).max(90); server computes expires_at — `budgets.ts:272`                                                                      | closed   |
| T-02-PUBLIC-RESOLVE-LEAK | Information Disclosure      | GET resolve leaks budget name            | accept      | Budget name is minimum required for SHRD-04 confirmation; token bearer is intended recipient                                                            | closed   |
| T-02-07                  | Tampering / Repudiation     | Hex boundary breach                      | mitigate    | dep-cruiser rules ban drizzle-orm/hono/@hono/_/ai/@ai-sdk/_ from domain; `dep-cruiser-domain-isolation.test.ts:71` — 0 violations                       | closed   |
| T-02-SILENT-DB-DRIFT     | Tampering                   | Migration vs Drizzle schema drift        | mitigate    | `v11-shape.test.ts` 28 static-parse assertions on migration SQL + Drizzle files; `drift-repair-guard.sh`                                                | closed   |
| T-02-ORPHAN-ROUTE        | Tampering / Repudiation     | Route without integration test           | mitigate    | `route-coverage-audit.test.ts:34-69` iterates apps/api/src/routes/\*.ts; 1/1 pass                                                                       | closed   |
| T-02-COVERAGE-REGRESSION | Repudiation                 | Domain coverage <80%                     | mitigate    | bunfig.toml coverageThreshold=0.80 — `bunfig.toml:12`                                                                                                   | closed   |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Open Threats (BLOCKERs)

### BLOCKER 1 — T-02-01: FX rate bounds missing in PATCH path

**Promised mitigation:** "rate stored as string from provider but cap at 0 < rate < 1e6 in edit-transaction service before persisting"

**Gap:** `packages/budgeting/src/application/edit-transaction.ts:98-106` calls `fxProvider.rateAsOf()` and stores `fxResult.rate` directly with no bounds validation. The bounds check exists only in `create-transaction.ts:101-103`. An FX provider returning a rate of 0, NaN, or a wildly inflated value would be persisted on the PATCH path without rejection.

**Fix:** Add to `edit-transaction.ts` after the rateAsOf call:

```ts
const rateNum = Number(fxResult.rate);
if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
  return err(new InvalidFxRateError(fxResult.rate));
}
```

### BLOCKER 2 — T-02-WORKER-FX: Worker never invokes FxProvider

**Promised mitigation:** "Worker uses same FxProvider port as the API; rate bounds (0 < rate < 1e6) enforced."

**Gap:** `apps/worker/src/handlers/recurring-engine.ts:111-117` hardcodes `fxRate = "1"` and never calls `fxProvider.rateAsOf()`. Comment at line 117 defers cross-currency FX to "Phase 5". Cross-currency recurring rules generate drafts with `fx_rate=1` and incorrect `amount_converted_cents`. Bounds check cannot apply when FX is never fetched.

**Fix:** Implement cross-currency branch in `apps/worker/src/handlers/recurring-engine.ts` (and the application-layer equivalent in `packages/budgeting/src/application/recurring-engine.ts`):

```ts
if (rule.currency !== budgetCurrency) {
  const fx = await deps.fxProvider.rateAsOf({
    from: rule.currency,
    to: budgetCurrency,
    date,
  });
  const rateNum = Number(fx.rate);
  if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
    throw new InvalidFxRateError(fx.rate);
  }
  fxRate = fx.rate;
  amountConvertedCents = Math.round(amountOriginalCents * rateNum);
}
```

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
