/**
 * oauth-consent.test.tsx — 15-09: the consent screen an MCP client sends the
 * user to. All-or-nothing, all budgets, submitted with fetch (CSP
 * form-action 'self' would block a native form's 302 to the client).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import en from "../messages/en.json";
import pl from "../messages/pl.json";
import uk from "../messages/uk.json";

vi.mock("next-intl", () => ({
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, string>) => {
      const node = (en as Record<string, Record<string, string>>)[ns]?.[key];
      if (typeof node !== "string") return `${ns}.${key}`;
      return node.replace(/\{(\w+)\}/g, (_, k: string) => vars?.[k] ?? "");
    },
}));

const { ConsentForm } = await import("../src/components/oauth/consent-form");

const assign = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  assign.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});

function clientInfo(status = 200) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/connected-apps/client/"))
      return new Response(
        JSON.stringify(
          status === 200
            ? {
                client_id: "c1",
                client_name: "Claude",
                redirect_hosts: ["claude.ai"],
              }
            : { error: "not_found" },
        ),
        { status },
      );
    if (String(url) === "/auth/oauth2/consent")
      return new Response(
        JSON.stringify({
          redirect: true,
          url: JSON.parse(String(init!.body)).accept
            ? "https://claude.ai/cb?code=x"
            : "https://claude.ai/cb?error=access_denied",
        }),
        { status: 200 },
      );
    throw new Error(`unexpected fetch ${url}`);
  });
}

const query = "client_id=c1&scope=read+offline_access&exp=1&sig=s";

describe("OAuth consent", () => {
  it("names the app and where it returns to, and covers all budgets", async () => {
    clientInfo();
    render(<ConsentForm clientId="c1" scope="read offline_access" query={query} />);
    expect(await screen.findByText(/Claude wants to connect/)).toBeTruthy();
    expect(screen.getByText(/claude\.ai/)).toBeTruthy();
    expect(screen.getByText(en.oauthConsent.allBudgets)).toBeTruthy();
  });

  it("shows only the read line for read, and both for read write", async () => {
    clientInfo();
    const { unmount } = render(
      <ConsentForm clientId="c1" scope="read offline_access" query={query} />,
    );
    await screen.findByText(en.oauthConsent.read);
    expect(screen.queryByText(en.oauthConsent.write)).toBeNull();
    unmount();
    render(<ConsentForm clientId="c1" scope="read write" query={query} />);
    await screen.findByText(en.oauthConsent.read);
    expect(screen.getByText(en.oauthConsent.write)).toBeTruthy();
  });

  it("Allow grants exactly the requested scope and follows the redirect", async () => {
    clientInfo();
    render(<ConsentForm clientId="c1" scope="read write offline_access" query={query} />);
    fireEvent.click(await screen.findByRole("button", { name: en.oauthConsent.allow }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://claude.ai/cb?code=x"));
    const [, init] = fetchMock.mock.calls.find(([u]) => u === "/auth/oauth2/consent")!;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      accept: true,
      scope: "read write offline_access",
      oauth_query: query,
    });
  });

  it("Deny sends accept:false and follows the redirect", async () => {
    clientInfo();
    render(<ConsentForm clientId="c1" scope="read" query={query} />);
    fireEvent.click(await screen.findByRole("button", { name: en.oauthConsent.deny }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://claude.ai/cb?error=access_denied"),
    );
  });

  it("an unknown client gets an error card and no Allow button", async () => {
    clientInfo(404);
    render(<ConsentForm clientId="nope" scope="read" query={query} />);
    expect(await screen.findByText(en.oauthConsent.unknownClient)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.oauthConsent.allow })).toBeNull();
  });

  it("has complete copy in every locale and never says draft", () => {
    const keys = Object.keys(en.oauthConsent).sort();
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const m of [pl, uk] as Array<Record<string, Record<string, string>>>) {
      expect(Object.keys(m.oauthConsent!).sort()).toEqual(keys);
    }
    const all = JSON.stringify([en, pl, uk].map((m) => m.oauthConsent)).toLowerCase();
    for (const w of ["draft", "чернетк", "szkic"]) expect(all).not.toContain(w);
  });
});
