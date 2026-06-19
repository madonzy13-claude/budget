/**
 * offline-readonly.test.ts — decision logic for the global offline READ-ONLY
 * layer. While offline (device-knows-offline), every WRITE control is blocked
 * and a bottom toast explains; navigation + viewing stay live. This is the pure,
 * DOM-only predicate the OfflineReadOnly listener consults — no React, no events.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { shouldBlockOfflineInteraction } from "../../src/lib/offline-readonly";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}
const q = (sel: string) => document.querySelector(sel) as Element;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("shouldBlockOfflineInteraction", () => {
  it("blocks text inputs", () => {
    mount(`<input id="x" />`);
    expect(shouldBlockOfflineInteraction(q("#x"))).toBe(true);
  });

  it("blocks textarea, select, checkbox, radio", () => {
    mount(`<textarea id="a"></textarea><select id="b"></select>
      <input type="checkbox" id="c"/><input type="radio" id="d"/>`);
    for (const id of ["#a", "#b", "#c", "#d"]) {
      expect(shouldBlockOfflineInteraction(q(id))).toBe(true);
    }
  });

  it("blocks ARIA toggles / sliders (switch, slider, spinbutton)", () => {
    mount(`<button role="switch" id="s"></button>
      <div role="slider" id="sl"></div><div role="spinbutton" id="sb"></div>`);
    for (const id of ["#s", "#sl", "#sb"]) {
      expect(shouldBlockOfflineInteraction(q(id))).toBe(true);
    }
  });

  it("blocks a custom combobox value-picker and its options (e.g. currency select)", () => {
    mount(`<button role="combobox" id="cb">USD</button>
      <div role="option" id="opt">EUR</div>`);
    expect(shouldBlockOfflineInteraction(q("#cb"))).toBe(true);
    expect(shouldBlockOfflineInteraction(q("#opt"))).toBe(true);
  });

  it("ALLOWS menuitem / menuitemradio (budget switcher navigates offline)", () => {
    mount(`<div role="menu"><button role="menuitem" id="mi">Settings</button>
      <button role="menuitemradio" id="mr">Other budget</button></div>`);
    expect(shouldBlockOfflineInteraction(q("#mi"))).toBe(false);
    expect(shouldBlockOfflineInteraction(q("#mr"))).toBe(false);
  });

  it("blocks a submit button and a child of it", () => {
    mount(
      `<form><button type="submit" id="save"><span id="lbl">Save</span></button></form>`,
    );
    expect(shouldBlockOfflineInteraction(q("#save"))).toBe(true);
    expect(shouldBlockOfflineInteraction(q("#lbl"))).toBe(true);
  });

  it("blocks anything marked data-offline-block (e.g. delete / drag handle)", () => {
    mount(`<button data-offline-block id="del">Delete</button>`);
    expect(shouldBlockOfflineInteraction(q("#del"))).toBe(true);
  });

  it("ALLOWS navigation links and their children", () => {
    mount(`<a href="/x" id="lnk"><span id="ic">go</span></a>`);
    expect(shouldBlockOfflineInteraction(q("#lnk"))).toBe(false);
    expect(shouldBlockOfflineInteraction(q("#ic"))).toBe(false);
  });

  it("ALLOWS plain nav/view buttons (type=button, not in a form)", () => {
    mount(`<button type="button" id="nav">Next month</button>
      <button id="open">Open sheet</button>`);
    expect(shouldBlockOfflineInteraction(q("#nav"))).toBe(false);
    expect(shouldBlockOfflineInteraction(q("#open"))).toBe(false);
  });

  it("ALLOWS controls inside a data-offline-ok region (e.g. quick-entry defers to its own dialog)", () => {
    mount(`<div data-offline-ok><input id="qe" /></div>`);
    expect(shouldBlockOfflineInteraction(q("#qe"))).toBe(false);
  });

  it("data-offline-ok wins even over a field selector on the element itself", () => {
    mount(`<input data-offline-ok id="ok" />`);
    expect(shouldBlockOfflineInteraction(q("#ok"))).toBe(false);
  });

  it("returns false for null / non-interactive targets", () => {
    mount(`<p id="p">read me</p>`);
    expect(shouldBlockOfflineInteraction(null)).toBe(false);
    expect(shouldBlockOfflineInteraction(q("#p"))).toBe(false);
  });
});
