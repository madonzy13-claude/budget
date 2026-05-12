/**
 * tabs-pill.test.tsx — Vitest coverage for the new `variant="pill"`
 * extension on the Tabs primitive. Underline is the default variant; existing
 * consumers (e.g. /settings) must not regress.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("Tabs primitive — variant prop", () => {
  it('variant="pill" renders TabsList + TabsTrigger with pill-shaped classes', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList variant="pill">
          <TabsTrigger variant="pill" value="a">
            A
          </TabsTrigger>
          <TabsTrigger variant="pill" value="b">
            B
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list).toBeTruthy();
    // Pill list geometry (h-12, gap-2 — no underline border).
    expect(list!.className).toMatch(/h-12/);
    expect(list!.className).not.toMatch(/border-b/);

    const triggers = container.querySelectorAll('[role="tab"]');
    expect(triggers.length).toBe(2);
    // Active pill trigger should carry pill-shaped active state class (yellow primary bg).
    const active = container.querySelector(
      '[role="tab"][data-state="active"]',
    ) as HTMLElement;
    expect(active).toBeTruthy();
    expect(active.className).toMatch(/rounded-\[var\(--radius-pill\)\]/);
    expect(active.className).toMatch(
      /data-\[state=active\]:bg-\[var\(--primary\)\]/,
    );
  });

  it("variant prop defaults to underline (existing settings-page consumer renders unchanged)", () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list).toBeTruthy();
    // Underline variant retains border-b.
    expect(list!.className).toMatch(/border-b/);
    expect(list!.className).not.toMatch(/h-12/);
  });
});
