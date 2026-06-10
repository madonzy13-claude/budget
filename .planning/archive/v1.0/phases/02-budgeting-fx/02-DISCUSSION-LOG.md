# Phase 2: Budgeting & FX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 2-Budgeting & FX
**Areas discussed:** Edits & corrections UX (incl. recurring + splits), Contribution shares (BDGT-08 + EXPN-13), FX freshness signaling, Month boundary semantics

---

## Edits & Corrections UX

### Q1 — When you edit a past transaction, what should the UI show?

User initially asked for clarification on what a "transaction" means and why history is kept. After explaining the architectural lock (Phase 1 made `expense_ledger` append-only at DB level via `REVOKE UPDATE, DELETE`) and that the question was UI-only, options were re-presented in plain language.

| Option                                | Description                                                                                                           | Selected |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Hide the trail. Just show latest.     | Transaction list shows only current version. No 'edited' marks, no history button. Trail is database-only.            |          |
| Tiny 'edited' marker, no detail       | Latest version + small italicized 'edited' next to date or amount. No detail panel.                                   |          |
| Show 'edited' + full history on click | Latest version + small 'edited' badge. Click opens panel with full chain (original → corrections → latest, who/when). | ✓        |

**User's choice:** Show 'edited' + full history on click
**Notes:** User initially questioned why history exists at all; chose maximum-transparency option once clarified that DB keeps history regardless of UI.

### Q2 — How should a 'split' transaction look?

| Option                                        | Description                                                                             | Selected |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| One row in the list, expandable to show parts | Single list entry; click to expand and see breakdown. Linked rows share split_group_id. |          |
| Each split shown as its own row               | Two rows visible, both tagged 'part of split #abc'.                                     |          |
| One row, no breakdown visible in list         | List shows '$200 — multi-category'; parts visible only in transaction detail.           |          |

**User's choice:** None of the above — DROP the split feature entirely.
**Notes:** User: "That's responsibility of a customer to put transaction into proper category, we are not tracking receipts, we track expenses per category. Meaning of user spent 200$ in one transaction and bought food and clothes, that's decision of customer how he want to put it (in one or two categories)." → Drops EXPN-07 from v1 scope. Action item to update REQUIREMENTS.md and ROADMAP.md.

### Q3 — Recurring rule edit semantics

| Option                                                         | Description                                                                  | Selected |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Edit changes the rule going forward only                       | Future months use new value; past auto-generated months stay at old value.   |          |
| Edit changes the rule + retroactively fixes all past instances | Editing rewrites every past auto-generated transaction with new corrections. |          |
| Ask each time                                                  | System asks per edit: 'Apply to future only, or fix past instances too?'     |          |

**User's choice:** Custom — apply to current period only by default + a pre-checked checkbox "also apply to future occurrences". User can uncheck for current-only edits.
**Notes:** User also added a separate, important constraint: "if it's recurring transaction, do not put it into spending, but user must confirm that transaction really took place". This adds a PENDING/confirmation model to recurring transactions (EXPN-08 modification). Pending drafts are stored separately, do not count as spending until user confirms.

### Q4a — Actions on a pending recurring entry

| Option                                        | Description                                                                         | Selected |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Confirm / Edit-and-confirm / Skip-this-period | Three actions: finalize as-is, edit then finalize, or dismiss without ledger entry. | ✓        |
| Confirm or Skip only — no inline edit         | Two actions; edits would require post-confirm correction.                           |          |
| Confirm only — always exact match             | One action; differing amounts require canceling rule + manual log + recreate.       |          |

**User's choice:** Confirm / Edit-and-confirm / Skip-this-period

### Q4b — Stale pending recurring drafts

| Option                                | Description                                                                | Selected |
| ------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Stays pending forever until user acts | Draft sits in 'Pending recurring' inbox indefinitely; badge count visible. | ✓        |
| Auto-confirms after N days            | After e.g. 7 days past due, system finalizes as-is.                        |          |
| Auto-skips after N days               | After e.g. 14 days past due, draft dismissed.                              |          |

**User's choice:** Stays pending forever until user acts

---

## Contribution Shares (BDGT-08 + EXPN-13)

### Q1 — Per-category share override surface

