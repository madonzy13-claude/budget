/**
 * connected-apps.test.tsx — 15-11: Settings → Connected apps (D-21).
 * List + Disconnect only: no activity history, no "via", no undo.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import en from "../messages/en.json";
import pl from "../messages/pl.json";
import uk from "../messages/uk.json";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, string>) => {
      let node: unknown = en;
      for (const part of `${ns}.${key}`.split(".")) node = (node as Record<string, unknown>)?.[part];
      if (typeof node !== "string") return `${ns}.${key}`;
      return node.replace(/\{(\w+)\}/g, (_, k: string) => vars?.[k] ?? "");
    },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { apiFetch, apiWrite } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiWrite: vi.fn(),
}));
vi.mock("@/lib/budget-fetch", () => ({ clientApiFetch: apiFetch }));
vi.mock("@/lib/offline-write", () => ({
  clientApiWrite: apiWrite,
  isOfflineWriteError: () => false,
}));

const { ConnectedAppsSection } = await import(
  "@/components/settings/connected-apps-section"
);

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

const t = en.settings.connectedApps;
const two = [
  {
    client_id: "c1",
    client_name: "Claude",
    scopes: ["read", "write"],
    connected_at: "2026-11-01T10:00:00.000Z",
    last_used_at: "2026-11-05T15:30:00.000Z",
  },
  {
    client_id: "c2",
    client_name: "Cursor",
    scopes: ["read"],
    connected_at: "2026-10-01T08:00:00.000Z",
    last_used_at: null,
  },
];

function list(connections: unknown[]) {
  apiFetch.mockResolvedValue(
    new Response(JSON.stringify({ connections }), { status: 200 }),
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  apiWrite.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("Connected apps", () => {
  test("lists each app with dates in the user's locale and a Disconnect button", async () => {
    list(two);
    renderWithClient(<ConnectedAppsSection />);
    expect(await screen.findByText("Claude")).toBeTruthy();
    expect(screen.getByText("Cursor")).toBeTruthy();
    const fmt = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      hourCycle: "h23",
    });
    expect(screen.getByText(new RegExp(fmt.format(new Date(two[0]!.last_used_at!)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
    expect(screen.getByText(t.neverUsed, { exact: false })).toBeTruthy();
    expect(screen.getByTestId("disconnect-c1")).toBeTruthy();
    expect(screen.getByTestId("disconnect-c2")).toBeTruthy();
  });

  test("Disconnect asks first, deletes, removes the row and confirms", async () => {
    list(two);
    apiWrite.mockResolvedValue(new Response(null, { status: 204 }));
    renderWithClient(<ConnectedAppsSection />);
    fireEvent.click(await screen.findByTestId("disconnect-c1"));
    fireEvent.click(await screen.findByTestId("confirm-action"));
    await waitFor(() =>
      expect(apiWrite).toHaveBeenCalledWith("/settings/connected-apps/c1", {
        method: "DELETE",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Claude")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith(t.disconnected);
  });

  test("a failed Disconnect keeps the row and says so", async () => {
    list(two);
    apiWrite.mockResolvedValue(new Response("{}", { status: 400 }));
    renderWithClient(<ConnectedAppsSection />);
    fireEvent.click(await screen.findByTestId("disconnect-c2"));
    fireEvent.click(await screen.findByTestId("confirm-action"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.error));
    expect(screen.getByText("Cursor")).toBeTruthy();
  });

  test("the empty state tells the user which URL to add", async () => {
    list([]);
    renderWithClient(<ConnectedAppsSection />);
    expect(
      await screen.findByText(`${window.location.origin}/mcp`, { exact: false }),
    ).toBeTruthy();
  });

  test("says nothing about agent activity in any locale", async () => {
    list(two);
    const { container } = renderWithClient(<ConnectedAppsSection />);
    await screen.findByText("Claude");
    const dom = container.textContent!.toLowerCase();
    for (const w of ["via ", "undo", "draft"]) expect(dom).not.toContain(w);
    const copy = JSON.stringify(
      [en, pl, uk].map((m) => (m as typeof en).settings.connectedApps),
    ).toLowerCase();
    for (const w of ["via ", "undo", "draft", "чернетк", "szkic", "cofn", "скас"])
      expect(copy).not.toContain(w);
    for (const m of [pl, uk] as Array<typeof en>) {
      expect(Object.keys(m.settings.connectedApps).sort()).toEqual(
        Object.keys(t).sort(),
      );
      expect(m.settings.user.sections.connectedApps).toBeTruthy();
    }
    within(container);
  });
});
