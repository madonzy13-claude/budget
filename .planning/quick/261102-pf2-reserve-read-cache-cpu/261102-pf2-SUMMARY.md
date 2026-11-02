---
quick_id: 261102-pf2
status: complete
---
# Summary

Deployed api, real budget, traced burst of 13 heavy requests at once: every
endpoint p50 0.09-0.49s (round 1: 0.13-0.87s; original: up to 15s). Statements
per request: cards 125 → 81, overspent 75 → 31, reserves 37 → 15, aggregate
524 → 337. Sequential medians: all ≤ 0.25s (aggregate 394 → 242ms, overspent
66 → 38ms, projection 83 → 29ms, reserves 40 → 11ms, investments/pl 109 → 32ms).

- Deposit value 3-year daily: 1.8s → 0.43ms, identical cents (324-case grid vs
  an exact reference, calendar edges vs Temporal).
- Reserve fit 123 → 28ms per run, golden-hash identical.
- Tests: investments + budgeting + platform + api middleware/adapter 1480 pass,
  0 fail (the 10 old failures fixed). 31 api route files 223 pass. tsc + eslint
  clean. E2E on dev (reserves, rebalance, overview, projection, aggregate, cushion,
  investments-assets; desktop + mobile): all passed; 2 mobile investments
  scenarios flaked once and passed on retry / isolated rerun.
