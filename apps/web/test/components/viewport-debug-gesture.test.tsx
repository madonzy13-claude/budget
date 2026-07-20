/**
 * viewport-debug-gesture.test.tsx — hidden vpdbg toggle: 13 RAPID taps on the
 * profile-menu trigger flip the persisted flag. Push deep-links proved
 * unreliable on device and standalone PWA has no URL bar; the tap count is
 * deliberately absurd so it can never fire accidentally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { ViewportDebug } from "../../src/components/common/viewport-debug";

function renderWithTrigger() {
  return render(
    <div>
      <header>
        <button data-testid="profile-menu-trigger">
          <span data-testid="avatar-initials">AY</span>
        </button>
        <button data-testid="other-button">menu</button>
      </header>
      <ViewportDebug />
    </div>,
  );
}

function tap(el: Element, times: number, gapMs = 100) {
  for (let i = 0; i < times; i++) {
    fireEvent.click(el);
    act(() => vi.advanceTimersByTime(gapMs));
  }
}

describe("vpdbg 13-tap profile toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("13 rapid taps on the profile trigger flip the flag on", () => {
    const { getByTestId } = renderWithTrigger();
    tap(getByTestId("avatar-initials"), 13);
    expect(localStorage.getItem("vpdbg")).toBe("1");
  });

  it("12 rapid taps do NOT toggle", () => {
    const { getByTestId } = renderWithTrigger();
    tap(getByTestId("avatar-initials"), 12);
    expect(localStorage.getItem("vpdbg")).toBeNull();
  });

  it("a slow gap resets the count", () => {
    const { getByTestId } = renderWithTrigger();
    tap(getByTestId("avatar-initials"), 8);
    act(() => vi.advanceTimersByTime(2000)); // user paused — chain broken
    tap(getByTestId("avatar-initials"), 8);
    expect(localStorage.getItem("vpdbg")).toBeNull();
  });

  it("rapid taps elsewhere do NOT toggle", () => {
    const { getByTestId } = renderWithTrigger();
    tap(getByTestId("other-button"), 13);
    expect(localStorage.getItem("vpdbg")).toBeNull();
  });

  it("13 rapid taps flip the flag back off", () => {
    localStorage.setItem("vpdbg", "1");
    const { getByTestId } = renderWithTrigger();
    tap(getByTestId("avatar-initials"), 13);
    expect(localStorage.getItem("vpdbg")).toBe("0");
  });
});