| Option                                      | Description                                                                                                                   | Selected |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Inline on the category screen               | Editing a category shows 'Contribution shares' section; toggle 'override for this category'; override badge on category list. | ✓        |
| Separate 'Shares' tab on workspace settings | All shares (global + per-category) managed in one screen.                                                                     |          |
| Both — inline + a Shares tab                | Inline edit + master view tab.                                                                                                |          |

**User's choice:** Inline on the category screen

### Q2 — Sum-to-100 enforcement

| Option                                            | Description                                                            | Selected |
| ------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Block save until shares sum to 100% exactly       | Save button disabled with live counter; prevents downstream math bugs. | ✓        |
| Allow save, warn the user, auto-normalize on read | Save with warning; runtime scales values to 100%.                      |          |
| Allow save, leave shares broken until fixed       | No enforcement; downstream math refuses to compute.                    |          |

**User's choice:** Block save until shares sum to 100% exactly

### Q3 — Member join/leave behavior

| Option                                           | Description                                                                                                    | Selected |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| Block the workspace until owner re-distributes   | Share-dependent UI shows 'Shares need to be updated'; new transactions blocked until owner re-runs share form. | ✓        |
| Auto-redistribute proportionally                 | Remaining shares rescale to 100% automatically.                                                                |          |
| Prompt the owner with a suggested redistribution | Modal pops up with suggested new shares; owner accepts or edits.                                               |          |

**User's choice:** Block the workspace until owner re-distributes

### Q4 — Deposit FX-preview UX (EXPN-13)

| Option                                           | Description                                                                                   | Selected |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------- |
| Live preview, rate locked at preview             | Conversion shown as user types; locked rate stored on save. 'What you saw is what you saved.' | ✓        |
| Live preview, refetch on save                    | On save, system asks Frankfurter again; if drift > threshold, surface confirm modal.          |          |
| No live preview; show conversion only after save | Toast confirmation only.                                                                      |          |

**User's choice:** Live preview, rate locked at preview

---

## FX Freshness Signaling

### Q1 — Stale rate (Sunday transaction, only Friday's rate available)

| Option                                             | Description                                                                                   | Selected |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| Save silently, mark the row 'rate is stale'        | System uses Friday's rate, stores fx_rate_date = Friday, sets stale flag. UI shows info icon. |          |
| Show inline warning before save, user must confirm | 'Frankfurter has no rate for today. Latest is Friday's — use this rate?' confirm button.      |          |
| Block save until a fresh rate is available         | Form refuses to save until a fresh rate is available.                                         |          |

**User's choice:** Custom — "Just use rate from Friday and add info that this rate is from Friday." Matches option 1 in spirit but explicitly emphasizes user-visible info note.

### Q2 — Provider unavailable (network down, not just weekend)

| Option                                                      | Description                                                                 | Selected |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Use most-recent cached rate, mark row 'stale fallback'      | System uses cached rate; stores fx_rate_stale=true; same info badge on row. |          |
| Block save until provider recovers                          | Form refuses save until Frankfurter responds.                               |          |
| Save with a placeholder rate (e.g. 1.0), let user fix later | Stores rate=1 with 'needs_fx' flag; user reconciles later.                  |          |

**User's choice:** Custom — "Just silently use latest available rate. Always show a small info for example rate from 2h 15m." Matches option 1 with relative-time formatting on the badge ("2h 15m ago", "from Friday", "3 days old"). Distinct from Q1 in emphasizing always-visible relative-time signaling, not just a stale flag.

### Q3 — Fetch model

| Option                                     | Description                                                                       | Selected |
| ------------------------------------------ | --------------------------------------------------------------------------------- | -------- |
| Background daily fetch + on-demand top-up  | pg-boss daily job at 17:00 CET pulls all observed pairs; on-demand for new pairs. | ✓        |
| Pure on-demand                             | First save in a currency = live API call; cache locally.                          |          |
| Aggressive cache: prefetch ALL pairs daily | Daily job fetches every supported pair (~900 pairs).                              |          |

**User's choice:** Background daily fetch + on-demand top-up

### Q4 — Second live FX provider as fallback

| Option                                            | Description                                                               | Selected |
| ------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| No fallback in v1 — cached rates are the fallback | Phase 1 FxProvider port; cache is the fallback; future plug-in if needed. | ✓        |
| Add a second live provider as fallback in v1      | exchangerate-host or open.er-api.com auto-switches if Frankfurter fails.  |          |

**User's choice:** No fallback in v1 — cached rates are the fallback

---

## Month Boundary Semantics

