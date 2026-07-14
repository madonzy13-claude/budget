import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { OwnerGate } from "@/components/settings/owner-gate";

// Bug #1: members are read-only on every settings section except notifications.
// OwnerGate wraps a section's controls in a native <fieldset disabled> so every
// input/switch/button inside is disabled for non-owners.
describe("OwnerGate", () => {
  it("disables the controls inside for a non-owner", () => {
    const { getByRole } = render(
      <OwnerGate isOwner={false}>
        <button role="switch">toggle</button>
      </OwnerGate>,
    );
    expect(getByRole("switch")).toBeDisabled();
  });

  it("leaves the controls enabled for an owner", () => {
    const { getByRole } = render(
      <OwnerGate isOwner={true}>
        <button role="switch">toggle</button>
      </OwnerGate>,
    );
    expect(getByRole("switch")).not.toBeDisabled();
  });
});
