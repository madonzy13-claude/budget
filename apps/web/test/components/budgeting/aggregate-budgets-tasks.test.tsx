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

let tasksPayload: unknown[] = [];
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: async () => ({
    ok: true,
    json: async () => ({ tasks: tasksPayload }),
  }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: () => {} }),
}));

const scrollWhenReady = vi.fn(() => () => {});
vi.mock("@/lib/scroll-to-draft", () => ({
  scrollToDraftWhenReady: (...a: unknown[]) => scrollWhenReady(...a),
  scrollToDraft: () => false,
}));

vi.mock("@/components/budgeting/task-banner-row", () => ({
  useTaskTitle: () => ({
    title: "Confirm 29.99 zł (Surfr)",
    amounts: ["29.99 zł"],
  }),
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
  tasksPayload = [];
  push.mockClear();
  scrollWhenReady.mockClear();
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
      expect(
        within(row).getByTestId("aggregate-bt-chevron"),
      ).toBeInTheDocument();
      fireEvent.click(row);
      expect(
        within(row).getByTestId("aggregate-bt-spinner"),
      ).toBeInTheDocument();
    });

    it("gives up rather than spinning for ever on a navigation that never lands", async () => {
      renderList();
      const row = await screen.findByTestId("aggregate-bt-budget-b1");
      fireEvent.click(row);
      expect(
        within(row).getByTestId("aggregate-bt-spinner"),
      ).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect(
        within(row).getByTestId("aggregate-bt-chevron"),
      ).toBeInTheDocument();
    });
  });

  /**
   * A "Confirm 29.99 zł (Surfr)" task on the all-budgets page should land the
   * member on the same row the spendings page's own task lands them on — the
   * grid is a horizontal scroller of category columns, so the draft is usually
   * both below the fold and off to one side (user, 260905).
   *
   * What it must NOT copy is the spendings row's dotted-underline run. There the
   * underline marks WHICH part of a sentence is the jump; here the whole row is
   * already the target, so an underline inside it would offer a second, smaller
   * one.
   */
  describe("a confirm-payment task", () => {
    const draftTask = {
      id: "t1",
      kind: "CONFIRM_DRAFT",
      payload: { draft_id: "d-9", transaction_date: "2026-07-14" },
    };

    it("goes to the payment's own month and jumps to the row", async () => {
      tasksPayload = [draftTask];
      renderList();
      const line = await screen.findByTestId("aggregate-bt-task-t1");
      fireEvent.click(line);
      expect(push).toHaveBeenCalledWith(
        "/en/budgets/b1/spendings?month=2026-07",
      );
      // The row only exists once that month's columns have mounted, which is
      // after the navigation — hence the polling variant.
      expect(scrollWhenReady).toHaveBeenCalledWith(
        "d-9",
        expect.objectContaining({ timeoutMs: expect.any(Number) }),
      );
    });

    it("leaves the title plain — no second, smaller target inside the row", async () => {
      tasksPayload = [draftTask];
      renderList();
      const line = await screen.findByTestId("aggregate-bt-task-t1");
      // No dotted-underline jump run. The amount's own reveal control is a
      // different thing and stays — it hides a figure, it does not navigate.
      expect(line.querySelector(".underline")).toBeNull();
      expect(line.querySelector("button")).toBeNull();
    });

    it("a task with no draft still just opens its pill", async () => {
      tasksPayload = [{ id: "t2", kind: "RESERVE_TOPUP", payload: {} }];
      renderList();
      fireEvent.click(await screen.findByTestId("aggregate-bt-task-t2"));
      expect(push).toHaveBeenCalledWith("/en/budgets/b1/reserves");
      expect(scrollWhenReady).not.toHaveBeenCalled();
    });
  });

  it("the row's spinner is grey, not the brand accent", async () => {
    pending = true;
    renderList();
    const row = await screen.findByTestId("aggregate-bt-budget-b1");
    const spinner = within(row).getByTestId("aggregate-bt-spinner");
    // A navigation in progress is not a brand moment; the accent means "this is
    // the value you are setting" elsewhere in the app (user, 260905).
    expect(spinner.getAttribute("class")).toContain("--muted-foreground");
    expect(spinner.getAttribute("class")).not.toContain("--primary");
  });
});
