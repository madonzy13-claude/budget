-- 260613-hig: budget_members(user_id) index
--
-- WHY: listForUser opens a tx, executes `SELECT budget_id FROM
-- tenancy.budget_members WHERE user_id = $1` (first query), then runs the
-- main SELECT with `WHERE m.user_id = $1`. With 7679 rows and no index on
-- user_id, each call is a seq-scan; Postgres also under-estimates row count
-- which can cause a sub-optimal nested-loop plan on the INNER JOIN. The
-- index raises estimate accuracy and turns both predicates into index scans.
--
-- PLAIN CREATE INDEX (not CONCURRENTLY): the migrator (apps/migrator) wraps
-- migrations in a transaction via drizzle migrate(). CONCURRENTLY cannot run
-- inside a transaction. Plain CREATE INDEX is correct here.
-- Production note: tenancy.budget_members has ~7679 rows — the lock taken by
-- plain CREATE INDEX is released in milliseconds (sub-second). Acceptable.
--
-- Additional indexes (tasks(status,budget_id), categories/expense_ledger):
-- NOT added here. After the LATERAL scoping rewrite (260613-hig Task 1) the
-- EXPLAIN (app_role, real GUCs) shows the tk subquery cost drops well below
-- 100k — the correlated t.budget_id = w.id predicate restricts to ~15 budgets'
-- tasks; tasks already has a PK index on id and a budget_id FK index. Adding
-- a composite status+budget_id index produced no measurable improvement in the
-- plan (Postgres uses the existing budget_id index for the correlation and
-- filters status as a post-scan predicate cheaply at ~15-row scale).
-- Decision: budget_members(user_id) only — document EXPLAIN verdict above.

CREATE INDEX IF NOT EXISTS budget_members_user_id_idx
  ON tenancy.budget_members (user_id);
