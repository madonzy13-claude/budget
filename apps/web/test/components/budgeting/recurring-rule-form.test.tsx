/**
 * recurring-rule-form.test.tsx — saving a rule with a comma amount (260803).
 *
 * The API takes a decimal STRING and accepts a dot only. The form sent whatever
 * was typed, so a comma keyboard ("73,8" — the Polish layout's decimal key) was
 * rejected and every save died on a bare "Failed to create rule" (user report).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { writeMock, toastError } = vi.hoisted(() => ({
  writeMock: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/offline-write", () => ({
  clientApiWrite: writeMock,
  isOfflineWriteError: () => false,
}));
vi.mock("@/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import { RecurringRuleForm } from "@/components/budgeting/recurring-rule-form";

const CATEGORIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Housing" },
];

function renderForm() {
  return render(
    <RecurringRuleForm
      open
      onOpenChange={vi.fn()}
      mode="create"
      budgetId="b1"
      categories={CATEGORIES}
      defaultCurrency="PLN"
      onSaved={vi.fn()}
    />,
  );
}

/** The JSON body of the last write the form issued. */
const sentBody = () => {
  const call = writeMock.mock.calls[writeMock.mock.calls.length - 1];
  const init = call?.[1] as { body?: string } | undefined;
  return init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
};

beforeEach(() => {
  writeMock.mockReset();
  toastError.mockReset();
  writeMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("Recurring rule form — amount", () => {
  it("sends a comma amount as the dot decimal the API accepts", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "73,8");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(sentBody()?.amount).toBe("73.8");
  });

  it("leaves a dot amount exactly as typed", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "1500.25");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(sentBody()?.amount).toBe("1500.25");
  });

  it("says so on a nonsense amount instead of round-tripping a doomed save", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "abc");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(writeMock).not.toHaveBeenCalled();
  });
});
