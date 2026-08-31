import { sql } from "drizzle-orm";

/**
 * Every (base, quote) the app will need in order to convert money.
 *
 *   - every (transaction currency → its budget's default) in the ledger, and
 *   - every (wallet currency → its budget's default) for live wallets.
 *
 * The wallet half matters on its own: a wallet holding a currency that has no
 * TRANSACTIONS in it still counts toward capitalization and net worth, and with
 * no rate on file those totals silently added it at 1:1. A ledger-only pair
 * list left that open for any account with a dormant foreign balance.
 *
 * Lives in its OWN module, importing nothing but drizzle, so the test can
 * execute it without pulling in the `@budget/platform` barrel — several worker
 * tests are already blocked by a module-resolution problem there, and a test
 * that cannot load is a test that cannot catch anything.
 *
 * It could not catch anything before, either: this query used to name
 * `currency_orig` and `currency_default`, neither of which exists on
 * expense_ledger. The error was swallowed at the call site, so the job reported
 * success having fetched no rates at all.
 */
export const FX_PAIRS_SQL = sql`
  SELECT DISTINCT base, quote FROM (
    SELECT l.currency_original AS base, b.default_currency AS quote
      FROM budgeting.expense_ledger l
      JOIN tenancy.budgets b ON b.id = l.tenant_id
     WHERE l.deleted_at IS NULL
    UNION
    SELECT w.currency AS base, b.default_currency AS quote
      FROM budgeting.wallets w
      JOIN tenancy.budgets b ON b.id = w.tenant_id
     WHERE w.archived_at IS NULL AND b.archived_at IS NULL
  ) p
  WHERE base IS NOT NULL AND quote IS NOT NULL AND base <> quote
`;
