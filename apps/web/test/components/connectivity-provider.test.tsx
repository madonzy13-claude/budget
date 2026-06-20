import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import {
  ConnectivityProvider,
  useConnectivity,
} from "../../src/components/common/connectivity-provider";
import {
  reportApiUnreachable,
  reportApiOk,
} from "../../src/lib/api-unreachable-bus";

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

function Probe() {
  const { status, degraded } = useConnectivity();
  return <div data-testid="s">{`${status}:${degraded}`}</div>;
}

function renderProbe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectivityProvider>
        <Probe />
      </ConnectivityProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setOnline(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  onlineManager.setOnline(true); // reset global between tests
});

describe("ConnectivityProvider", () => {
  it("starts online", () => {
    renderProbe();
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });

  it("offline takes precedence (navigator.onLine=false)", async () => {
    renderProbe();
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByTestId("s").textContent).toBe("offline:true");
  });

  it("enters server-down only after a failed /api/health probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
    });
    await waitFor(() =>
      expect(screen.getByTestId("s").textContent).toBe("server-down:true"),
    );
  });

  it("does NOT enter server-down if the health probe succeeds (one-off endpoint error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
      await Promise.resolve();
    });
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });

  it("pauses React Query (onlineManager offline) while server-down, resumes on recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
    });
    await waitFor(() =>
      expect(screen.getByTestId("s").textContent).toBe("server-down:true"),
    );
    expect(onlineManager.isOnline()).toBe(false);
    await act(async () => {
      reportApiOk();
    });
    expect(screen.getByTestId("s").textContent).toBe("online:false");
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("reportApiOk clears server-down immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderProbe();
    await act(async () => {
      reportApiUnreachable();
    });
    await waitFor(() =>
      expect(screen.getByTestId("s").textContent).toBe("server-down:true"),
    );
    await act(async () => {
      reportApiOk();
    });
    expect(screen.getByTestId("s").textContent).toBe("online:false");
  });
});
