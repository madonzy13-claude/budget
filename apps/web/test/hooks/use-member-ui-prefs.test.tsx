/**
 * use-member-ui-prefs.test.tsx — the Overview pickers' memory (260802).
 *
 * The choice used to live in localStorage, so the same person opening the budget
 * on their desktop was back to "All categories" (user report). It now rides the
 * member row: read once per budget, written as a MERGE so the timeline and the
 * pie never clear each other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

const { useMemberUiPrefs, memberUiPrefsQueryKey } =
  await import("@/hooks/use-member-ui-prefs");

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

const jsonOk = (body: unknown) => ({
  ok: true,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let client: QueryClient;
beforeEach(() => {
  fetchMock.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

describe("useMemberUiPrefs", () => {
  it("reads the member's stored picks for this budget", async () => {
    fetchMock.mockResolvedValue(
      jsonOk({ prefs: { "planned-categories": ["a"] } }),
    );
    const { result } = renderHook(() => useMemberUiPrefs("b1"), {
      wrapper: wrapper(client),
    });
    await waitFor(() =>
      expect(result.current.prefs).toEqual({
        "planned-categories": ["a"],
      }),
    );
    expect(fetchMock.mock.calls[0]![0]).toBe("/budgets/b1/ui-prefs");
  });

  it("reads an untouched member as no picks at all, not as a failure", async () => {
    fetchMock.mockResolvedValue(jsonOk({ prefs: {} }));
    const { result } = renderHook(() => useMemberUiPrefs("b1"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.prefs).toEqual({});
  });

  it("sends ONE key per save, so the other chart keeps its choice", async () => {
    fetchMock.mockResolvedValue(jsonOk({ prefs: {} }));
    const { result } = renderHook(() => useMemberUiPrefs("b1"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      jsonOk({ prefs: { "planned-categories": ["a"] } }),
    );
    await act(async () => {
      await result.current.save("planned-categories", ["a"]);
    });
    const [path, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(path).toBe("/budgets/b1/ui-prefs");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      prefs: { "planned-categories": ["a"] },
    });
  });

  it("shows the new pick immediately, before the server answers", async () => {
    fetchMock.mockResolvedValue(jsonOk({ prefs: {} }));
    const { result } = renderHook(() => useMemberUiPrefs("b1"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    // A picker that waits a round trip to redraw reads as a dropped click.
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    act(() => {
      void result.current.save("planned-categories", ["a"]);
    });
    await waitFor(() =>
      expect(result.current.prefs["planned-categories"]).toEqual(["a"]),
    );
    await act(async () => {
      release(jsonOk({ prefs: { "planned-categories": ["a"] } }));
    });
  });

  it("keys the cache per budget, so one budget's picks never show in another", () => {
    expect(memberUiPrefsQueryKey("b1")).not.toEqual(
      memberUiPrefsQueryKey("b2"),
    );
  });
});
