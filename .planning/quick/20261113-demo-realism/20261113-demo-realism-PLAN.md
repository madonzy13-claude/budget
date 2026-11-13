---
quick: 20261113-demo-realism
---

# Demo account realism

User (2026-11-13): review the demo; names and amounts are ridiculous in places;
investments look thin. Then: "do all of it, including the polish bugs (apart of
'all'). multiplier for investments and wallets should be x0.1-5, everything
else x0.8-1.2".

## Tasks

A. Unblock the nightly refresh (0110 columns unmanifested; refusal silently
   "completed"). DONE c2ca3286.

B. Money: value × rate(row currency → demo currency) × factor.
   - wealth factor 0.1–5: wallets (except RESERVE), investment quantities and
     investment ledger amounts; flow factor 0.8–1.2: everything else.
   - prices are converted only, never scaled; quantities keep 8 decimals.
   - coins stay whole; one-unit (amount) assets stay quantity 1, value in price.
   - factors per budget: DEMO_WEALTH_SCALES / DEMO_FLOW_SCALES when set and in
     range, else a stable pick from the demo budget id. Anchor re-copy removed.
   - ledger fx_rate re-derived so converted = original × rate still holds.

C. Names: categories by meaning of the source name (with that concept's
   merchants for ledger + scheduled notes); wallets by type; holdings by type
   (ticker – place, coin names, account kinds, currency accounts); groups by
   type; incomes by cadence; reserve notes by sign; empty notes filled.

D. Investment history: a single multi-coin start splits into staged purchases
   (same coins, same total cost).

E. Limits: wants = total − needs after rounding.

F. Polish UI: mixed number formats (Overview "1,341,311 zł" vs "6072,65 zł"),
   duplicated "Rozkład | Rozkład" heading. ("All" untranslated: user excluded.)

Verify: platform demo tests (testcontainer), run the refresh on dev, re-dump and
re-check the demo, Playwright on the demo pages.
