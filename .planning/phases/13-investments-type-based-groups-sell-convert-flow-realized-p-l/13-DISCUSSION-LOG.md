# Phase 13: Investments: type-based groups, sell/convert flow, realized P/L - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-25
**Phase:** 13-investments-type-based-groups-sell-convert-flow-realized-p-l
**Areas discussed:** Withdraw flow, History & backfill, Type group display, Currency on sell

---

## Withdraw flow

| Option              | Description                            | Selected |
| ------------------- | -------------------------------------- | -------- |
| Destination in Sell | Third "Out of investments" destination | ✓        |
| Own swipe icon      | Separate Withdraw action               |          |

| Option                          | Description                                                 | Selected |
| ------------------------------- | ----------------------------------------------------------- | -------- |
| Realized, then withdrawn        | realized = received − cost of part; contributions −received | ✓        |
| Contributions drop by cost only | no realized gain                                            |          |

| Option                          | Description                                             | Selected |
| ------------------------------- | ------------------------------------------------------- | -------- |
| Same as Sell → Out              | proportional cost drop, realized, contributions −amount | ✓        |
| Only contributions + cost       | no realized                                             |          |
| Drop "Withdrew money" from Edit |                                                         |          |

**Notes:** First phrasing was unclear to the user; re-asked with the 96k → 80k broker example.

| Option               | Description                   | Selected |
| -------------------- | ----------------------------- | -------- |
| No wallet link       | money just leaves investments | ✓        |
| Optional wallet pick |                               |          |

---

## History & backfill

| Question                  | Options                                       | Selected                                     |
| ------------------------- | --------------------------------------------- | -------------------------------------------- |
| Where history shows       | Edit-sheet list / own sheet / no UI           | Edit-sheet list                              |
| Dating & editing          | Date picker + delete / full edit / today only | Date picker + delete                         |
| Hand-over of real history | In-app / script import / both                 | In-app                                       |
| Past Overview points      | Hybrid / recompute all / only new             | Hybrid (re-asked with a plainer explanation) |
| Start entry lifecycle     | Delete by hand / auto-replaced                | Delete by hand                               |
| Start entry date          | Holding created date / release day            | Holding created date                         |

---

## Type group display

| Question                 | Options                                                    | Selected                                                                                        |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Granularity              | One per form type / merge bonds / broad families           | Free text: "merge equity and etf as stocks, then one group per form type"                       |
| Stocks search            | One combined search / sub-kind toggle                      | One combined search                                                                             |
| REIT                     | —                                                          | User noted REIT is not in the picker; confirmed (legacy only), mapped reit → stocks             |
| Group order              | Drag groups / by value / fixed                             | Drag groups                                                                                     |
| Single-holding type      | Always header / header for 2+                              | Always header                                                                                   |
| Empty type with realized | Hidden, counts in total / dimmed header                    | Hidden                                                                                          |
| Header content           | Value · total P/L + realized sub-line / chips / total only | Value · total P/L + realized sub-line                                                           |
| Header %                 | ÷ all cost ever / unrealized only / ÷ held cost            | ÷ all cost ever (+53% example); re-asked twice: user asked whether it meant group or single row |

---

## Currency on sell

| Question                 | Options                                          | Selected                    |
| ------------------------ | ------------------------------------------------ | --------------------------- |
| Amount received currency | Destination / source / both                      | Destination                 |
| Realized storage         | Budget ccy frozen at sale / source re-converted  | Budget ccy frozen           |
| Cost-side FX             | You decide / buy-date rate                       | You decide                  |
| Contributions storage    | Budget ccy at entry / original converted on read | Original, converted on read |
| Rate for past points     | Each point's date / today's                      | Each point's date           |

## Claude's Discretion

- Cost-side FX rate for the sold part's cost basis.
- History schema, entry kinds, conversion pairing, migration numbering.

## Deferred Ideas

- Withdraw into a budget wallet.
- Not discussed: Delete with history, sell into a different-type existing holding, Change-type UX, Overview realized display.
