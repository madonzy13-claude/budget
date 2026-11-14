---
quick_id: 261102-ui1
status: complete
---
# Summary

- RowActions (wallets-tab/row-actions.tsx) + REVEAL_ON_ROW; useFitCurrencyColumn
  sets --ccy-w on the Wallets tab; global.css drops the dots on the bordered
  dropdown (button[role=combobox]).
- First E2E run caught the panel opening OVER the "…" (Delete under the cursor):
  it now opens to the left of it.
- Vitest 3021 pass (hook test red first; row/ledger/header tests rewritten for
  the new design). E2E desktop 112/114 then both fixed (flat-P/L step hovers;
  coin-price step waited on "" mid-load), new @r7-desktop-rows green; phone
  112/113, the one failure (@r5-group-close) passes on rerun.
