"use client";
/**
 * nav-link.tsx — Drop-in replacement for `next/link` that opts the chrome
 * into the NavPendingProvider blur-overlay flow.
 *
 * On a plain left-click (no modifier keys, primary button), the wrapper
 * calls `startNav(href)` BEFORE next/link's own navigation runs — so the
 * blur overlay activates the same paint as the URL bar updates. Modifier
 * clicks (cmd/ctrl/shift/middle button) fall through unchanged so
 * open-in-new-tab still works.
 *
 * `href` accepts the same shape as next/link (string | UrlObject). When
 * passed a UrlObject we serialise to a string for the pending key, which
 * is good enough for the prefix-match used by the provider.
 */
import * as React from "react";
import Link, { type LinkProps } from "next/link";
import type { UrlObject } from "url";
import { useNavPending } from "./nav-pending";

type Href = LinkProps["href"];

function hrefToString(href: Href): string {
  if (typeof href === "string") return href;
  // next/link's UrlObject ships through node's `url` types; we only
  // need the pathname for prefix matching, the rest is irrelevant to
  // the overlay decision.
  const u = href as UrlObject;
  return u.pathname ?? "/";
}

type Props = LinkProps & {
  className?: string;
  children?: React.ReactNode;
} & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof LinkProps | "ref"
  >;

export const NavLink = React.forwardRef<HTMLAnchorElement, Props>(
  function NavLink({ href, onClick, children, ...rest }, ref) {
    const { startNav } = useNavPending();

    function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
      // Honour platform conventions: open-in-new-tab, etc. should not
      // trigger our overlay — the current page isn't transitioning.
      const isModified =
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        rest.target === "_blank";
      if (!isModified) {
        startNav(hrefToString(href));
      }
      onClick?.(e);
    }

    return (
      <Link href={href} {...rest} onClick={handleClick} ref={ref}>
        {children}
      </Link>
    );
  },
);
