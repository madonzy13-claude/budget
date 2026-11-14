/**
 * use-overview-wealth.test.tsx — opening the Investments chart flashed another
 * chart first (user, 260802): keepPreviousData handed the investments view the
 * CAPITALIZATION series until its own fetch landed. A range change still keeps
 * the prior chart on screen (r27 item 1); a view change must not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useOverviewWealth,
  type WealthView,
} from "../../src/hooks/use-overview-wealth";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  backgroundApiFetch: (...a: unknown[]) => fetchMock(...a),
}));

const dto = (view: WealthView, label: string) => ({
  currency: "PLN",
  view,
  series: [{ label, value_cents: "100" }],
});
let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
});

const answer = (body: unknown) =>
  Promise.resolve({ ok: true, json: async () => body });

describe("useOverviewWealth placeholder", () => {
  it("does not show the capitalization series while investments loads", async () => {
    fetchMock.mockReturnValueOnce(answer(dto("capitalization", "cap")));
    const { result, rerender } = renderHook(
      ({ view }: { view: WealthView }) =>
        useOverviewWealth("b1", {
          from: "2024-01-01",
          to: "2024-12-31",
          view,
          enabled: true,
        }),
      { wrapper, initialProps: { view: "capitalization" } },
    );
    await waitFor(() =>
      expect(result.current.data?.view).toBe("capitalization"),
    );

    fetchMock.mockReturnValueOnce(new Promise(() => {})); // investments pending
    rerender({ view: "investments" });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });

  it("keeps the same view's chart on screen across a range change", async () => {
    fetchMock.mockReturnValueOnce(answer(dto("investments", "old")));
    const { result, rerender } = renderHook(
      ({ from }: { from: string }) =>
        useOverviewWealth("b1", {
          from,
          to: "2024-12-31",
          view: "investments",
          enabled: true,
        }),
      { wrapper, initialProps: { from: "2024-01-01" } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    rerender({ from: "2024-06-01" });
    expect(result.current.data?.series[0]?.label).toBe("old");
    expect(result.current.isPlaceholderData).toBe(true);
  });
});
