import { describe, test, expect } from "bun:test";
import {
  makeContributionsReader,
  type FlowEntry,
} from "../../src/domain/contributions";

const pln = (effectiveDate: string, flowCents: bigint): FlowEntry => ({
  effectiveDate,
  flowCents,
  flowCurrency: "PLN",
});

function fakeRates(table: Record<string, string>) {
  const calls = { n: 0 };
  const rateFor = async (from: string, _to: string, date: string) => {
    calls.n++;
    const r = table[`${from}|${date}`];
    if (!r) throw new Error("NoFxRateAvailable");
    return r;
  };
  return { rateFor, calls };
}

describe("Contributions from history (D-19)", () => {
  test("conversion legs leave contributions unchanged", async () => {
    const { rateFor } = fakeRates({});
    const r = makeContributionsReader(
      [
        pln("2024-01-10", 5_500_000n),
        pln("2026-10-24", 0n),
        pln("2026-10-24", 0n),
      ],
      "PLN",
      rateFor,
    );
    expect(r.firstDate).toBe("2024-01-10");
    expect(await r.at("2024-01-09")).toBe(0n);
    expect(await r.at("2026-10-23")).toBe(5_500_000n);
    expect(await r.at("2026-10-25")).toBe(5_500_000n);
  });

  test("a withdrawal lowers contributions by the amount", async () => {
    const { rateFor } = fakeRates({});
    const r = makeContributionsReader(
      [
        pln("2024-01-10", 5_500_000n),
        pln("2026-10-24", 0n),
        pln("2026-10-25", -1_600_000n),
      ],
      "PLN",
      rateFor,
    );
    expect(await r.at("2026-10-25")).toBe(3_900_000n);
  });

  test("foreign flows convert at each point's own date", async () => {
    const { rateFor, calls } = fakeRates({
      "EUR|2025-06-01": "4.30",
      "EUR|2026-01-01": "4.50",
    });
    const r = makeContributionsReader(
      [{ effectiveDate: "2025-01-01", flowCents: 100_000n, flowCurrency: "EUR" }],
      "PLN",
      rateFor,
    );
    expect(await r.at("2025-06-01")).toBe(430_000n);
    expect(await r.at("2026-01-01")).toBe(450_000n);
    await r.at("2026-01-01");
    await r.at("2026-01-01");
    expect(calls.n).toBe(2);
  });

  test("rate looked up once per currency and date", async () => {
    const { rateFor, calls } = fakeRates({ "EUR|2025-06-01": "4.30" });
    const r = makeContributionsReader(
      [{ effectiveDate: "2025-01-01", flowCents: 100_000n, flowCurrency: "EUR" }],
      "PLN",
      rateFor,
    );
    await r.at("2025-06-01");
    await r.at("2025-06-01");
    await r.at("2025-06-01");
    expect(calls.n).toBe(1);
  });

  test("no entries: no boundary, zero contributions", async () => {
    const { rateFor } = fakeRates({});
    const r = makeContributionsReader([], "PLN", rateFor);
    expect(r.firstDate).toBeNull();
    expect(await r.at("2026-01-01")).toBe(0n);
  });

  test("missing historic rate resolves null instead of failing", async () => {
    const { rateFor } = fakeRates({});
    const r = makeContributionsReader(
      [{ effectiveDate: "2024-01-01", flowCents: 100_000n, flowCurrency: "EUR" }],
      "PLN",
      rateFor,
    );
    expect(await r.at("2024-02-01")).toBeNull();
  });

  test("a single-currency reader never asks for rates", async () => {
    const { rateFor, calls } = fakeRates({});
    const r = makeContributionsReader(
      [pln("2024-01-10", 5_500_000n)],
      "PLN",
      rateFor,
    );
    await r.at("2025-01-01");
    expect(calls.n).toBe(0);
  });
});
