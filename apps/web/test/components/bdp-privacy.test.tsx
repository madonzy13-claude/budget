import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  BdpUiStateProvider,
  usePrivacyReveal,
} from "@/components/budgeting/bdp-ui-state";

function Probe() {
  const { revealed, toggle } = usePrivacyReveal();
  return (
    <div>
      <span data-testid="state">{revealed ? "shown" : "hidden"}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <BdpUiStateProvider>
      <Probe />
    </BdpUiStateProvider>,
  );

describe("privacy reveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("defaults to hidden and toggles both ways", () => {
    renderProbe();
    expect(screen.getByTestId("state").textContent).toBe("hidden");
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("state").textContent).toBe("shown");
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("state").textContent).toBe("hidden");
  });

  it("auto-hides after 30 minutes of inactivity", () => {
    renderProbe();
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("state").textContent).toBe("shown");
    act(() => vi.advanceTimersByTime(30 * 60 * 1000));
    expect(screen.getByTestId("state").textContent).toBe("hidden");
  });

  it("resets the 30-minute countdown on user activity", () => {
    renderProbe();
    act(() => screen.getByText("toggle").click());
    act(() => vi.advanceTimersByTime(29 * 60 * 1000));
    // Activity near the deadline restarts the countdown.
    act(() => window.dispatchEvent(new Event("pointerdown")));
    act(() => vi.advanceTimersByTime(29 * 60 * 1000));
    expect(screen.getByTestId("state").textContent).toBe("shown");
    // ...and only fires 30 min after the LAST activity.
    act(() => vi.advanceTimersByTime(2 * 60 * 1000));
    expect(screen.getByTestId("state").textContent).toBe("hidden");
  });
});
