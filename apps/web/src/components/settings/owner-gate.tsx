import type { ReactNode } from "react";

/**
 * Makes a settings section read-only for non-owners (bug #1: members may only
 * edit Notifications). Uses a native `<fieldset disabled>`, which propagates the
 * disabled state to every descendant form control — including Radix switches
 * (rendered as buttons) — so we don't have to thread a prop through each section.
 * The header/trigger stays outside the gate, so members can still expand and read
 * every section; they just can't change anything.
 */
export function OwnerGate({
  isOwner,
  children,
}: {
  isOwner: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={!isOwner}
      className="m-0 min-w-0 border-0 p-0 disabled:opacity-70"
    >
      {children}
    </fieldset>
  );
}
