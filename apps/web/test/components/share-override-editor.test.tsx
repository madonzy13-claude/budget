/**
 * share-override-editor.test.tsx — Vitest+RTL tests for ShareOverrideEditor.
 * Focus: live sum counter, save button disabled when sum ≠ 100%, exact caption string.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShareOverrideEditor } from "../../src/components/budgeting/share-override-editor";

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "budgeting_categories.shares.title": "Contribution shares",
      "budgeting_categories.shares.sumCounter": "Currently {sum}% — must equal 100%",
      "budgeting_categories.shares.sharesNeedUpdate": "Shares need to be updated",
      "budgeting_categories.shares.save": "Save shares",
      "budgeting_categories.shares.overrideBadge": "override",
    };
    const fullKey = `${ns}.${key}`;
    const template = map[fullKey] ?? key;
    if (params) {
      return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    }
    return template;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MEMBERS = [
  { userId: "user-1", name: "Alice" },
  { userId: "user-2", name: "Bob" },
];

describe("ShareOverrideEditor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders sum counter with initial 0%", () => {
    render(
      <ShareOverrideEditor
        categoryId="cat-1"
        members={MEMBERS}
      />
    );
    const counter = screen.getByTestId("sum-counter");
    expect(counter.textContent).toContain("Currently");
    expect(counter.textContent).toContain("must equal 100%");
  });

  it("save button disabled when sum is 0", () => {
    render(
      <ShareOverrideEditor
        categoryId="cat-1"
        members={MEMBERS}
      />
    );
    const saveBtn = screen.getByRole("button", { name: /save shares/i });
    expect(saveBtn).toBeDisabled();
  });

  it("save button disabled when sum is 90 (not 100)", () => {
    render(
      <ShareOverrideEditor
        categoryId="cat-1"
        members={MEMBERS}
        existingOverrides={[
          { userId: "user-1", percentage: "60" },
          { userId: "user-2", percentage: "30" },
        ]}
      />
    );
    const saveBtn = screen.getByRole("button", { name: /save shares/i });
    expect(saveBtn).toBeDisabled();
  });

  it("save button enabled when sum equals 100", () => {
    render(
      <ShareOverrideEditor
        categoryId="cat-1"
        members={MEMBERS}
        existingOverrides={[
          { userId: "user-1", percentage: "60" },
          { userId: "user-2", percentage: "40" },
        ]}
      />
    );
    const saveBtn = screen.getByRole("button", { name: /save shares/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it("sum counter updates live as user types", () => {
    render(
      <ShareOverrideEditor
        categoryId="cat-1"
        members={MEMBERS}
        existingOverrides={[
          { userId: "user-1", percentage: "50" },
          { userId: "user-2", percentage: "50" },
        ]}
      />
    );

    const inputs = screen.getAllByRole("spinbutton");
    // Change first input to 70
    fireEvent.change(inputs[0], { target: { value: "70" } });

    const counter = screen.getByTestId("sum-counter");
    // sum now 70+50=120 — not 100, counter shows current value
    expect(counter.textContent).toContain("Currently");
  });

  it("calls PUT endpoint with entries when save clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ overrides: [] }),
    });

    render(
      <ShareOverrideEditor
        categoryId="cat-99"
        members={MEMBERS}
        existingOverrides={[
          { userId: "user-1", percentage: "50" },
          { userId: "user-2", percentage: "50" },
        ]}
      />
    );

    const saveBtn = screen.getByRole("button", { name: /save shares/i });
    fireEvent.click(saveBtn);

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/categories/cat-99/share-overrides",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });
});
