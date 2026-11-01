/**
 * use-asset-writes-offline.test.tsx — Phase 13.1 investment writes.
 *
 * Every write goes through clientApiWrite: offline means the honest refusal
 * toast and nothing queued (project_offline_architecture). Server refusals map
 * to i18n keys, and a write that moved a wallet balance refreshes the wallet
 * family of caches (D-21, D-37).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineWriteError } from "../../src/lib/offline-write";
import { useBuyAsset } from "../../src/hooks/use-buy-asset";
import { useSellHolding } from "../../src/hooks/use-sell-holding";
import { useTransferAsset } from "../../src/hooks/use-transfer-asset";
import { useUpdateHolding } from "../../src/hooks/use-update-holding";
import { useDeleteEntry } from "../../src/hooks/use-delete-entry";

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/offline-write")
  >("../../src/lib/offline-write");
  return { ...actual, clientApiWrite: (...a: unknown[]) => mockWrite(...a) };
});

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
const offlineToast = vi.fn();
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => offlineToast,
}));

const B = "budget-1";
let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const writes = {
  useBuyAsset: () => {
    const { result } = renderHook(() => useBuyAsset(B), { wrapper });
    result.current.mutate({
      holdingId: "h1",
      body: {
        kind: "amount",
        amountCents: "100",
        currency: "PLN",
        effectiveDate: "2026-10-01",
      },
    });
    return result;
  },
  useSellHolding: () => {
    const { result } = renderHook(() => useSellHolding(B), { wrapper });
    result.current.mutate({
      holdingId: "h1",
      body: {
        effectiveDate: "2026-10-01",
        left: { quantity: "0" },
        destination: { kind: "out", wallet: { kind: "nowhere" } },
        receivedCents: "100",
        receivedCurrency: "PLN",
      },
    });
    return result;
  },
  useTransferAsset: () => {
    const { result } = renderHook(() => useTransferAsset(B), { wrapper });
    result.current.mutate({
      holdingId: "h1",
      body: {
        effectiveDate: "2026-10-01",
        move: { quantity: "1" },
        to: { kind: "new", name: "Cold" },
      },
    });
    return result;
  },
  useUpdateHolding: () => {
    const { result } = renderHook(() => useUpdateHolding(B), { wrapper });
    result.current.mutate({ holdingId: "h1", name: "BTC" });
    return result;
  },
  useDeleteEntry: () => {
    const { result } = renderHook(() => useDeleteEntry(B), { wrapper });
    result.current.mutate({ entryId: "e1" });
    return result;
  },
};

describe("Investment asset writes", () => {
  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockWrite.mockReset();
    toastError.mockReset();
    offlineToast.mockReset();
  });

  for (const [name, run] of Object.entries(writes)) {
    it(`${name} offline shows the refusal toast and is tried once`, async () => {
      mockWrite.mockRejectedValue(new OfflineWriteError());
      const result = run();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(offlineToast).toHaveBeenCalledTimes(1);
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });
  }

  it("deleting a no-longer-newest entry says the asset changed", async () => {
    mockWrite.mockResolvedValue(json(409, { error: "not_newest" }));
    const result = writes.useDeleteEntry();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).toHaveBeenCalledWith("swap.err.staleEntry");
  });

  // Round-5: no uniqueness code exists; any 422 on edit is a plain failure.
  it("an unknown 422 on edit never says the name is taken", async () => {
    mockWrite.mockResolvedValue(json(422, { error: "label_taken" }));
    const result = writes.useUpdateHolding();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastError).not.toHaveBeenCalledWith("asset.name.taken");
  });

  it("edit sends only the editable keys (CR-01)", async () => {
    mockWrite.mockResolvedValue(json(200, { id: "h1" }));
    const { result } = renderHook(() => useUpdateHolding(B), { wrapper });
    result.current.mutate({
      holdingId: "h1",
      name: "BTC",
      displayCurrency: "USD",
      currentValueCents: "100",
      currentPriceCents: "5",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const body = JSON.parse(mockWrite.mock.calls[0]![1].body as string);
    expect(Object.keys(body).sort()).toEqual([
      "currentPriceCents",
      "currentValueCents",
      "displayCurrency",
      "name",
    ]);
  });

  it("a sale into a wallet refreshes wallets, reserves, tasks, cushion and projection", async () => {
    mockWrite.mockResolvedValue(
      json(201, { transferId: null, newHoldingId: null, walletId: "w1" }),
    );
    const spy = vi.spyOn(qc, "invalidateQueries");
    const result = writes.useSellHolding();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    for (const k of [
      ["budget", B, "wallets"],
      ["budget", B, "reserves"],
      ["tasks", B, "pending"],
      ["cushion-summary", B],
      ["budget", B, "projection"],
      ["budget", B, "investments"],
      ["budget", B, "overview"],
    ])
      expect(keys).toContain(JSON.stringify(k));
  });

  it("a sale that went nowhere leaves the wallet caches alone", async () => {
    mockWrite.mockResolvedValue(
      json(201, { transferId: null, newHoldingId: null, walletId: null }),
    );
    const spy = vi.spyOn(qc, "invalidateQueries");
    const result = writes.useSellHolding();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).not.toContain(JSON.stringify(["budget", B, "wallets"]));
    expect(keys).toContain(JSON.stringify(["budget", B, "investments"]));
  });
});
