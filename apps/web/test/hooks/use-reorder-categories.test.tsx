import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useReorderCategories } from "../../src/hooks/use-reorder-categories";
import { TestQueryProvider } from "../setup/query-client";

const mockFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockFetch(...args),
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));

// The hook now pulls the shared honest-offline toast (useOfflineWriteToast →
// useTranslations("offline")); echo keys so it renders without a real provider.
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <TestQueryProvider>{children}</TestQueryProvider>;
}

describe("useReorderCategories", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockToastError.mockClear();
  });

  it("treats a 204 No Content response as success — does not error on the empty body", async () => {
    // PUT /categories/sort-order returns 204 with no body; calling res.json()
    // on it throws. The mutation must not treat that as a failure.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
      text: async () => "",
    });

    const { result } = renderHook(() => useReorderCategories("budget-1"), {
      wrapper,
    });
    result.current.mutate({ orderedIds: ["a", "b", "c"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("errors and toasts when the request fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "forbidden",
    });

    const { result } = renderHook(() => useReorderCategories("budget-1"), {
      wrapper,
    });
    result.current.mutate({ orderedIds: ["a", "b"] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToastError).toHaveBeenCalled();
  });
});
