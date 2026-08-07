/**
 * use-holding-no-success-toast.test.tsx — 260721 user feedback (2): saving an
 * investment / possession holding must NOT show a "saved"/"created" success
 * toast. Errors still toast (unchanged).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const successToast = vi.fn();
const errorToast = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => successToast(...a),
    error: (...a: unknown[]) => errorToast(...a),
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "k",
}));
vi.mock("../../src/lib/query-persist", () => ({
  persistNow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
const writeMock = vi.fn();
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => writeMock(...a),
  isOfflineWriteError: () => false,
}));

import { useCreateHolding } from "../../src/hooks/use-create-holding";
import { useUpdateHolding } from "../../src/hooks/use-update-holding";

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("holding save shows no success toast", () => {
  beforeEach(() => {
    successToast.mockClear();
    errorToast.mockClear();
    writeMock.mockReset();
    writeMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "h1" }),
      text: async () => "",
    });
  });

  it("create: on success does NOT toast.success", async () => {
    const { result } = renderHook(() => useCreateHolding("b1"), {
      wrapper: wrapper(),
    });
    result.current.mutate({ name: "Car", holdingType: "possession" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(successToast).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("update: on success does NOT toast.success", async () => {
    const { result } = renderHook(() => useUpdateHolding("b1"), {
      wrapper: wrapper(),
    });
    result.current.mutate({ holdingId: "h1", name: "Home" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(successToast).not.toHaveBeenCalled();
    expect(errorToast).not.toHaveBeenCalled();
  });
});
