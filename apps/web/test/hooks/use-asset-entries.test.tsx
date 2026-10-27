/**
 * use-asset-entries.test.tsx — L3 ledger is fetched lazily on first open
 * (UI-SPEC) under the investments prefix, so every write refreshes it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssetEntries, entriesKey } from "../../src/hooks/use-asset-entries";
import { useAssetNames } from "../../src/hooks/use-asset-names";

const mockFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...a: unknown[]) => mockFetch(...a),
}));

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("Asset entries query", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockFetch.mockReset();
    mockFetch.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/names")
              ? { names: [{ id: "a", name: "BTC" }] }
              : { entries: [{ id: "e1" }] },
          ),
          { status: 200 },
        ),
    );
  });

  it("does not fetch until the asset is opened", async () => {
    renderHook(() => useAssetEntries("b1", "h1", false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches the asset's ledger under the investments prefix once open", async () => {
    const { result } = renderHook(() => useAssetEntries("b1", "h1", true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "e1" }]));
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "/budgets/b1/investments/h1/entries",
    );
    expect(entriesKey("b1", "h1").slice(0, 3)).toEqual([
      "budget",
      "b1",
      "investments",
    ]);
    expect(qc.getQueryData(entriesKey("b1", "h1"))).toEqual([{ id: "e1" }]);
  });

  it("autocomplete names load per type, only when a type is chosen", async () => {
    renderHook(() => useAssetNames("b1", null), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
    const { result } = renderHook(() => useAssetNames("b1", "crypto"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.data).toEqual([{ id: "a", name: "BTC" }]),
    );
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "/budgets/b1/investments/names?type=crypto",
    );
  });
});
