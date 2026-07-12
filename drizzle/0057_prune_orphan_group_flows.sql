-- r36 fix: one-time prune of orphaned investment_group_flows.
--
-- Flow rows are keyed by (tenant_id, group_name). When a group lost its last
-- holding the rows lingered, so a same-name group recreated later inherited the
-- old realized P/L. The app now prunes a group's flows when it empties
-- (archive-holding / move-out); this cleans the rows that already leaked for
-- groups that currently have NO active holding.
--
-- NOTE: cannot clean a group that is ALREADY recreated + populated (its rows are
-- indistinguishable from new ones) — re-emptying that group now prunes it.

DELETE FROM budgeting.investment_group_flows f
 WHERE NOT EXISTS (
   SELECT 1 FROM budgeting.investments i
    WHERE i.budget_id = f.budget_id
      AND i.tenant_id = f.tenant_id
      AND i.group_name = f.group_name
      AND i.archived_at IS NULL
 );
