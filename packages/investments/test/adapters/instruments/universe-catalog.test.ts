/**
 * universe-catalog.test.ts — classification + assembly for the 9.2 global universe.
 * Pure (no DB / no network): the HTTP layer is exercised via an injected fake fetch.
 */
import { describe, it, expect } from "bun:test";
import {
  classifyTdRow,
  classifyCryptoRow,
  cryptoRank,
  buildUniverse,
  dedupeUniverse,
  METALS_UNIVERSE,
  type TdCatalogRow,
} from "../../../src/adapters/instruments/universe-catalog";
import type { InstrumentUpsert } from "../../../src/ports/instrument-repo";

describe("classifyTdRow (stocks/ETF → provider + rank)", () => {
  const us: TdCatalogRow = {
    symbol: "AAPL",
    name: "Apple Inc",
    currency: "USD",
    mic_code: "XNAS",
    country: "United States",
    type: "Common Stock",
  };
  const gpw: TdCatalogRow = {
    symbol: "CDR",
    name: "CD Projekt SA",
    currency: "PLN",
    mic_code: "XWAR",
    country: "Poland",
    type: "Common Stock",
  };

  it("US equities → Finnhub (auto), USD, top rank", () => {
    const r = classifyTdRow(us, "equities")!;
    expect(r.provider).toBe("finnhub");
    expect(r.assetClass).toBe("equities");
    expect(r.quoteCurrency).toBe("USD");
    expect(r.rank).toBe(100);
  });

  it("non-US equities are DROPPED (null) — we have no live quote for them", () => {
    // Warsaw (GPW), by country and by MIC-only, both drop.
    expect(classifyTdRow(gpw, "equities")).toBeNull();
    expect(
      classifyTdRow(
        { symbol: "CDR", name: "Cardero", mic_code: "XTSE", country: "Canada" },
        "equities",
      ),
    ).toBeNull();
  });

  it("a non-US ETF (e.g. London) is DROPPED — the /etf bulk call is global", () => {
    expect(
      classifyTdRow(
        {
          symbol: "VUSA",
          name: "Vanguard S&P 500",
          currency: "GBP",
          mic_code: "XLON",
          country: "United Kingdom",
        },
        "etf",
      ),
    ).toBeNull();
  });

  it("a US-MIC row with no country is KEPT (isUsListed by exchange rank)", () => {
    const r = classifyTdRow(
      { symbol: "MSFT", name: "Microsoft", mic_code: "XNAS" },
      "equities",
    )!;
    expect(r.provider).toBe("finnhub");
  });

  it("rows missing a symbol or name are dropped", () => {
    expect(classifyTdRow({ symbol: "", name: "x" }, "equities")).toBeNull();
    expect(classifyTdRow({ symbol: "x", name: "" }, "equities")).toBeNull();
  });
});

describe("crypto ranking + classification", () => {
  it("cryptoRank bands by market cap", () => {
    expect(cryptoRank(1)).toBe(95);
    expect(cryptoRank(100)).toBe(82);
    expect(cryptoRank(500)).toBe(70);
    expect(cryptoRank(5000)).toBe(60);
    expect(cryptoRank(null)).toBe(60);
  });

  it("classifyCryptoRow uses the coin id as symbol and carries the ticker in the name", () => {
    const r = classifyCryptoRow({
      id: "bitcoin",
      symbol: "btc",
      name: "Bitcoin",
      market_cap_rank: 1,
    })!;
    expect(r.symbol).toBe("bitcoin");
    expect(r.displayName).toBe("Bitcoin (BTC)");
    expect(r.provider).toBe("coingecko");
    expect(r.assetClass).toBe("crypto");
    expect(r.rank).toBe(95);
  });
});

