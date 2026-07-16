/**
 * viewport-debug-gesture.test.tsx — hidden long-press toggle for the vpdbg
 * overlay. Push deep-links proved unreliable on device and standalone PWA has
 * no URL bar, so a 1.2s hold on an empty header spot flips the persisted flag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { ViewportDebug } from "../../src/components/common/viewport-debug";

function renderWithHeader() {
  return render(
    <div>
      <header data-testid="hdr">
        <span data-testid="hdr-bg">Budget</span>
        <button data-testid="hdr-btn">menu</button>
      </header>
      <ViewportDebug />
    </div>,
  );
}

describe("vpdbg long-press toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1.2s hold on header background flips the flag on", () => {
    const { getByTestId } = renderWithHeader();
    fireEvent.pointerDown(getByTestId("hdr-bg"));
    act(() => vi.advanceTimersByTime(1300));
    expect(localStorage.getItem("vpdbg")).toBe("1");
  });

  it("hold on an interactive header child does NOT toggle", () => {
    const { getByTestId } = renderWithHeader();
    fireEvent.pointerDown(getByTestId("hdr-btn"));
    act(() => vi.advanceTimersByTime(1300));
    expect(localStorage.getItem("vpdbg")).toBeNull();
  });

  it("releasing before 1.2s does NOT toggle", () => {
    const { getByTestId } = renderWithHeader();
    fireEvent.pointerDown(getByTestId("hdr-bg"));
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(getByTestId("hdr-bg"));
    act(() => vi.advanceTimersByTime(1000));
    expect(localStorage.getItem("vpdbg")).toBeNull();
  });

  it("second long-press flips the flag back off", () => {
    localStorage.setItem("vpdbg", "1");
    const { getByTestId } = renderWithHeader();
    fireEvent.pointerDown(getByTestId("hdr-bg"));
    act(() => vi.advanceTimersByTime(1300));
    expect(localStorage.getItem("vpdbg")).toBe("0");
  });
});
