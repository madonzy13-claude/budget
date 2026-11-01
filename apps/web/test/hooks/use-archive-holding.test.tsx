/**
 * use-archive-holding.test.tsx — R6 (user): hiding an asset moves it from the
 * visible list to the hidden one IN ONE STEP, so totals (which count both)
 * never dip while the server answers; unhiding moves it back the same way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useArchiveHolding,
  useRestoreHolding,
} from "../../src/hooks/use-archive-holding";

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/offline-write")
  >("../../src/lib/offline-write");
  return { ...actual, clientApiWrite: (...a: unknown[]) => mockWrite(...a) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));

const B = "b1";
const VISIBLE = ["budget", B, "investments"];
const HIDDEN = ["budget", B, "investments", "hidden"];
const h = (id: string) => ({ id, name: id, valueInBudgetCents: "100" });
let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The server never answers in these tests — we look at the moment between.
  mockWrite.mockReset().mockReturnValue(new Promise(() => {}));
});

const ids = (key: string[]) =>
  (qc.getQueryData<{ id: string }[]>(key) ?? []).map((x) => x.id);

describe("hide / unhide move the asset between lists at once", () => {
  it("hiding puts it in the hidden list the moment it leaves the visible one", async () => {
    qc.setQueryData(VISIBLE, [h("A"), h("B")]);
    qc.setQueryData(HIDDEN, []);
    const { result } = renderHook(() => useArchiveHolding(B), { wrapper });
    act(() => result.current.mutate("A"));
    await waitFor(() => expect(ids(VISIBLE)).toEqual(["B"]));
    expect(ids(HIDDEN)).toEqual(["A"]);
  });

  it("unhiding puts it back in the visible list the moment it leaves the hidden one", async () => {
    qc.setQueryData(VISIBLE, [h("B")]);
    qc.setQueryData(HIDDEN, [h("A")]);
    const { result } = renderHook(() => useRestoreHolding(B), { wrapper });
    act(() => result.current.mutate("A"));
    await waitFor(() => expect(ids(HIDDEN)).toEqual([]));
    expect(ids(VISIBLE).sort()).toEqual(["A", "B"]);
  });
});