describe("dedupeUniverse (no duplicate (symbol, provider) for the bulk upsert)", () => {
  it("collapses a repeated (symbol, provider), keeping the highest rank", () => {
    const list: InstrumentUpsert[] = [
      {
        symbol: "AAPL",
        displayName: "Apple",
        provider: "finnhub",
        assetClass: "equities",
        rank: 80,
      },
      {
        symbol: "AAPL",
        displayName: "Apple",
        provider: "finnhub",
        assetClass: "equities",
        rank: 100,
      },
      {
        symbol: "CDR",
        displayName: "CD Projekt",
        provider: "manual:XWAR",
        assetClass: "equities",
        rank: 70,
      },
      {
        symbol: "CDR",
        displayName: "Cardero",
        provider: "manual:XTSE",
        assetClass: "equities",
        rank: 78,
      },
    ];
    const out = dedupeUniverse(list);
    expect(out).toHaveLength(3); // AAPL collapsed; the two CDRs differ by provider
    expect(out.find((i) => i.symbol === "AAPL")!.rank).toBe(100);
  });
});

describe("buildUniverse (assembly + resilience)", () => {
  const fakeFetch = ((url: string) => {
    const u = String(url);
    if (u.includes("/stocks")) {
      // Per-country requests now: return each country's row, empty for the rest.
      if (u.includes("country=United%20States")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  symbol: "AAPL",
                  name: "Apple Inc",
                  currency: "USD",
                  mic_code: "XNAS",
                  country: "United States",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (u.includes("country=Poland")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  symbol: "CDR",
                  name: "CD Projekt",
                  currency: "PLN",
                  mic_code: "XWAR",
                  country: "Poland",
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    }
    if (u.includes("/etf")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                symbol: "VOO",
                name: "Vanguard S&P 500 ETF",
                currency: "USD",
                mic_code: "ARCX",
                country: "United States",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    }
    if (u.includes("/coins/markets")) {
      // First page returns one coin; later pages empty → loop stops.
      if (u.includes("page=1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "bitcoin",
                symbol: "btc",
                name: "Bitcoin",
                market_cap_rank: 1,
              },
            ]),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    return Promise.resolve(new Response("[]", { status: 200 }));
  }) as unknown as typeof fetch;

  it("combines metals + US stocks + US ETF + crypto; drops non-US", async () => {
    const u = await buildUniverse({
      twelveDataKey: "k",
      fetchFn: fakeFetch,
      cryptoPages: 4,
      retryDelayMs: 0,
    });
    const bySym = Object.fromEntries(u.map((i) => [i.symbol, i]));
    expect(bySym["AAPL"].provider).toBe("finnhub");
    expect(bySym["VOO"].provider).toBe("finnhub");
    expect(bySym["bitcoin"].provider).toBe("coingecko");
    // Poland is no longer fetched (UNIVERSE_COUNTRIES = US only) AND non-US rows are
    // dropped in classify → CD Projekt (Warsaw) is absent, never a manual row.
    expect(bySym["CDR"]).toBeUndefined();
    // Metals always present (auto-priced via gold-api.com — free + keyless).
    expect(bySym["XAU/USD"].provider).toBe("gold_api");
    // Palladium (260626) is seeded alongside gold/silver/platinum.
    expect(bySym["XPD/USD"].provider).toBe("gold_api");
    // US equity (AAPL) + US ETF (VOO) + bitcoin — CDR dropped.
    expect(u.length).toBe(METALS_UNIVERSE.length + 2 + 1);
  });

  it("a failing sub-feed is skipped, not fatal (metals + crypto still returned)", async () => {
    const throwingTd = ((url: string) => {
      if (String(url).includes("/stocks") || String(url).includes("/etf")) {
        return Promise.resolve(new Response("err", { status: 500 }));
      }
      return fakeFetch(url as never);
    }) as unknown as typeof fetch;
    const u = await buildUniverse({
      twelveDataKey: "k",
      fetchFn: throwingTd,
      retryDelayMs: 0,
    });
    expect(u.find((i) => i.symbol === "XAU/USD")).toBeTruthy();
    expect(u.find((i) => i.symbol === "bitcoin")).toBeTruthy();
    expect(u.find((i) => i.symbol === "AAPL")).toBeUndefined();
  });
});
