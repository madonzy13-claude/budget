"use client";
/**
 * use-asset-keyboard-nav.ts — desktop keyboard navigation over the Assets
 * (Wallets) tab.
 *
 * A single imperative manager that walks a FLAT ordered list of `[data-nav-item]`
 * elements (rendered in DOM order across the spendings/cushion/reserve wallet
 * sections, then investments group headers + rows, then possessions, each
 * followed by its "add" button) and applies a hover-style highlight via a
 * `data-nav-highlighted` attribute. Actions are delegated to the elements' own
 * handlers by clicking marked sub-elements, so no keyboard state has to thread
 * through the three separate DnD contexts.
 *
 * Keys (desktop ≥md only, and only while focus is within the tab / not editing):
 *   ↑/↓            move the highlight (wrap); enters at an end from nothing.
 *   Enter          wallet/possession → edit amount; invest-group → toggle;
 *                  invest-row → open edit sheet; add-* → create / open.
 *   ←/→            wallet/possession → hop the active field name↔currency↔amount
 *                  (Enter then activates that field). Investments: ignored.
 *   Delete/Backspace  wallet/possession/invest-row → remove (with confirm).
 *
 * The tab root (rendered only after the data loads, so read FRESH each keypress)
 * is made focusable + focused on mount so the handler receives keys without a
 * first click.
 */
import { useEffect, useRef, type RefObject } from "react";
import { nextNavIndex, nextFieldIndex, NAV_FIELDS } from "@/lib/roving-index";
import { highlightNavItem, shouldGrabAssetFocus } from "@/lib/asset-nav-dom";

function isTextEntry(el: Element | null): boolean {
  const e = el as HTMLElement | null;
  return (
    !!e &&
    (e.tagName === "INPUT" ||
      e.tagName === "TEXTAREA" ||
      e.isContentEditable === true)
  );
}

