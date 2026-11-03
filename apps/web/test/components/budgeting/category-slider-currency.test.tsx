/**
 * category-slider-currency.test.tsx — UI-SPEC §1 (D-04/D-07): the category
 * slider has a Currency field. Add defaults to the budget currency; edit shows
 * the category's; changing it converts the limit at today's rate (preview),
 * and Save calls PATCH /categories/:id/currency first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({ clientApiFetch: (...a: unknown[]) => fetchMock(...a) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, v?: Record<string, string>) =>
    v ? `${key}:${Object.values(v).join("|")}` : key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@radix-ui/react-dialog", async (orig) => {
  const actual = await orig<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

import { CategorySlider } from "@/components/budgeting/category-slider";

const base = { open: true, onOpenChange: vi.fn(), budgetId: "b1", budgetCurrency: "PLN" };
const editInitial = {
  categoryId: "cat-1",
  name: "Food",
  plannedCents: "100000",
  cushionCents: "0",
  colorKey: null,
  currency: "PLN",
};
const bodyOf = (url: RegExp, method: string) => {
  const c = fetchMock.mock.calls.find((x) => url.test(String(x[0])) && (x[1] as { method?: string })?.method === method);
  return c ? JSON.parse((c[1] as { body: string }).body) : undefined;
};
const pickCurrency = (ccy: string) => {
  const native = screen.queryByTestId("currency-picker-native") as HTMLSelectElement | null;
  if (native) fireEvent.change(native, { target: { value: ccy } });
  else throw new Error("expected the native picker in happy-dom");
};

describe("Category slider — currency", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/fx/rate")) return { ok: true, json: async () => ({ rate: "0.2333" }) };
      return { ok: true, json: async () => ({ category: { id: "cat-new", currency: "EUR" } }) };
    });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
  });

  it("add mode defaults to the budget currency and posts the chosen one", async () => {
    const user = userEvent.setup();
    render(<TestQueryProvider><CategorySlider {...base} mode="create" /></TestQueryProvider>);
    expect(screen.getByTestId("category-currency-picker")).toBeTruthy();
    expect((screen.getByTestId("currency-picker-native") as HTMLSelectElement).value).toBe("PLN");
    pickCurrency("EUR");
    await user.type(document.getElementById("cat-slider-name") as HTMLInputElement, "Trips");
    await user.click(screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!);
    await waitFor(() => expect(bodyOf(/\/categories$/, "POST")?.currency).toBe("EUR"));
    expect(bodyOf(/\/limits$/, "POST")).toMatchObject({ normalCurrency: "EUR", cushionCurrency: "EUR" });
  });

  it("edit mode shows the category's currency", () => {
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={{ ...editInitial, currency: "EUR" }} /></TestQueryProvider>);
    expect((screen.getByTestId("currency-picker-native") as HTMLSelectElement).value).toBe("EUR");
  });

  it("changing the currency converts the limit at today's rate and saves the currency first", async () => {
    const user = userEvent.setup();
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={editInitial} /></TestQueryProvider>);
    pickCurrency("EUR");
    await waitFor(() => expect(screen.getByTestId("category-currency-hint").textContent).toContain("PLN|EUR"));
    await waitFor(() => expect((document.getElementById("cat-slider-needs") as HTMLInputElement).value).toBe("233.30"));
    await user.click(screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!);
    await waitFor(() => expect(bodyOf(/\/categories\/cat-1\/currency$/, "PATCH")).toEqual({ currency: "EUR" }));
  });

  it("switching back to the stored currency restores the amounts exactly", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("from=PLN&to=EUR")) return { ok: true, json: async () => ({ rate: "0.2333" }) };
      if (String(url).includes("from=EUR&to=PLN")) return { ok: true, json: async () => ({ rate: "4.2863" }) };
      if (String(url).includes("from=PLN&to=USD")) return { ok: true, json: async () => ({ rate: "0.25" }) };
      return { ok: true, json: async () => ({}) };
    });
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={{ ...editInitial, needsCents: "100000", wantsCents: "0" }} /></TestQueryProvider>);
    const needs = () => (document.getElementById("cat-slider-needs") as HTMLInputElement).value;
    pickCurrency("EUR");
    await waitFor(() => expect(needs()).toBe("233.30"));
    pickCurrency("PLN");
    await waitFor(() => expect(needs()).toBe("1000"));
    // Another currency converts from the amount as typed, not from the last conversion.
    pickCurrency("EUR");
    await waitFor(() => expect(needs()).toBe("233.30"));
    pickCurrency("USD");
    await waitFor(() => expect(needs()).toBe("250"));
  });

  it("a limit converted on the server goes back to what was typed, not a conversion of it (user, 261103)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("from=EUR&to=PLN")) return { ok: true, json: async () => ({ rate: "4.2863" }) };
      if (String(url).includes("from=PLN&to=USD")) return { ok: true, json: async () => ({ rate: "0.25" }) };
      return { ok: true, json: async () => ({}) };
    });
    const converted = {
      ...editInitial, currency: "EUR", plannedCents: "23330", needsCents: "23330", wantsCents: "0",
      convertedFrom: { currency: "PLN", plannedCents: "100000", cushionCents: "0", needsCents: "100000", wantsCents: "0" },
    };
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={converted} /></TestQueryProvider>);
    const needs = () => (document.getElementById("cat-slider-needs") as HTMLInputElement).value;
    expect(needs()).toBe("233.30");
    pickCurrency("PLN");
    await waitFor(() => expect(needs()).toBe("1000"));
    pickCurrency("USD");
    await waitFor(() => expect(needs()).toBe("250"));
  });

  it("saving only a currency change leaves the limit to the server's exact conversion", async () => {
    const user = userEvent.setup();
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={editInitial} /></TestQueryProvider>);
    pickCurrency("EUR");
    await waitFor(() => expect((document.getElementById("cat-slider-needs") as HTMLInputElement).value).toBe("233.30"));
    await user.click(screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!);
    await waitFor(() => expect(bodyOf(/\/categories\/cat-1\/currency$/, "PATCH")).toEqual({ currency: "EUR" }));
    await waitFor(() => expect(bodyOf(/\/categories\/cat-1$/, "PATCH")).toBeDefined());
    expect(bodyOf(/\/limits$/, "POST")).toBeUndefined();
  });

  it("an amount edited after the currency change is saved", async () => {
    const user = userEvent.setup();
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={editInitial} /></TestQueryProvider>);
    pickCurrency("EUR");
    const input = document.getElementById("cat-slider-needs") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("233.30"));
    fireEvent.change(input, { target: { value: "240" } });
    await user.click(screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit")!);
    await waitFor(() => expect(bodyOf(/\/limits$/, "POST")).toMatchObject({ normalAmount: "24000", normalCurrency: "EUR" }));
  });

  it("no rate: an inline error and Save is disabled", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/fx/rate") ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => ({}) },
    );
    render(<TestQueryProvider><CategorySlider {...base} mode="edit" initial={editInitial} /></TestQueryProvider>);
    pickCurrency("EUR");
    const errorEl = await screen.findByTestId("category-currency-error");
    expect(errorEl.className).toContain("text-destructive");
    expect(errorEl.textContent).toContain("PLN/EUR");
    expect((screen.getAllByRole("button").find((b) => b.getAttribute("type") === "submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
