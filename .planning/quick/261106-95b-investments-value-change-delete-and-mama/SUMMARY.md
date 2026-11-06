---
quick_id: 261106-95b
status: complete
---
# Quick 261106-95b: summary

**1. The value went to 0. Cause: the MCP tool, not the app.**
- `record_investment_transaction` created a new asset with only `buyPriceCents`. The asset's current price stayed null, which the app values at 0. Deleting a later value change then correctly went back to 0.
- The app's own form always sends `currentPriceCents`. The tool now does the same: a new hand-tracked asset starts worth its price.
- Tests (RED then GREEN): a new savings pot is worth 1000.00, and undoing its value update puts it back at exactly 1000.00. write-tools-investments + undo: 21/0.
- Commits 32ae4a21 (RED) and 73a44c1c (GREEN).

**2. Mama's budget ("Сімейний", owner ksmalvina): Green Side 1 and 2.**
- Both assets started at 22,000 USD on 2026-10-17 and have been worth 23,300 since. They had no value-change entry, because the value was edited before the ledger backfill (2026-10-26), and the backfill recorded only the start.
- **Date of the change:** the wealth snapshots jump by 2 × 1,300 USD × 45.044 = 117,114 UAH between 18:00 and 19:00 UTC on 2026-10-23.
- **Inserted** one `value_change` per asset in the app's own shape: amount 2,330,000 USD, value delta 130,000, prior price 2,200,000, effective 2026-10-23, created_at 2026-10-23 18:30Z.
- **Rows:** 0b4c4e69… (Green Side 1) and f053a8ff… (Green Side 2). The undo script is in the session scratchpad, `greenside_undo.sql`.
- **Verified through the app routes as a member:** the entries list reads start 22,000 then value update +1,300. The value is 23,300 and P/L is +1,300 (5.9%), unchanged, because the value really did rise above the purchase price.
- **Not touched:** "Кеш Полі" EUR and USD in another family's budget (Дмитро) have the same missing-entry gap; not in scope.
