---
quick: 20261113-demo-realism
status: complete
---

# Demo account realism

**Review:** four agents (spendings, wallets/incomes/schedules/reserves,
investments, visitor crawl in en/pl/uk). Main causes: one money factor per
budget applied to every currency (family ~9× too expensive, hryvnia ~9× too
cheap), names assigned by random-id order, and a frozen demo since 0110.

**Fixed**
- A: manifest knows the 0110 columns; a refused refresh now FAILS the job
  (c2ca3286). Worker registers demo-refresh after the deps it uses (06a70cb2).
- B: value × rate(row ccy → demo ccy) × factor; wealth ×0.1–5 (wallets except
  RESERVE, investments), flow ×0.8–1.2 (everything else); prices converted only;
  qty 8 decimals; one-unit assets stay qty 1; coins whole; ledger fx_rate
  re-derived. Factors: DEMO_WEALTH_SCALES / DEMO_FLOW_SCALES, else a stable
  fmix32 pick from the demo budget id. Anchor re-copy removed. Rate missing →
  refresh fails (fail closed).
- C: names built in code (demo_names temp table): categories by meaning of the
  source name, wallets by type (currency on wrap), holdings by type ("BTC –
  Exchange", "Krugerrand 1 oz", "Brokerage Account", "Savings USD"), groups by
  type, incomes by cadence/size, reserve notes by sign; notes from the
  category picked by amount rank (priciest item for the biggest amount); empty
  notes filled; a scheduled payment's ledger rows carry its name.
- D: single multi-coin purchase → staged purchases (same coins and cost).
- E: wants = total − needs.
- F (UI, all users): Overview / all-budgets / task banner / cushion setting
  format money and percents in the visitor's locale (was pinned "en"); the
  where-it-sits / by-type pies say "All" in the centre instead of repeating the
  caption; the all-budgets page follows the member's privacy setting.

**Live factors on dev:** personal-en flow 1.039 wealth 0.182; family-en 0.995 /
4.726; personal-pl 0.871 / 0.293; family-pl 0.908 / 0.374; personal-uk 1.188 /
1.344; family-uk 1.072 / 0.424.

**Tests:** platform demo 113/0 (realism 18, copy 20, config 19, rules 28,
refresh 9, preflight 15, suppression 4); aggregate use case 17/0; api aggregate
4/0; web overview/aggregate/settings 455+51/0; E2E demo-account + all-budgets +
overview + projection 29 passed, 1 flaky (demo invite under load; 3/3 alone).

**Not done / left:** real data the owner hasn't entered (no November spending
yet; some tiny limits like Education $1); chart axes keep compact "1.5K"; "All"
untranslated in pl (user excluded).
