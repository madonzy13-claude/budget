/**
 * investments.test.ts — Investments route integration scaffold (Wave 0, Plan 09-05).
 *
 * These bodies are it.skip until Plan 09-06 mounts the routes under
 * /budgets/:budgetId/investments. 09-06 un-skips them and fills the harness
 * (app boot + two-tenant seed) mirroring wallet-patch.test.ts / reserves.test.ts.
 *
 * The cross-tenant RLS layer is already covered LIVE (not skipped) by
 * tests/tenant-leak/investments-cross-tenant.test.ts — that file runs in
 * `make ci-gate` today because budgeting.investments exists from 09-01.
 */
import { describe, it } from "bun:test";

describe("Investments routes", () => {
  it.skip("POST /budgets/:id/investments then GET round-trips the holding with all fields (INV-03) — 09-06 fills", () => {});

  it.skip("a holding created under tenant B is NOT visible in tenant A's GET (RLS, INV-03) — 09-06 fills", () => {});

  it.skip("the 11th on-add instant price fetch within a minute for one user is rate-limited to 10/min (INV-14) — 09-06 fills", () => {});
});
