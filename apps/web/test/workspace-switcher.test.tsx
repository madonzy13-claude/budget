import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceSwitcher } from "../src/components/workspace/workspace-switcher";
import type { WorkspaceSummary } from "../src/components/workspace/workspace-switcher";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, opts?: { defaultValue?: string; count?: number }) => {
      if (key === "active_count") return `${opts?.count ?? 0} workspaces`;
      if (key === "group.private") return "Private budgets";
      if (key === "group.shared") return "Shared budgets";
      return opts?.defaultValue ?? key;
    },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockPut = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../src/lib/api-client", () => ({
  api: {
    settings: {
      "active-workspaces": {
        $put: (args: { json: { active_workspace_ids: string[] } }) =>
          mockPut(args),
      },
    },
  },
}));

const mockWorkspaces: WorkspaceSummary[] = [
  { id: "ws-1", name: "My Budget", kind: "PRIVATE", default_currency: "USD" },
  {
    id: "ws-2",
    name: "Family Budget",
    kind: "SHARED",
    default_currency: "EUR",
  },
];

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders PRIVATE workspace row", () => {
    render(
      <WorkspaceSwitcher
        workspaces={mockWorkspaces}
        initialActiveIds={["ws-1"]}
      />,
    );
    expect(screen.getByText("My Budget")).toBeTruthy();
  });

  it("renders SHARED workspace row", () => {
    render(
      <WorkspaceSwitcher
        workspaces={mockWorkspaces}
        initialActiveIds={["ws-1"]}
      />,
    );
    expect(screen.getByText("Family Budget")).toBeTruthy();
  });

  it("renders Private budgets group header", () => {
    render(
      <WorkspaceSwitcher workspaces={mockWorkspaces} initialActiveIds={[]} />,
    );
    expect(screen.getByText("Private budgets")).toBeTruthy();
  });

  it("renders Shared budgets group header", () => {
    render(
      <WorkspaceSwitcher workspaces={mockWorkspaces} initialActiveIds={[]} />,
    );
    expect(screen.getByText("Shared budgets")).toBeTruthy();
  });

  it("fires PUT with updated active_workspace_ids when checkbox is toggled", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={mockWorkspaces}
        initialActiveIds={["ws-1"]}
      />,
    );

    // Toggle ws-2 (Family Budget) checkbox
    const checkbox = screen.getByLabelText("Toggle Family Budget");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({
        json: { active_workspace_ids: ["ws-1", "ws-2"] },
      });
    });
  });

  it("removes workspace from active_workspace_ids when unchecked", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={mockWorkspaces}
        initialActiveIds={["ws-1", "ws-2"]}
      />,
    );

    // Uncheck ws-1 (My Budget)
    const checkbox = screen.getByLabelText("Toggle My Budget");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({
        json: { active_workspace_ids: ["ws-2"] },
      });
    });
  });
});
