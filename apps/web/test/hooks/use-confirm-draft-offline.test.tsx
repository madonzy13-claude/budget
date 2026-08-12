/**
 * use-confirm-draft-offline.test.tsx — confirming a scheduled draft offline.
 *
 * 260731-osq round 2 (user ask): a failed confirm must NOT be lost. It is queued
 * with the offline spendings queue and replayed once the connection returns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineWriteError } from "../../src/lib/offline-write";
import { listPendingSpendings } from "../../src/lib/pending-spendings";
import { useConfirmDraft } from "../../src/hooks/use-confirm-draft";

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/offline-write")
  >("../../src/lib/offline-write");
  return { ...actual, clientApiWrite: (...a: unknown[]) => mockWrite(...a) };
});

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const BUDGET = "budget-1";
const MONTH = "2026-05";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("Confirming a draft offline", () => {
  beforeEach(() => {
    localStorage.clear();
    mockWrite.mockReset();
    mockToastSuccess.mockReset();
  });

  it("queues the confirm (with its amount override) and says it'll sync", async () => {
    mockWrite.mockRejectedValue(new OfflineWriteError());
    const { result } = renderHook(() => useConfirmDraft(BUDGET, MONTH), {
      wrapper,
    });

    result.current.mutate({ draftId: "draft-1", amountOverride: 2500 });

    await waitFor(() => expect(listPendingSpendings()).toHaveLength(1));
    expect(listPendingSpendings()[0]).toMatchObject({
      kind: "confirm-draft",
      budgetId: BUDGET,
      month: MONTH,
      draftId: "draft-1",
      amountOverrideCents: 2500,
    });
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("queues nothing when the server answers with a real error", async () => {
    mockWrite.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "already_confirmed",
    });
    const { result } = renderHook(() => useConfirmDraft(BUDGET, MONTH), {
      wrapper,
    });

    result.current.mutate({ draftId: "draft-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(listPendingSpendings()).toHaveLength(0);
  });

  it("queues nothing on success", async () => {
    mockWrite.mockResolvedValue({ ok: true, status: 204 });
    const { result } = renderHook(() => useConfirmDraft(BUDGET, MONTH), {
      wrapper,
    });

    result.current.mutate({ draftId: "draft-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listPendingSpendings()).toHaveLength(0);
  });
});
