/**
 * settings-accordion.test.tsx — SETT-01
 *
 * Covers: 5-section accordion render for SHARED budgets,
 * 4-section render for PRIVATE budgets, default-open section.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
          $get: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ members: [] }) }),
        },
        share: {
          $post: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://example.com/join/abc" }) }),
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
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// entity hooks the accordion reads for the config checklist — return arrays so
// wallets.some/categories.some don't blow up (the blanket useQuery mock returns
// {members:[]} for MembersSection's own query).
vi.mock("@/hooks/use-wallets", () => ({ useWallets: () => ({ data: [] }) }));
vi.mock("@/hooks/use-investments", () => ({
  useInvestments: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [] }),
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
    expect(screen.getByText("sections.recurring")).toBeInTheDocument();
    expect(screen.getByText("sections.members")).toBeInTheDocument();
    expect(screen.getByText("sections.danger")).toBeInTheDocument();
  });

  it("renders Members for ANY budget (kind-removal: invite always available)", () => {
    render(<SettingsAccordion budget={privateBudget} />);
    expect(screen.getByText("sections.identity")).toBeInTheDocument();
    expect(screen.getByText("sections.cushion")).toBeInTheDocument();
    expect(screen.getByText("sections.recurring")).toBeInTheDocument();
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
