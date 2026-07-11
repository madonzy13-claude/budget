-- r36: budgets.overview_enabled — feature flag to hide the Overview page.
--
-- WHY: some households don't want the Overview dashboard (net-worth hero, cards,
-- charts) and prefer to land straight on their wallets/spendings. A per-budget
-- boolean, default TRUE (Overview shown), toggled from Settings → General. When
-- false the Overview pill is hidden and a direct /overview URL falls back to the
-- wallets tab. Mirrors reserves_enabled (plain boolean, owner-gated PATCH).
--
-- Idempotent, applied directly (make migrate is separately blocked — see 0051).

ALTER TABLE tenancy.budgets
  ADD COLUMN IF NOT EXISTS overview_enabled boolean NOT NULL DEFAULT true;
