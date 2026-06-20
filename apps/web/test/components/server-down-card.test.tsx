/**
 * server-down-card.test.tsx — Test 12 (Phase 8 UAT).
 *
 * D-07 / T-08-04-02 invariant: the server-down screens must contain NO <a> link
 * (no /login link, no auto-redirect) — the ONLY interactive element is a manual
 * Retry/Reload button. This breaks any redirect loop when the API is unreachable
 * and auth can't be verified.
 *
 * Covers both the live route variant (ServerDownCard, on /[locale]/server-down,
 * health-probe Retry) and the signed-out variant (ServerDownSignedOut, manual
 * Reload). There was no test for either before — added during UAT verification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ServerDownCard,
  ServerDownSignedOut,
} from "../../src/components/common/server-down-card";

let mockSearch = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
// next-intl: echo the key so we can assert which copy renders.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const assign = vi.fn();
const reload = vi.fn();
let originalLocation: Location;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockSearch = "";
  assign.mockReset();
  reload.mockReset();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, reload, origin: "http://localhost:3000" },
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});

describe("ServerDownCard (route variant)", () => {
  it("D-07: renders a single Retry button and NO links", () => {
    const { container } = render(<ServerDownCard locale="en" />);
    expect(screen.getByTestId("server-down-retry-button")).toBeTruthy();
    // The whole point: no <a href> that could loop or bounce to /login.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    // Exactly one interactive button.
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("Retry probes /api/health and, on 200, navigates to the ?next target", async () => {
    mockSearch = "next=/en/budgets/abc/spendings";
    fetchMock.mockResolvedValueOnce({ ok: true });
    render(<ServerDownCard locale="en" />);

    fireEvent.click(screen.getByTestId("server-down-retry-button"));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("/en/budgets/abc/spendings"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("Retry with a cross-origin ?next falls back to /{locale} (open-redirect guard)", async () => {
    mockSearch = "next=https://evil.example/x";
    fetchMock.mockResolvedValueOnce({ ok: true });
    render(<ServerDownCard locale="pl" />);

    fireEvent.click(screen.getByTestId("server-down-retry-button"));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/pl"));
  });

  it("Retry while the API is still down shows an inline message and does not navigate", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    render(<ServerDownCard locale="en" />);

    fireEvent.click(screen.getByTestId("server-down-retry-button"));

    await waitFor(() =>
      expect(screen.getByTestId("server-down-still-unreachable")).toBeTruthy(),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("Retry that throws (fetch reject) also surfaces the inline message", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    render(<ServerDownCard locale="en" />);

    fireEvent.click(screen.getByTestId("server-down-retry-button"));

    await waitFor(() =>
      expect(screen.getByTestId("server-down-still-unreachable")).toBeTruthy(),
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("ServerDownSignedOut (signed-out variant)", () => {
  it("D-07: renders a single Reload button and NO links", () => {
    const { container } = render(<ServerDownSignedOut />);
    expect(screen.getByTestId("server-down-reload-button")).toBeTruthy();
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("Reload button triggers window.location.reload (user-initiated, not automatic)", () => {
    render(<ServerDownSignedOut />);
    expect(reload).not.toHaveBeenCalled(); // no auto-reload on mount
    fireEvent.click(screen.getByTestId("server-down-reload-button"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
