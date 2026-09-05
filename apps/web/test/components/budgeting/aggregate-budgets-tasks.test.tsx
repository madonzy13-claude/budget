// apps/web/test/components/budgeting/aggregate-budgets-tasks.test.tsx
/**
 * Tapping a budget on the all-budgets page leaves it. That navigation goes to
 * the server, and until the new page commits NOTHING moved — the row just sat
 * there and the app read as frozen (user, 260905).
 *
 * The affordance is per-ROW, not per-page: the chevron that says "this row goes
 * somewhere" becomes a spinner in the same spot, so the thing the finger landed
 * on is the thing that answers.
 *
 * `useLinkStatus` is Next's own per-link pending flag, which is why there is no
 * click handler or state here to test — only what the row renders while its
 * link is in flight.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  TestQueryProvider,
  makeTestQueryClient,
} from "../../setup/query-client";

let pending = false;
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: async () => ({ ok: true, json: async () => ({ tasks: [] }) }),
}));

import { AggregateBudgetsTasks } from "@/components/budgeting/aggregate/aggregate-budgets-tasks";

function renderList() {
  return render(
    <TestQueryProvider client={makeTestQueryClient()}>
      <AggregateBudgetsTasks
        budgets={[{ id: "b1", name: "Home", cushionMode: false }]}
      />
    </TestQueryProvider>,
  );
}

beforeEach(() => {
  pending = false;
});

describe("AggregateBudgetsTasks — leaving for a budget", () => {
  it("shows the chevron at rest", async () => {
    renderList();
    const row = await screen.findByTestId("aggregate-bt-budget-b1");
    expect(within(row).getByTestId("aggregate-bt-chevron")).toBeInTheDocument();
    expect(within(row).queryByTestId("aggregate-bt-spinner")).toBeNull();
  });

  it("swaps it for a spinner while the navigation is in flight", async () => {
    pending = true;
    renderList();
    const row = await screen.findByTestId("aggregate-bt-budget-b1");
    expect(within(row).getByTestId("aggregate-bt-spinner")).toBeInTheDocument();
    // In the chevron's place, not beside it — two trailing marks would shift
    // the row's contents at the exact moment it should look settled.
    expect(within(row).queryByTestId("aggregate-bt-chevron")).toBeNull();
  });

  it("tells assistive tech the row is working", async () => {
    pending = true;
    renderList();
    // On the trailing CLUSTER, not the Link: an aria-hidden spinner cannot
    // carry it, and useLinkStatus only reports from inside the Link, so the
    // anchor element itself is out of reach.
    const row = await screen.findByTestId("aggregate-bt-budget-b1");
    expect(within(row).getByTestId("aggregate-bt-trailing")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("carries no busy flag at rest", async () => {
    renderList();
    const row = await screen.findByTestId("aggregate-bt-budget-b1");
    expect(
      within(row).getByTestId("aggregate-bt-trailing"),
    ).not.toHaveAttribute("aria-busy");
  });

  /**
   * The hook alone is not enough here. On this app the destination is usually
   * served by the SERVICE WORKER, so the router transition finishes in
   * milliseconds and `pending` may never be observed — measured on the dev
   * stack, where CDP saw the RSC request never reach the network at all. The
   * wait a member actually feels is tap → the destination's first paint, which
   * spans more than the transition.
   *
   * So the tap itself starts the spinner. It ends when this row unmounts, which
   * is what leaving the page does — with a safety clear for a navigation that
   * never happens (a cancelled one, or a tap that opened a new tab).
   */
  describe("the tap itself", () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it("starts the spinner even before the router reports anything", async () => {
      renderList();
      const row = await screen.findByTestId("aggregate-bt-budget-b1");
      expect(within(row).getByTestId("aggregate-bt-chevron")).toBeInTheDocument();
      fireEvent.click(row);
      expect(within(row).getByTestId("aggregate-bt-spinner")).toBeInTheDocument();
    });

    it("gives up rather than spinning for ever on a navigation that never lands", async () => {
      renderList();
      const row = await screen.findByTestId("aggregate-bt-budget-b1");
      fireEvent.click(row);
      expect(within(row).getByTestId("aggregate-bt-spinner")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect(within(row).getByTestId("aggregate-bt-chevron")).toBeInTheDocument();
    });
  });
});
