import { describe, it, expect, beforeEach } from "vitest";
import { shouldGrabAssetFocus } from "@/lib/asset-nav-dom";

describe("shouldGrabAssetFocus", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.setAttribute("data-testid", "assets-nav-root");
    document.body.appendChild(root);
  });

  it("grabs when nothing is focused (null / body)", () => {
    expect(shouldGrabAssetFocus(null, root)).toBe(true);
    expect(shouldGrabAssetFocus(document.body, root)).toBe(true);
  });

  it("grabs when a BDP pill button (outside the tab) holds focus", () => {
    const pill = document.createElement("button");
    pill.textContent = "Wallets";
    document.body.appendChild(pill);
    expect(shouldGrabAssetFocus(pill, root)).toBe(true);
  });

  it("does NOT grab from a text input (user is typing)", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(shouldGrabAssetFocus(input, root)).toBe(false);
  });

  it("does NOT grab while a listbox / dialog owns focus", () => {
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    const opt = document.createElement("div");
    listbox.appendChild(opt);
    document.body.appendChild(listbox);
    expect(shouldGrabAssetFocus(opt, root)).toBe(false);
  });

  it("does NOT grab when focus is already inside the tab", () => {
    const inner = document.createElement("button");
    root.appendChild(inner);
    expect(shouldGrabAssetFocus(inner, root)).toBe(false);
  });
});
