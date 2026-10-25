/**
 * app-version-info.test.tsx — Settings shows which build is running, whether
 * it is the latest, and an "Update now" button only when it isn't (user, 261023).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const updateNow = vi.fn();
vi.mock("@/lib/app-update", async (orig) => ({
  ...(await orig<typeof import("@/lib/app-update")>()),
  updateNow: (id: string) => updateNow(id),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (k: string, v?: Record<string, string>) =>
    v ? `${k} ${Object.values(v).join(" ")}` : k,
}));

import { AppVersionInfo } from "../../../src/components/settings/app-version-info";
import {
  setLatestBuild,
  RUNNING_BUILD,
  APP_VERSION,
} from "../../../src/lib/app-update";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  updateNow.mockClear();
  act(() => setLatestBuild(null));
});

describe("AppVersionInfo", () => {
  it("shows the version and says it is the latest", () => {
    render(<AppVersionInfo />);
    act(() => setLatestBuild(RUNNING_BUILD));
    expect(screen.getByTestId("app-version")).toHaveTextContent(APP_VERSION);
    expect(screen.getByTestId("app-version-build")).toBeInTheDocument();
    expect(screen.getByTestId("app-version-status")).toHaveTextContent(
      "version.latest",
    );
    expect(screen.queryByTestId("app-update-now")).toBeNull();
  });

  it("offers Update now only when a newer build is out", () => {
    render(<AppVersionInfo />);
    act(() => setLatestBuild("a-newer-build"));
    expect(screen.getByTestId("app-version-status")).toHaveTextContent(
      "version.stale",
    );
    fireEvent.click(screen.getByTestId("app-update-now"));
    expect(updateNow).toHaveBeenCalledWith("a-newer-build");
  });
});
