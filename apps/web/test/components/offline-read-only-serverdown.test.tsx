import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { OfflineReadOnly } from "../../src/components/common/offline-read-only";

const toastFn = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toastFn(...a) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
let mockStatus: "online" | "offline" | "server-down" = "server-down";
vi.mock("../../src/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: mockStatus,
    degraded: mockStatus !== "online",
    reason: mockStatus,
  }),
}));

function setOnline(v: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: v });
}

beforeEach(() => {
  toastFn.mockReset();
  setOnline(true); // network is up; only the server is down
});

describe("OfflineReadOnly — server-down", () => {
  it("blocks a write control + toasts the server-down message when server-down", () => {
    mockStatus = "server-down";
    render(<OfflineReadOnly />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const evt = new Event("pointerdown", { bubbles: true, cancelable: true });
    const notPrevented = input.dispatchEvent(evt);
    expect(notPrevented).toBe(false); // preventDefault was called
    expect(toastFn).toHaveBeenCalledWith(
      "serverDown.banner.readOnly",
      expect.objectContaining({ position: "bottom-center" }),
    );
    document.body.removeChild(input);
  });

  it("toasts the offline message when offline", () => {
    mockStatus = "offline";
    render(<OfflineReadOnly />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(toastFn).toHaveBeenCalledWith(
      "offline.readOnly",
      expect.objectContaining({ position: "bottom-center" }),
    );
    document.body.removeChild(input);
  });

  it("does NOT block when online", () => {
    mockStatus = "online";
    render(<OfflineReadOnly />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const notPrevented = input.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(notPrevented).toBe(true);
    expect(toastFn).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
