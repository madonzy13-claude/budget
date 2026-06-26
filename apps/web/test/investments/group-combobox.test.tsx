/**
 * group-combobox.test.tsx — Vitest+RTL tests for GroupCombobox (Phase 9, INV-05).
 *
 * Coverage:
 * - Existing group names render as options
 * - Free-typing a new name surfaces a "create" item that, when chosen, calls
 *   onChange with the typed value
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupCombobox } from "../../src/components/budgeting/wallets-tab/group-combobox";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      let s = key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
  useLocale: () => "en",
}));

describe("GroupCombobox", () => {
  it("lists existing group names when opened", async () => {
    render(
      <GroupCombobox
        value={null}
        groups={["Broker A", "Direct"]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("holding-sheet-group"));
    await waitFor(() => {
      expect(screen.getByText("Broker A")).toBeInTheDocument();
      expect(screen.getByText("Direct")).toBeInTheDocument();
    });
  });

  it("free-types a new group and calls onChange with it", async () => {
    const onChange = vi.fn();
    render(
      <GroupCombobox value={null} groups={["Broker A"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("holding-sheet-group"));
    const input = await screen.findByPlaceholderText("field.group");
    fireEvent.change(input, { target: { value: "Precious Metals" } });
    const createItem = await screen.findByTestId("holding-sheet-group-create");
    fireEvent.click(createItem);
    expect(onChange).toHaveBeenCalledWith("Precious Metals");
  });
});
