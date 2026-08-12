/**
 * settings-accordion.test.tsx — SETT-01
 *
 * Covers: 5-section accordion render for SHARED budgets,
 * 4-section render for PRIVATE budgets, default-open section.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsAccordion } from "@/components/settings/settings-accordion";

// next-intl mock
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// api-client mock
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": {
        $patch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
        members: {
          $get: vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ members: [] }),
          }),
        },
        share: {
          $post: vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ url: "https://example.com/join/abc" }),
          }),
        },
        archive: {
          $post: vi.fn().mockResolvedValue({ ok: true }),
        },
        delete: {
          $post: vi.fn().mockResolvedValue({ ok: true }),
        },
        leave: {
          $post: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
    },
  },
}));

// next/navigation mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// sonner mock
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// react-query mock
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: { members: [] }, isLoading: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// entity hooks the accordion reads for the config checklist — return arrays so
// wallets.some/categories.some don't blow up (the blanket useQuery mock returns
// {members:[]} for MembersSection's own query).
// Controllable so a test can put the wallets count in a loading state and assert
// the config-progress banner stays hidden (r34 flicker fix).
const walletsMock = vi.hoisted(() => ({
  current: { data: [] as unknown[], isLoading: false },
}));
vi.mock("@/hooks/use-wallets", () => ({
  useWallets: () => walletsMock.current,
}));
vi.mock("@/hooks/use-investments", () => ({
  useInvestments: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [] }),
}));

// Task 11: controllable active-budgets count for the aggregation-toggle gate.
const activeBudgetsMock = vi.hoisted(() => ({
  current: { data: [{ id: "budget-1" }] as unknown[] },
}));
vi.mock("@/hooks/use-active-budgets", () => ({
  useActiveBudgets: () => activeBudgetsMock.current,
}));

const sharedBudget = {
  id: "budget-1",
  name: "Family Budget",
  kind: "SHARED" as const,
  defaultCurrency: "USD",
  cushionModeEnabled: false,
  hasTransactions: false,
  currentUserRole: "owner" as const,
};

const privateBudget = {
  id: "budget-2",
  name: "My Budget",
  kind: "PRIVATE" as const,
  defaultCurrency: "EUR",
  cushionModeEnabled: true,
  hasTransactions: false,
  currentUserRole: "owner" as const,
};

describe("SettingsAccordion — 5-section collapsible render (SETT-01)", () => {
  it("renders all 5 sections for a SHARED budget", () => {
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(screen.getByText("sections.identity")).toBeInTheDocument();
    expect(screen.getByText("sections.cushion")).toBeInTheDocument();
    expect(screen.getByText("sections.scheduled")).toBeInTheDocument();
    expect(screen.getByText("sections.members")).toBeInTheDocument();
    expect(screen.getByText("sections.danger")).toBeInTheDocument();
  });

  it("renders Members for ANY budget (kind-removal: invite always available)", () => {
    render(<SettingsAccordion budget={privateBudget} />);
    expect(screen.getByText("sections.identity")).toBeInTheDocument();
    expect(screen.getByText("sections.cushion")).toBeInTheDocument();
    expect(screen.getByText("sections.scheduled")).toBeInTheDocument();
    // Members section is now shown regardless of former private/shared kind.
    expect(screen.getByText("sections.members")).toBeInTheDocument();
    expect(screen.getByText("sections.danger")).toBeInTheDocument();
  });

  it("default-open section is Budget Identity", () => {
    const { container } = render(<SettingsAccordion budget={sharedBudget} />);
    // The accordion item with value="budget-identity" should be open
    const openItem = container.querySelector('[data-state="open"]');
    expect(openItem).not.toBeNull();
  });
});

describe("SettingsAccordion — member read-only gating (bug #1)", () => {
  const memberBudget = { ...sharedBudget, currentUserRole: "member" as const };

  it("hides the Danger Zone from members", () => {
    render(<SettingsAccordion budget={memberBudget} />);
    expect(screen.queryByText("sections.danger")).toBeNull();
  });

  it("keeps the Danger Zone for owners", () => {
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(screen.getByText("sections.danger")).toBeInTheDocument();
  });

  it("gives members a Leave-budget action inside the Members section", () => {
    render(<SettingsAccordion budget={memberBudget} />);
    // Members section is collapsed by default — open it so its content mounts.
    fireEvent.click(screen.getByText("sections.members"));
    expect(screen.getByText("danger.leave_button")).toBeInTheDocument();
  });

  it("does not show the members Leave action to owners", () => {
    render(<SettingsAccordion budget={sharedBudget} />);
    fireEvent.click(screen.getByText("sections.members"));
    expect(screen.queryByText("danger.leave_button")).toBeNull();
  });

  it("wraps owner-only sections in a disabled fieldset for members", () => {
    const { container } = render(<SettingsAccordion budget={memberBudget} />);
    expect(container.querySelector("fieldset[disabled]")).not.toBeNull();
  });

  // Privacy mode is the reader's own (260810) — behind the gate it was dead
  // for exactly the people who most need it.
  it("lets a member set their own privacy mode", () => {
    render(<SettingsAccordion budget={memberBudget} />);
    const sw = screen.getByTestId("amount-privacy-switch");
    expect(sw.closest("fieldset[disabled]")).toBeNull();
  });

  it("leaves owner-only sections enabled for owners", () => {
    const { container } = render(<SettingsAccordion budget={sharedBudget} />);
    expect(container.querySelector("fieldset[disabled]")).toBeNull();
  });
});

describe("SettingsAccordion — config-progress banner (r34 flicker)", () => {
  beforeEach(() => {
    walletsMock.current = { data: [], isLoading: false };
  });

  it("hides the banner while the config counts are still loading", () => {
    walletsMock.current = {
      data: undefined as unknown as unknown[],
      isLoading: true,
    };
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(screen.queryByTestId("settings-config-progress")).toBeNull();
  });

  it("shows the banner once counts loaded + setup is incomplete", () => {
    // default mock: loaded (isLoading:false) with empty data → percent < 100
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(screen.getByTestId("settings-config-progress")).toBeInTheDocument();
  });
});

describe("SettingsAccordion — aggregation toggle gating (Task 11)", () => {
  it("hides the toggle when the user has only 1 active budget", () => {
    activeBudgetsMock.current = { data: [{ id: "budget-1" }] };
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(screen.queryByTestId("settings-aggregation-toggle")).toBeNull();
  });

  it("shows the toggle when the user has 2+ active budgets", () => {
    activeBudgetsMock.current = {
      data: [{ id: "budget-1" }, { id: "budget-2" }],
    };
    render(<SettingsAccordion budget={sharedBudget} />);
    expect(
      screen.getByTestId("settings-aggregation-toggle"),
    ).toBeInTheDocument();
  });
});

/**
 * The General card's own rhythm (user, 260810).
 *
 * Its rows are a divide-y list, each with py-3, so consecutive rows sit 24px
 * apart. The card's padding added 20px on top of the first row's 12 (32px above
 * "Name"), and the aggregation join added mt-4 + pt-4 on top of it (44px below
 * "Privacy mode"). Both joins have to match the rhythm the rows set, not exceed
 * it.
 */
describe("SettingsAccordion — the General card's spacing", () => {
  /** The padded body of the open card — Radix puts our className on the inner
   *  div, not on the [data-slot] wrapper. */
  const identityContent = (container: HTMLElement) =>
    [
      ...container.querySelectorAll<HTMLElement>('[data-state="open"] div'),
    ].find((n) => n.className.includes("surface-sunken-dark"))!;

  it("pads the card to the same 12px its rows use", () => {
    const { container } = render(<SettingsAccordion budget={sharedBudget} />);
    const content = identityContent(container)!;
    expect(content.className).toContain("py-3");
    expect(content.className).not.toContain("py-5");
  });

  it("joins the aggregation block on the rows' rhythm, not above it", () => {
    const { container } = render(
      <SettingsAccordion budget={{ ...sharedBudget, budgetCount: 2 }} />,
    );
    const join = container.querySelector(
      '[data-testid="settings-aggregation-join"]',
    );
    if (!join) return; // only rendered with 2+ budgets in this harness
    expect(join.className).toContain("pt-3");
    expect(join.className).not.toContain("mt-4");
    expect(join.className).not.toContain("pt-4");
  });
});
