-- 0076 — purge un-priceable equities/ETFs and forbid their return (260806).
--
-- We can only fetch a live quote for a US listing (Finnhub), so `classifyTdRow`
-- now DROPS every non-US stock/ETF. An older ingest stored the global list as
-- `manual:<MIC>`, and 194,654 of those rows outlived the rule — 86% of the
-- equity/ETF catalog, none of it priceable.
--
-- They are not inert. `instruments` is keyed by symbol, so Warsaw's `UBER`
-- occupies the ticker NASDAQ's `UBER` needs, and since the ingest drops non-US
-- rows it can never overwrite the squatter: the US listing never lands. Search
-- (correctly) hides `manual:*`, so "Uber" returns UBERDOC and Kuber Resources
-- and the user cannot add the stock at all.
--
-- SAFETY: no explicit holding check here on purpose. `investments` has FORCE RLS,
-- so a guard query JOINing it would read zero rows as the migrator whatever the
-- truth — the same silent-empty that cost 82 rows in 0072. The FK does the job
-- properly instead: investments_instrument_id_fkey is NO ACTION, so if any
-- investment references one of these instruments this DELETE raises and the whole
-- migration aborts. Fails closed, and RLS cannot lie to it.
-- (instrument_price_cache / instrument_price_snapshots are ON DELETE CASCADE —
-- derived data, refetched on demand.)

DELETE FROM budgeting.instruments
 WHERE asset_class IN ('equities', 'etf')
   AND provider LIKE 'manual%';

-- The durable half. Purging alone leaves the door open: a future edit to
-- classifyTdRow could refill the table and nobody would notice until someone
-- couldn't add a stock. Scoped to equities/ETF only — other asset classes may
-- legitimately be manual, and a blanket ban would take them out too.
ALTER TABLE budgeting.instruments
  ADD CONSTRAINT instruments_no_manual_equities
  CHECK (
    asset_class NOT IN ('equities', 'etf')
    OR provider NOT LIKE 'manual%'
  );
