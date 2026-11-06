---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 16
status: complete
---

# 15-16 Summary: import

**import_preview** (writeTool, entryCount 0, saves only `mcp_import_previews`):
- Rows of one kind: transactions, category_limits, investment_entries, wallet_balances or scheduled_payments. Each kind has its own row schema; investment and scheduled-payment rows reuse the write tools' schemas (`investmentTxnRow` and `scheduledPaymentRow`, now exported). Category references may be an id or a name, matched case-insensitively.
- At most 500 rows per call (`too_many_rows`).
- Every issue comes back in one answer:
  - `invalid_rows`: schema errors and bad amounts; also unknown assets, and unknown or archived wallets.
  - `unknown_categories`: grouped by name, with up to 3 suggestions (substring match or edit distance ≤ 2).
  - `duplicates`: transactions match on date + category + amount + currency, against the budget and earlier rows in the same import. Scheduled payments match on category, amount, currency, note and first due date.
  - `fx_gaps`: one `/fx/rate` call per (currency, category currency, date).
  - `older_than_latest_entry`: investment rows dated before the asset's latest entry.
  - `history_not_stored`: older wallet balances. Informational only; `clean` ignores it.
- Investment rows are stored sorted by date, so commit writes oldest first and rollback deletes newest first. The answer's `order` lists the stored rows' original indexes.
- Category names in the answer come back as `untrusted_user_text`: they come from the imported file (T-15-63).

**import_commit** (writeTool, destructiveHint):
- **Checks before writing:**
  - The preview is bound to the user and the connection, with a 1h TTL. Otherwise it answers `preview_expired`.
  - Kinds not in `KIND_COMMIT` answer `kind_not_supported`.
  - Any blocking issue without a resolution answers `unresolved_issues` with `missing` (e.g. `category_map:Pets`).
  - A `category_map` id that is not a category of this budget answers `invalid_category_map`.
- **Resolutions:**
  - duplicates: `skip_all`, `add_all` or `{add:[i]}`.
  - category_map: name → an existing category id, or `{create:{name}}`.
  - fx_gaps, older_than_latest_entry and invalid_rows: `skip_rows`.
- **Writing:**
  - The daily-cap preflight covers rows plus categories to create.
  - Categories are created first (key `preview:category:name`), then rows in stored order (key `preview:kind:i`).
  - Each effect is logged with the batch_id right after its dispatch, so a rollback sees it.
- **First failure:** `undoCallOrBatch(…, { mode: "rollback" })` runs and the preview is deleted. The answer is `import_rolled_back` with `{row_index, row_error, reverted, failed_inverses}`.
- **Success:** `{batch_id, created, skipped, categories_created}`, and the preview is deleted.

**import_undo**: `undoCallOrBatch(batch, { mode: "agent" })`. Rows the user changed since are skipped, and created categories are archived, not deleted.

**KIND_COMMIT** has the `transactions` entry. 15-20 adds the other four kinds.

**Tests:** `test/mcp/import.test.ts` has 23 tests, and the registry test now covers the 3 new tools. The full `test/mcp/` suite plus the restore test passes: 129/0. tsc and eslint are clean. The `parseFloat|Number(` and `csv|xlsx|pdf` greps return nothing.

**Deviations:**
- **Mid-batch failure trigger:**
  - The plan archived the row's category between preview and commit. But POST /transactions accepts an archived category, so no failure happened.
  - The test uses `2026-02-30` instead, which passes the preview's shape check and fails in the route. It is still data-driven, with no test flag.
  - **Found, not fixed:** that route answers **500** for an impossible date. Postgres raises "date/time field value out of range"; it should be a 422.
- **Renamed field:** the row error field is `row_error`, not `error`, because `error` is the tool's own code.
- **USD test:** it asserts the stored `fx_rate` and `fx_as_of`. Phase 14 re-expresses `amount_converted_cents` at read time, so that figure does not show the row date's rate.
- **Scheduled-payment amounts:** they are stored as numeric with 4 places ("55.0000"), so trailing zeros are trimmed before comparing.
- **Preview TTL expiry:** not re-tested here. It is covered by the repo (15-06). Commit's `preview_expired` path is tested through a used preview and through another connection.
