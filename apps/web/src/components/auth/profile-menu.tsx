"use client";

/**
 * profile-menu.tsx — top-nav profile dropdown.
 *
 * Hand-rolled (not Radix DropdownMenu) because the Radix Content is
 * portaled outside the trigger's DOM tree, which makes cursor transit
 * between trigger and menu inherently fragile: the trigger's hover
 * region ends a few pixels before the portaled menu begins, so
 * onMouseLeave fires on the trigger even when traveling TO the menu.
 * That produced visible open/close pulsing.
 *
 * This implementation places the menu as a positioned descendant of
 * the trigger wrapper. Hover handlers live on the wrapper, so a cursor
 * moving from the avatar down into the menu stays inside one hover
 * region the whole way — no portal gap, no false leave events.
 *
 * Behaviour matrix:
 *   * Desktop hover (fine + hover-capable pointer):
 *       - mouseenter on wrapper → open (immediate)
 *       - mouseleave on wrapper → close after 150 ms grace
 *   * Mobile tap / desktop click:
 *       - button click → toggle open/closed
 *   * Outside click → close
 *   * Esc key  → close (and refocus trigger)
 *   * Selecting a link or Sign out → close
 *
 * Accessibility:
 *   * Trigger reports aria-haspopup + aria-expanded.
 *   * Menu has role=menu; items role=menuitem.
 *   * Esc closes and returns focus to the trigger.
 *   * Open via keyboard still works through the click handler bound on
 *     the trigger (Enter / Space).
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { NavLink } from "@/components/common/nav-link";
import { useTranslations } from "next-intl";
import { LogOut, User, Settings as SettingsIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export interface ProfileMenuProps {
  locale: string;
  user: {
    name: string;
    email: string;
  };
}

function initialsOf(name: string, email: string): string {
  const source = (name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function ProfileMenu({ locale, user }: ProfileMenuProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportsHover = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      supportsHover.current = window.matchMedia(
        "(hover: hover) and (pointer: fine)",
      ).matches;
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Outside click closes the menu. The check runs on `pointerdown` so a
  // tap on a child triggers BEFORE the link navigation handler — we
  // only close when the target is truly outside our wrapper.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      if (e.target instanceof Node && wrapper.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Esc closes the menu and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    // 150 ms is enough to forgive an accidental excursion (e.g. mouse
    // wobble on a trackpad) but short enough to feel snappy on
    // intentional exits. No portal gap here so the grace doesn't need
    // to bridge a transit — it only needs to ignore micro-movements.
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  function handleMouseEnter() {
    if (!supportsHover.current) return;
    cancelClose();
    setOpen(true);
  }

  function handleMouseLeave() {
    if (!supportsHover.current) return;
    scheduleClose();
  }

  function handleTriggerClick() {
    // Always OPEN on click (don't toggle). Playwright's `.click()` action
    // synthesises a mouseenter+click sequence on hover-capable browsers,
    // so `toggle` would: hover → open → click → close — the user (or test)
    // never sees the menu. Close paths: outside-click handler, Esc key,
    // mouseleave grace timer. The trigger's job is purely to OPEN — this
    // also matches the WAI-ARIA Authoring Practices for menu buttons
    // (Enter/Space/Click → open; Esc → close).
    setOpen(true);
  }

  function handleTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.push(`/${locale}/sign-in`);
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  const initials = initialsOf(user.name, user.email);

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative inline-flex"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("profile_menu_aria")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="profile-menu-trigger"
        data-state={open ? "open" : "closed"}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className="group inline-flex h-10 w-10 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas-dark)]"
      >
        <Avatar className="h-8 w-8 ring-1 ring-[var(--hairline-on-dark)] group-data-[state=open]:ring-[var(--primary)]">
          <AvatarFallback className="bg-[var(--surface-elevated-dark)] text-xs font-semibold text-[var(--body-on-dark)]">
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("profile_menu_aria")}
          // Positioned IMMEDIATELY below the trigger inside the same
          // wrapper. No portal, no transit gap. mt-1 is the visual
          // gap (4 px) — the wrapper still encloses both elements as
          // far as the hover region is concerned because mouse events
          // continue through the small spacer.
          //
          // z-50 keeps the menu above sticky page chrome (BDP tab
          // bar z-40, header z-40).
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-[14rem]",
            "rounded-md border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] p-1.5 text-[var(--body-on-dark)] shadow-xl",
          )}
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold leading-tight text-[var(--body-on-dark)]">
              {user.name || user.email}
            </p>
            {user.name && (
              <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                {user.email}
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-[var(--hairline-on-dark)]" />
          <NavLink
            href={`/${locale}/settings`}
            role="menuitem"
            data-testid="profile-menu-profile"
            onClick={() => setOpen(false)}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-[var(--surface-elevated-dark)]"
          >
            <User className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span>{t("profile")}</span>
          </NavLink>
          <NavLink
            href={`/${locale}/settings`}
            role="menuitem"
            data-testid="profile-menu-settings"
            onClick={() => setOpen(false)}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-[var(--surface-elevated-dark)]"
          >
            <SettingsIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span>{t("settings")}</span>
          </NavLink>
          <div className="my-1 h-px bg-[var(--hairline-on-dark)]" />
          <button
            type="button"
            role="menuitem"
            data-testid="profile-menu-sign-out"
            disabled={isSigningOut}
            onClick={() => {
              setOpen(false);
              void handleSignOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--trading-down)] hover:bg-[var(--trading-down)]/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            <span>{t("sign_out")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
