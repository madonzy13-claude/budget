/**
 * security-section-timezone.test.tsx — UAT follow-up.
 *
 * Changing the timezone in the General section dispatches
 * `budget:timezone-changed`; the already-mounted sessions list must re-render
 * its timestamps in the new zone WITHOUT a refetch (getSession's cookie cache is
 * stale right after the change).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: vi.fn().mockResolvedValue({ data: {}, error: null }),
    listSessions: vi.fn().mockResolvedValue({
      data: [
        {
          token: "t1",
          userAgent:
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          ipAddress: "1.2.3.4",
          updatedAt: "2026-01-01T00:30:00Z",
        },
      ],
      error: null,
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { token: "t1" }, user: { timezone: "UTC" } },
      error: null,
    }),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Avoid the best-effort country fetch in the sessions list.
vi.mock("@/lib/ip-country", () => ({
  flagEmoji: () => "",
  lookupCountry: vi.fn().mockResolvedValue(null),
}));

import { SecuritySection } from "@/components/settings/security-section";

describe("SecuritySection — live timezone", () => {
  it("re-formats session times when the timezone changes", async () => {
    render(<SecuritySection email="ada@example.com" />);

    // Seeded as UTC → 00:30.
    await waitFor(() =>
      expect(screen.getByText((c) => c.includes("00:30"))).toBeInTheDocument(),
    );

    // User switches to Tokyo (UTC+9) in the General section.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("budget:timezone-changed", { detail: "Asia/Tokyo" }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText((c) => c.includes("09:30"))).toBeInTheDocument(),
    );
    expect(screen.queryByText((c) => c.includes("00:30"))).toBeNull();
  });
});
