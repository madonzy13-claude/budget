---
status: diagnosed
trigger: "ledger-vs-asset-totals-mismatch: Asset totals (qty, cost, avg price, P/L) disagree with the entries listed in its L3 ledger strip."
created: 2026-10-28
updated: 2026-10-28
---

## Current Focus

hypothesis: CONFIRMED — the two "Bought" entries are legacy Phase 13 CR-01 orphans (entry written, holding qty/cost overwritten by the racing PATCH). Migration 0088 carried the inconsistent row into 13.1 without reconciling Σ entries vs asset row. 13.1 code paths themselves are consistent.
test: done
expecting: n/a
next_action: return diagnosis (find_root_cause_only)

## Symptoms

expected: Asset totals equal sum of ledger entries (LIFO delete reverses deltas).
actual: Row Qty 0.5, avg 1,000, cost 500; ledger lists Bought +1.5 @79,739, Bought +0.1 @79,739, Converted in +0.5 @1,000 (sum 2.1 / 128,082.40).
errors: none
reproduction: UAT test 12 — delete newest entry, compare totals vs entries.
started: Phase 13.1 UAT 2026-10-28

## Eliminated

- hypothesis: (a) stale ledger cache lists deleted entries
  evidence: DB has the 3 listed entries live (deleted_at NULL); only deleted BTC entry is the transfer_out (soft-deleted 11:38:56). Ledger is accurate to DB.
  timestamp: 2026-10-28
- hypothesis: (c) convert_in leg replaced instead of added
  evidence: convert_in 0.5 was the FIRST entry (holding created by it, 09:44:13 same timestamp as holding). Nothing after it replaced qty via a convert leg.
  timestamp: 2026-10-28
- hypothesis: (d) ledger mixes entries of several holdings
  evidence: all 3 live entries have holding_id cdc271c4 both now and in _investment_history_bak_0088 (pre-merge). No merge re-pointed them.
  timestamp: 2026-10-28
- hypothesis: current 13.1 buy path (buy-into-asset / create-join) skips the patch
  evidence: both planBuy and adjust write quantity+buy_price patch in the same commit tx; and the buys pre-date 13.1 code (created 2026-10-27 09:46/09:47; 13.1-10 buy use case committed 18:28, api image built 23:00).
  timestamp: 2026-10-28

## Evidence

- timestamp: 2026-10-28
  checked: budgeting.investments for budget Test
  found: Bitcoin (BTC) cdc271c4 qty 0.5, buy_price_cents 100000 (avg $1,000), created 2026-10-27 09:44:13 (by broker "Test" convert).
  implication: holding row reflects only the convert_in leg.
- timestamp: 2026-10-28
  checked: investment_history for cdc271c4 incl. deleted
  found: convert_in +0.5/50000 (09:44:13), buy +0.1/797390 (09:46:53), buy +1.5/11960850 (09:47:35), transfer_out -0.3/30000 (2026-10-28 11:33, deleted 11:38).
  implication: buys never reached the row. Transfer at 11:33 priced at $1,000/unit and LIFO undo (held+0.3 => 0.5) both imply qty was 0.5 BEFORE the transfer, i.e. the mismatch pre-existed UAT test 12; delete-entry reversed correctly.
- timestamp: 2026-10-28
  checked: _investments_bak_0088 / _investment_history_bak_0088 (pre-migration snapshot)
  found: cdc271c4 already qty 0.5 / 100000 with the same 3 entries attached.
  implication: mismatch existed under Phase 13 code, before 0088 ran; not a merge artifact.
- timestamp: 2026-10-28
  checked: git timeline vs entry created_at
  found: Entries at 2026-10-27 09:46-09:47 fall inside Phase 13 UAT (paused 10:17, commit 3678ede8). 13.1 code started 13:15; dev api image 23:00.
  implication: Phase 13 code wrote these buys.
- timestamp: 2026-10-28
  checked: 13-UAT.md gap (test 6) + 13-REVIEW.md CR-01
  found: user reported "edit the quantity, it adds to the history, but quantity actually doesn't change"; CR-01: holding-sheet handleSave fired PATCH (full-row write of quantity/buy_price from a stale read) concurrently with POST /adjust; PATCH lands after adjust and restores old qty/cost while the history entry stays live.
  implication: exact mechanism for 2 live buy entries with an untouched holding row.
- timestamp: 2026-10-28
  checked: drizzle/0088_investment_assets.sql
  found: D-35 only backfills a Start entry for holdings with NO live entry; D-33 merge sums row quantities. No step reconciles row qty/cost against Σ live entry deltas.
  implication: CR-01-corrupted rows were carried into 13.1 where the ledger is now shown as the source of truth.
- timestamp: 2026-10-28
  checked: current write paths (PATCH /:id -> editAsset, holding-repo.update, buy/sell/transfer/delete)
  found: none writes quantity/buy_price_cents outside a ledger commit; PATCH schema strict, repo update only touches name/current price.
  implication: no live 13.1 code regression; new data stays consistent. Bug is legacy data + missing invariant check.

## Resolution

root_cause: Legacy Phase 13 CR-01 lost-update. On 2026-10-27 09:46-09:47 (Phase 13 UAT test 6) the Edit sheet fired POST /adjust (buy +0.1, +1.5) concurrently with a full-row PATCH that wrote back the stale quantity 0.5 / buy price $1,000. The buy entries stayed live; the holding row did not move. Migration 0088 snapshotted and merged this row as-is (no Σ-entries reconciliation; D-35 only backfills entry-less holdings), so the 13.1 ledger now lists entries summing 2.1 / $128,082.40 while the asset row says 0.5 / $500. The 13.1 transfer then booked at that stale $1,000 avg, and the test-12 delete undid it correctly back to 0.5.
fix:
verification:
files_changed: []
