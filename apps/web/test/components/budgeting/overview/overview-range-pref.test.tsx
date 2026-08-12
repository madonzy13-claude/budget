/**
 * overview-range-pref.test.tsx — the range selector remembers who picked what
 * (260805 request).
 *
 * The pick belongs to the PERSON, not the device: choose 3M on the phone and
 * the desktop opens on 3M, while another member of the same budget still opens
 * on their own default. So it rides `budget_members.ui_prefs` — the same store
 * the category pickers use — rather than localStorage.
 *
 * The waiting matters as much as the storing: seeding before the stored pick
 * lands would show the default range, fetch a month of data for it, and then
 * swap — a visible flash and a wasted request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const prefs: { current: Record<string, string[]> } = { current: {} };
const loaded = { current: true };
const save = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-member-ui-prefs", () => ({
  useMemberUiPrefs: () => ({
    prefs: prefs.current,
    isLoaded: loaded.current,
    save,
  }),
}));
const link = { degraded: false };
vi.mock("@/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: link.degraded ? "offline" : "online",
    degraded: link.degraded,
    reason: link.degraded ? "offline" : "online",
  }),
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "Europe/Warsaw",
}));
// The sections themselves are not what this file is about; each one records the
// range it was handed so the test can read it back.
const section = (id: string) =>
  function Section({ range }: { range: { preset: string } }) {
    return <div data-testid={id} data-preset={range.preset} />;
  };
vi.mock("@/components/budgeting/overview/planned-section", () => ({
  PlannedSection: section("planned"),
}));
vi.mock("@/components/budgeting/overview/overspent-reserves-section", () => ({
  OverspentReservesSection: section("reserves"),
}));
vi.mock("@/components/budgeting/overview/wealth-section", () => ({
  WealthSection: section("wealth"),
}));
vi.mock("@/components/budgeting/overview/overview-cards", () => ({
  OverviewCards: () => null,
}));
vi.mock("@/components/budgeting/overview/projection-timeline", () => ({
  ProjectionTimeline: () => null,
}));
vi.mock("@/components/common/stick-on-scroll", () => ({
  StickOnScroll: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { OverviewSections } =
  await import("@/components/budgeting/overview/overview-sections");

beforeEach(() => {
  prefs.current = {};
  loaded.current = true;
  save.mockClear();
});

const shownPreset = () =>
  screen.getByTestId("planned").getAttribute("data-preset");

describe("Overview range — remembered per member", () => {
  it("opens on the member's stored range", async () => {
    prefs.current = { overviewRange: ["last3Months"] };
    render(<OverviewSections budgetId="b1" />);
    await waitFor(() => expect(shownPreset()).toBe("last3Months"));
  });

  it("opens on the default when this member has stored nothing", async () => {
    render(<OverviewSections budgetId="b1" />);
    await waitFor(() => expect(shownPreset()).toBe("thisMonth"));
  });

  it("stores the pick as soon as it is made", async () => {
    const user = userEvent.setup();
    render(<OverviewSections budgetId="b1" />);
    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(save).toHaveBeenCalledWith("overviewRange", ["last3Months"]);
  });

  // Seeding before the stored pick lands would show the default, fetch a
  // month's data for it, and then swap — a flash and a wasted request.
  it("draws no range at all until the stored one has landed", () => {
    loaded.current = false;
    render(<OverviewSections budgetId="b1" />);
    expect(screen.queryByTestId("planned")).toBeNull();
  });

  // Prefs written by an older build, or by hand, must not break the page.
  it("falls back to the default when the stored range makes no sense", async () => {
    prefs.current = { overviewRange: ["lastDecade"] };
    render(<OverviewSections budgetId="b1" />);
    await waitFor(() => expect(shownPreset()).toBe("thisMonth"));
  });
});

// 260806: offline, a never-run query is PAUSED — never success, never error. The
// tab waits for the stored range before drawing, so waiting on it waits forever
// and the whole Overview stayed blank over data already in hand.
describe("Overview range — offline with nothing stored", () => {
  it("stops waiting and takes its default", () => {
    loaded.current = false;
    link.degraded = true;
    render(<OverviewSections budgetId="b1" />);
    expect(shownPreset()).toBe("thisMonth");
    link.degraded = false;
  });
});
