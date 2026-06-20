import { describe, it, expect, vi } from "vitest";
import {
  reportApiUnreachable,
  reportApiOk,
  subscribeApiReachability,
} from "../../src/lib/api-unreachable-bus";

describe("api-unreachable-bus", () => {
  it("delivers 'unreachable' and 'ok' events to subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeApiReachability((e) => seen.push(e));
    reportApiUnreachable();
    reportApiOk();
    expect(seen).toEqual(["unreachable", "ok"]);
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const fn = vi.fn();
    const unsub = subscribeApiReachability(fn);
    unsub();
    reportApiUnreachable();
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multiple independent subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeApiReachability(a);
    const ub = subscribeApiReachability(b);
    reportApiOk();
    expect(a).toHaveBeenCalledWith("ok");
    expect(b).toHaveBeenCalledWith("ok");
    ua();
    ub();
  });
});
