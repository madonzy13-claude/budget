/**
 * email-changed-page.test.tsx — Phase 10 UAT (change-email rework)
 *
 * /email-changed lands BOTH steps of Better Auth's two-step change-email flow on
 * the same URL. It tells them apart by comparing `?to=` to the LIVE session email:
 *   - session email !== to  → step 1 (confirm clicked) → "check your new inbox"
 *   - session email === to  → step 2 (verify clicked)  → "email updated"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getSession = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
let toParam = "new@example.com";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => ({
    get: (k: string) => (k === "to" ? toParam : null),
  }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: (...a: unknown[]) => getSession(...a) },
}));
vi.mock("@/components/auth/auth-card-shell", () => ({
  AuthCardShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import EmailChangedPage from "@/app/[locale]/email-changed/page";

describe("EmailChangedPage — two-step change-email landing", () => {
  beforeEach(() => {
    getSession.mockReset();
    push.mockReset();
    refresh.mockReset();
    toParam = "new@example.com";
  });

  it("shows the pending notice when still signed in as the OLD email (step 1)", async () => {
    getSession.mockResolvedValue({
      data: { user: { email: "old@example.com" } },
    });
    render(<EmailChangedPage />);
    await waitFor(() =>
      expect(screen.getByTestId("email-changed-pending")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("email-changed-done")).not.toBeInTheDocument();
  });

  it("shows the done notice when the session email matches `to` (step 2)", async () => {
    getSession.mockResolvedValue({
      data: { user: { email: "new@example.com" } },
    });
    render(<EmailChangedPage />);
    await waitFor(() =>
      expect(screen.getByTestId("email-changed-done")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("email-changed-pending"),
    ).not.toBeInTheDocument();
    // Busts the Router Cache so a later /settings visit shows the new email.
    expect(refresh).toHaveBeenCalled();
  });

  it("treats a signed-out / unreadable session as pending", async () => {
    getSession.mockResolvedValue({ data: null });
    render(<EmailChangedPage />);
    await waitFor(() =>
      expect(screen.getByTestId("email-changed-pending")).toBeInTheDocument(),
    );
  });
});