export function useAssetKeyboardNav(rootRef: RefObject<HTMLElement | null>) {
  // Active field within the highlighted wallet/possession row (null = whole row).
  const fieldIdx = useRef<number | null>(null);

  useEffect(() => {
    const wide = () => window.matchMedia("(min-width: 768px)").matches;

    // Grab keyboard focus into the tab once its root exists (it renders after the
    // async data), retrying a few frames — same rationale as the spendings grid.
    let raf = 0;
    let tries = 0;
    const grab = () => {
      const root = rootRef.current;
      if (root) {
        // 260724 (task 1): arriving via a BDP pill CLICK leaves focus on the pill
        // button, so the old body-only check skipped the grab and ↑/↓ did nothing
        // until the user clicked the dark canvas. Grab whenever focus sits outside
        // the tab and isn't committed to real input (see shouldGrabAssetFocus).
        if (wide() && shouldGrabAssetFocus(document.activeElement, root)) {
          root.focus({ preventScroll: true });
        }
        return;
      }
      if (tries++ < 30) raf = requestAnimationFrame(grab);
    };
    raf = requestAnimationFrame(grab);

    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current; // FRESH — the root mounts after the skeleton
      if (!root || !wide()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ae = document.activeElement;
      // Defer to text editing and to open menus / dialogs / listboxes (Radix
      // currency dropdown owns its own ↑/↓/Enter while open).
      if (isTextEntry(ae)) return;
      if (
        (ae as HTMLElement | null)?.closest?.(
          "[role='dialog'],[role='menu'],[role='listbox'],[data-editing='true'],[data-radix-popper-content-wrapper]",
        )
      )
        return;
      // Only act while focus is within the tab (root focused/contains focus, or
      // nothing meaningful focused) — never hijack keys elsewhere on the page.
      if (
        ae &&
        ae !== document.body &&
        ae !== document.documentElement &&
        !root.contains(ae)
      )
        return;

      const items = () =>
        Array.from(root.querySelectorAll<HTMLElement>("[data-nav-item]"));
      const highlighted = () =>
        root.querySelector<HTMLElement>("[data-nav-highlighted]");
      const clearField = () => {
        root
          .querySelectorAll("[data-nav-field-active]")
          .forEach((el) => el.removeAttribute("data-nav-field-active"));
        fieldIdx.current = null;
      };
      const setHighlight = (el: HTMLElement | null) => {
        const prev = highlighted();
        if (prev && prev !== el) prev.removeAttribute("data-nav-highlighted");
        clearField();
        if (el) {
          el.setAttribute("data-nav-highlighted", "true");
          el.scrollIntoView({ block: "nearest" });
        }
      };
      const move = (dir: 1 | -1) => {
        const list = items();
        const cur = highlighted();
        const curIdx = cur ? list.indexOf(cur) : -1;
        const next = nextNavIndex(curIdx, list.length, dir);
        setHighlight(next >= 0 ? list[next]! : null);
      };
      const clickIn = (row: HTMLElement, selector: string) =>
        row.querySelector<HTMLElement>(selector)?.click();
      const activateField = (row: HTMLElement, idx: number) => {
        const field = NAV_FIELDS[idx];
        const cell = row.querySelector<HTMLElement>(
          `[data-nav-field="${field}"]`,
        );
        if (!cell) return;
        if (field === "currency") {
          cell.querySelector<HTMLElement>("button,[role='combobox']")?.click();
        } else if (field === "icon") {
          // 260724 (task 3/4): open the WalletCustomizer popover (its trigger is a
          // plain <button>) so Enter on the icon field pops the color/icon picker.
          cell.querySelector<HTMLElement>("button")?.click();
        } else {
          cell.querySelector<HTMLElement>("[role='button']")?.click();
        }
      };
      const markField = (row: HTMLElement, idx: number) => {
        clearField();
        fieldIdx.current = idx;
        row
          .querySelector(`[data-nav-field="${NAV_FIELDS[idx]}"]`)
          ?.setAttribute("data-nav-field-active", "true");
      };

      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
        return;
      }

      // 260724 (item 2): Escape dismisses the roving highlight + field ring. When
      // a Radix menu/dialog/customizer popover is open it owns Escape (the defer
      // guard above already returned), so the FIRST Escape closes that and a
      // SECOND clears the highlight — "after pressing Esc the highlight disappears".
      if (e.key === "Escape") {
        if (highlighted()) {
          e.preventDefault();
          setHighlight(null);
        }
        return;
      }

      const cur = highlighted();
      if (!cur) return;
      const type = cur.getAttribute("data-nav-type");
      const fielded = type === "wallet" || type === "possession";

      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!fielded) return; // investments: ←/→ do nothing
        e.preventDefault();
        fieldIdx.current = nextFieldIndex(
          fieldIdx.current,
          e.key === "ArrowRight" ? 1 : -1,
        );
        markField(cur, fieldIdx.current);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (fielded) {
          // Which field does Enter act on? The roving ring (fieldIdx) when set;
          // else the field whose control currently holds focus (Tab flow — e.g.
          // the icon button, so Enter OPENS the customizer, not just Space); else
          // default to editing the amount ("nothing highlighted in the row").
          let idx = fieldIdx.current;
          if (idx === null) {
            const cell = (ae as HTMLElement | null)?.closest?.(
              "[data-nav-field]",
            );
            const f =
              cell && cur.contains(cell)
                ? cell.getAttribute("data-nav-field")
                : null;
            idx = f ? (NAV_FIELDS as readonly string[]).indexOf(f) : -1;
            if (idx < 0) idx = (NAV_FIELDS as readonly string[]).indexOf("amount");
          }
          activateField(cur, idx);
          clearField(); // editor's own focus shows the field — drop the ring
        } else if (type === "invest-group") {
          clickIn(cur, "[data-nav-toggle]");
        } else if (type === "invest-row") {
          clickIn(cur, "[data-nav-open]");
        } else {
          // add-* → activate the button itself.
          (cur.matches("button,[role='button']")
            ? cur
            : cur.querySelector<HTMLElement>("button,[role='button']")
          )?.click();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          type === "wallet" ||
          type === "possession" ||
          type === "invest-row"
        ) {
          e.preventDefault();
          clickIn(cur, "[data-nav-delete]");
        }
        return;
      }
    };

    document.addEventListener("keydown", onKey, true);

    // A real pointer interaction ends keyboard mode — drop the highlight + any
    // field ring so nothing lingers (the reported "yellow border stays after
    // save"). Programmatic .click()s from the guided add chain fire `click`, not
    // `pointerdown`, so they don't trip this.
    const onPointerDown = () => {
      const root = rootRef.current;
      if (!root) return;
      root
        .querySelectorAll("[data-nav-highlighted],[data-nav-field-active]")
        .forEach((e) => {
          e.removeAttribute("data-nav-highlighted");
          e.removeAttribute("data-nav-field-active");
        });
      fieldIdx.current = null;
    };
    document.addEventListener("pointerdown", onPointerDown, true);

    // 260723-6: hovering a wallet/asset with the mouse moves the roving highlight
    // onto it (resetting the previous one) — exactly as ↑/↓ would. So the cursor
    // and the keyboard share one highlight; an arrow press after a hover steps
    // from the hovered row. Mouse only (touch/pen "hover" on tap is ignored), and
    // never while a field editor / dropdown / dialog owns focus.
    const onPointerOver = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !wide()) return;
      if (e.pointerType && e.pointerType !== "mouse") return;
      const ae = document.activeElement;
      if (isTextEntry(ae)) return;
      if (
        (ae as HTMLElement | null)?.closest?.(
          "[role='dialog'],[role='menu'],[role='listbox'],[data-editing='true'],[data-radix-popper-content-wrapper]",
        )
      )
        return;
      const item = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(
        "[data-nav-item]",
      );
      if (!item || !root.contains(item)) return;
      if (item.hasAttribute("data-nav-highlighted")) return; // already there
      highlightNavItem(root, item);
      fieldIdx.current = null;
    };
    document.addEventListener("pointerover", onPointerOver, true);

    // When an inline editor inside the tab commits (Enter/blur → focus returns to
    // <body>), clear the markers so nothing lingers after a save. Guarded to
    // `relatedTarget` being body/null so opening a Radix dropdown (focus → its
    // portal) during the guided add chain does NOT clear mid-flow.
    const onFocusOut = (e: FocusEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const rt = e.relatedTarget as Node | null;
      if (rt && rt !== document.body) return;
      const target = e.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;
      // Drop any field ring — the editor's own focus showed the field.
      root
        .querySelectorAll("[data-nav-field-active]")
        .forEach((el) => el.removeAttribute("data-nav-field-active"));
      fieldIdx.current = null;
      // 260724 (task 5): after committing an inline edit inside a wallet /
      // possession row (focus returns to <body>), KEEP that row highlighted on
      // desktop so focus visibly stays on the saved wallet instead of vanishing.
      const row = target.closest<HTMLElement>("[data-nav-item]");
      if (wide() && row && root.contains(row)) {
        highlightNavItem(root, row);
      } else {
        root
          .querySelectorAll("[data-nav-highlighted]")
          .forEach((el) => el.removeAttribute("data-nav-highlighted"));
      }
    };
    document.addEventListener("focusout", onFocusOut, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("focusout", onFocusOut, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}
