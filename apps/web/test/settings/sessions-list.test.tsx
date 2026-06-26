/**
 * sessions-list.test.tsx — Plan 10-04
 *
 * The active-sessions list: a per-row "Sign out this session" (revokeSession,
 * existing) and a new "Sign out all other devices" (revokeOtherSessions). Both
 * go through one confirm AlertDialog; on success the affected rows drop and the
 * current session always remains.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const revokeSession = vi.fn().mockResolvedValue({ data: {}, error: null });
const revokeOtherSessions = vi
  .fn()
  .mockResolvedValue({ data: {}, error: null });

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    revokeSession: (...a: unknown[]) => revokeSession(...a),
    revokeOtherSessions: (...a: unknown[]) => revokeOtherSessions(...a),
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SessionsList } from "@/components/settings/sessions-list";

const SESSIONS = [
  {
    id: "cur-token",
    deviceInfo: "This device",
    lastActive: "now",
    isCurrent: true,
  },
  {
    id: "other-token",
    deviceInfo: "Other phone",
    lastActive: "yesterday",
    isCurrent: false,
  },
];

describe("SessionsList — revoke + sign-out-others (USET-05)", () => {
  beforeEach(() => {
    revokeSession.mockClear();
    revokeOtherSessions.mockClear();
  });

  it("revokes a single session and drops its row", async () => {
    render(<SessionsList sessions={SESSIONS} />);
    fireEvent.click(screen.getByTestId("session-revoke-other-token"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() =>
      expect(revokeSession).toHaveBeenCalledWith({ token: "other-token" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("session-row-other-token"),
      ).not.toBeInTheDocument(),
    );
  });

  it("signs out all other devices, leaving only the current session", async () => {
    render(<SessionsList sessions={SESSIONS} />);
    fireEvent.click(screen.getByTestId("sign-out-others"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByTestId("session-row-other-token"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("session-row-cur-token")).toBeInTheDocument();
  });
});
