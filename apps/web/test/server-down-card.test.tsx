/**
 * server-down-card.test.tsx
 *
 * Tests for ServerDownCard component — D-07 invariant: no /login link,
 * no auto-redirect; only a manual Reload/Retry button.
 *
 * Also tests the signedOut variant (serverDown.signedOut.* copy).
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => {
    const map: Record<string, string> = {
      "server_down.title": "We can't reach the server",
      "server_down.body": "Budget is offline for the moment.",
      "server_down.retry": "Try again",
      "server_down.retrying": "Checking…",
      "server_down.still_unreachable": "Still no answer from the server.",
      "serverDown.heading": "Service unavailable",
      "serverDown.body": "Budget can't reach the server right now.",
      "serverDown.reload": "Reload",
      "serverDown.signedOut.heading": "You're signed out",
      "serverDown.signedOut.body":
        "Can't sign in right now due to a server problem.",
      "serverDown.signedOut.reload": "Reload",
    };
    return map[`${ns}.${key}`] ?? key;
  },
}));

import { ServerDownCard } from "../src/components/common/server-down-card";

describe("ServerDownCard — D-07 no-redirect-loop invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders with data-testid server-down-card", () => {
    render(<ServerDownCard locale="en" />);
    expect(screen.getByTestId("server-down-card")).toBeDefined();
  });

  test("D-07: contains NO anchor link to /login", () => {
    const { container } = render(<ServerDownCard locale="en" />);
    const loginLinks = container.querySelectorAll('a[href*="/login"]');
    expect(loginLinks.length).toBe(0);
  });

  test("D-07: contains NO anchor link to /sign-in", () => {
    const { container } = render(<ServerDownCard locale="en" />);
    const signInLinks = container.querySelectorAll('a[href*="/sign-in"]');
    expect(signInLinks.length).toBe(0);
  });

  test("D-07: no automatic redirect — no window.location.href assignment at render", () => {
    // window.location.assign is not called on render
    const assignSpy = vi
      .spyOn(window.location, "assign")
      .mockImplementation(() => {});
    render(<ServerDownCard locale="en" />);
    expect(assignSpy).not.toHaveBeenCalled();
    assignSpy.mockRestore();
  });

  test("retry button is present and clickable", () => {
    render(<ServerDownCard locale="en" />);
    const btn = screen.getByTestId("server-down-retry-button");
    expect(btn).toBeDefined();
  });

  test("retry button calls fetch on click (not window.location.assign immediately)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
    } as Response);

    render(<ServerDownCard locale="en" />);
    const btn = screen.getByTestId("server-down-retry-button");
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/health", expect.any(Object));
    });
    fetchSpy.mockRestore();
  });
});

// ── signedOut variant (new) ──────────────────────────────────────────────────

import { ServerDownSignedOut } from "../src/components/common/server-down-card";

describe("ServerDownSignedOut — variant with Reload button (D-07)", () => {
  test("renders server-down-card testid", () => {
    render(<ServerDownSignedOut />);
    expect(screen.getByTestId("server-down-card")).toBeDefined();
  });

  test("D-07: no /login or /sign-in link", () => {
    const { container } = render(<ServerDownSignedOut />);
    expect(container.querySelectorAll('a[href*="/login"]').length).toBe(0);
    expect(container.querySelectorAll('a[href*="/sign-in"]').length).toBe(0);
  });

  test("Reload button calls window.location.reload on click", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    });
    render(<ServerDownSignedOut />);
    const btn = screen.getByTestId("server-down-reload-button");
    fireEvent.click(btn);
    expect(reloadMock).toHaveBeenCalled();
  });

  test("contains only one interactive element (the Reload button)", () => {
    const { container } = render(<ServerDownSignedOut />);
    const buttons = container.querySelectorAll("button");
    const links = container.querySelectorAll("a");
    expect(buttons.length).toBe(1);
    expect(links.length).toBe(0);
  });
});