### Q1 — Whose timezone defines a 'month'?

| Option                           | Description                                                                                  | Selected |
| -------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Workspace timezone               | Each workspace has stored TZ; all month boundaries use it; consistent for shared workspaces. | ✓        |
| User's local timezone (per-user) | Each user sees their own month boundaries; shared workspace gets weird.                      |          |
| UTC always                       | Simple but every user does mental math.                                                      |          |

**User's choice:** Workspace timezone

### Q2 — Mid-month limit edit

| Option                                                             | Description                                           | Selected           |
| ------------------------------------------------------------------ | ----------------------------------------------------- | ------------------ |
| New limit applies to the whole current month                       | Reports immediately reflect new limit; audit-tracked. | ✓ (extended in Q3) |
| New limit applies only from today forward; current period prorates | Daily prorating; complex display.                     |                    |
| New limit applies starting next month                              | Current month stays at old; next month uses new.      |                    |

**User's choice initially:** New limit applies to the whole current month. **Extended in Q3:** also applies to all future months until next change.

### Q3 — Budget templates (BDGT-07): edit propagation

| Option                                                | Description                                                                      | Selected |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Snapshot at apply                                     | Applying copies values; editing template later only affects future applications. |          |
| Live binding — edits propagate to all months          | Editing template auto-updates every month that referenced it.                    |          |
| Snapshot, with a 're-apply template' button per month | Snapshot like option 1, with explicit per-month re-apply UI.                     |          |

**User's response:** "Limits are applied from now to future, meaning you can not just increase One month limit. If you increase this month, then this month and all forward months will use new limit." This refined the entire limits model — limits become an effective-dated time series, NOT per-month snapshots.

### Q3-followup — Confirming the effective-dated limits model

| Option                                                                           | Description                                                                           | Selected |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| Yes — single current limit, effective from now to all future months              | Templates = bulk-set; reports always use current limit.                               |          |
| Almost — but past months should keep their historical limit value in reports too | Forward-rolling for current+future; past closed months retain their historical limit. | ✓        |
| Different model — let me explain                                                 | (Open-ended)                                                                          |          |

**User's choice:** Almost — past months keep historical limit value in reports.
**Notes:** This is the "effective-dated" model. Implementation: `category_limits (effective_from, effective_to)` time-series table; report for month M uses the row whose `[effective_from, effective_to]` covers `last_day_of_M` (for closed past months) or the latest row (for current and future).

### Q4 — Normal vs Cushion mode toggle

| Option                 | Description                                                                          | Selected |
| ---------------------- | ------------------------------------------------------------------------------------ | -------- |
| Workspace-level toggle | One switch in settings; all categories switch between normal/cushion limits at once. | ✓        |
| Per-category toggle    | Each category independently in normal or cushion mode.                               |          |
| Per-month toggle       | Calendar of months, each marked.                                                     |          |

**User's choice:** Workspace-level toggle

---

## Claude's Discretion

Areas not explicitly discussed; planner picks conservative defaults flagged in CONTEXT.md `<decisions>`:

- Account model & balance display — manual reconciliation cadence, asset-vs-liability grouping
- Transfer between accounts in different currencies — two linked ledger rows recommended
- Idempotency-Key middleware semantics — TTL, scope, body-hash matching (already largely fixed by ROADMAP success criterion 5)
- Search & filter UX — Postgres FTS + indexed equality filters; cursor pagination; no saved filters in v1
- Currency pick-list — closed allowlist (Frankfurter-supported fiat + crypto majors)
- Bulk re-categorize — multi-select + "Re-categorize to…" picker; one correction-row per item
- Projections shape — `spending_by_category_month` updated synchronously in same tx; hourly reconciliation cron + replay-from-ledger CLI
- Workspace timezone editability post-creation — leaning editable-no-retroactive-recalc

## Deferred Ideas

- **EXPN-07 (split transactions)** — dropped from v1 entirely per user; possibly v1.x
- **Second live FX provider** — port abstraction supports plug-in; revisit if Frankfurter availability is a real problem
- **Saved search filters** — out of v1
- **Per-month budget snapshot view** — derivable from `category_limits` history if needed
- **Per-category contribution audit trail UI** — data is logged; no dedicated UI surface in v1
- **Workspace timezone change with retroactive aggregate rebuild** — out of v1
- **Rate-drift confirmation modal threshold** — Claude's-discretion in plan; revisit on user feedback
