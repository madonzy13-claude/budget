# Phase 15: MCP server: manage budgets via AI agents and assistants - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
**Areas discussed:** Consent & scopes, Write safety & undo, Import rules, Family visibility, What assistant can read, Abuse limits

---

## Consent & scopes

| Question                 | Options                                                                  | Selected            |
| ------------------------ | ------------------------------------------------------------------------ | ------------------- |
| Grant granularity        | Per budget checkboxes (rec) / All my budgets / One budget per connection | All my budgets      |
| Write scopes             | read + write (rec) / per domain / read-write-import                      | read + write        |
| budget_create new budget | Auto-added (rec) / re-consent / drop tool                                | Auto-added          |
| Lifetime                 | Until revoked (rec) / 90d idle / fixed 30d                               | Until revoked       |
| Clients                  | Any via DCR (rec) / allowlist / + personal token                         | Any via DCR         |
| Future budgets visible   | Yes (rec) / snapshot                                                     | Yes                 |
| Role limits              | Agent = user's role (rec) / read-only on shared                          | Agent = user's role |

## Write safety & undo

First round used jargon; user asked for plain English ("what do you mean by that? use plain english without jargon"). Re-asked with examples.

| Question    | Options                                                               | Selected                                                      |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Saving      | Right away (rec) / wait for OK in app / small right away big waits    | Right away — **"shouldn't be any info that added by claude"** |
| Deleting    | Same as app (rec) / assistant can't delete                            | Same as app                                                   |
| Undo place  | Connected apps history + Undo (rec) / no button, ask assistant / both | No button — ask assistant                                     |
| Wallet sync | Set like app (rec) / propose spending for gap                         | Set like app                                                  |
| Old months  | Yes same as app (rec) / add only / current month only                 | Yes                                                           |
| Batch cap   | 500 (rec) / 100 / 2000                                                | 500                                                           |

## Import rules

| Question             | Options                                                    | Selected                                  |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Preview summary + go | Yes (rec) / just save                                      | Just save                                 |
| Duplicates           | Skip+tell (rec) / add anyway / ask per duplicate           | Ask per duplicate                         |
| Unknown categories   | Propose mapping + confirm (rec) / auto-create / Other      | Propose mapping                           |
| Foreign currency     | Keep + day rate (rec) / ask rate                           | Keep + day rate                           |
| Mixed batch          | Save clean, ask rest (rec) / ask first then save all       | Ask first, then save all                  |
| Many dupes           | List, answer once (rec) / one by one                       | List, answer once                         |
| Import what          | spendings+incomes / limits / investments / wallet balances | All four + scheduled payments (free text) |

**Notes:** "Just save it" + "ask per duplicate" reconciled → check first, ask only on problems, then save all at once.

## Family visibility

| Question      | Options                                               | Selected   |
| ------------- | ----------------------------------------------------- | ---------- |
| Tell partner  | No, private (rec) / show in members                   | No         |
| Partner data  | Everything I see (rec) / totals only                  | Everything |
| Settings page | Name/date/last used/Disconnect (rec) / + scope switch | Minimal    |

## What assistant can read

| Question | Options                                                   | Selected          |
| -------- | --------------------------------------------------------- | ----------------- |
| Detail   | Both, all history (rec) / 12 months entries / totals only | Both, all history |
| Insights | All (rec) / tasks only                                    | All               |

## Abuse limits

| Question  | Options                                 | Selected                |
| --------- | --------------------------------------- | ----------------------- |
| Rate      | 60/20 per min (rec) / 20/5 / you decide | 60 reads, 20 writes/min |
| Daily cap | 5000/day (rec) / none / you decide      | 5000/day                |

## Claude's Discretion

- Undo tool shape and reach; behaviour vs hand-edited rows
- import_preview TTL, dupe tolerance
- Rate-limit storage
- OAuth implementation path
- Prompt contents

## Deferred Ideas

- Personal API tokens
- Per-budget consent / per-domain scopes
- Activity history + undo in Connected apps
