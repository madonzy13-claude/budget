---
quick_id: 261102-pf1
status: complete
---
# Summary

- Page-load burst of 13 overview/investments/aggregate requests on the real
  budget: DB statements 7,374 → 3,078 (3 bursts). Deployed api, traced: every
  endpoint p50 0.13-0.87s under the burst (was up to 15s single); wealth 555 →
  45 statements/request.
- Pool size 10/25/50 measured: no difference — what remains is CPU in the one
  Bun process (~50ms per heavy request), not the DB.
- Tests red first: fx memo (3), tx one-statement (1), jit conf (1), history
  repo listForHoldings (1). investments/budgeting/platform + api adapter: 1411
  pass; 10 fail identically on main (demo-refresh, planned whole-months —
  pre-existing). 23 api route files: 176 pass. tsc + eslint clean.
- Dev DB: `ALTER SYSTEM SET jit = off` applied live (single-file bind mount
  keeps the old inode until the db container restarts).
