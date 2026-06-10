# Phase 3: Navigation, Home & BDP Frame - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 3-Navigation, Home & BDP Frame
**Areas discussed:** Tab frame: sticky pills & mobile, Budget switcher dropdown UX, Task banner shell behavior, Home cards: layout & data shape

---

## Tab frame: sticky pills & mobile

### Sticky behavior

| Option                           | Description                                                                                                                                           | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Always sticky under header       | Pills pinned at `top:64px` under top-nav. Matches v1.1-SPEC §2 literally. Single CSS `position: sticky`. Task banner sticks with them.                | ✓        |
| Scroll-aware: shrink/hide        | Pills full-height initially; shrink/hide on scroll. More JS (IntersectionObserver). Risk of misread when user wants direct tab access while scrolled. |          |
| Sticky pills + non-sticky banner | Pills pin; banner scrolls away. Cleaner real-estate but banner becomes invisible mid-scroll.                                                          |          |

**User's choice:** Always sticky under header

### Active-pill yellow-accent treatment

| Option                              | Description                                                                                                                                | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Filled pill: yellow bg + black text | Direct application of `button-primary` styling at pill scale. Highest contrast, matches Binance yellow+black combo. Inactive: transparent. | ✓        |
| Outline + yellow text               | Active pill keeps dark surface, gains 1px yellow border + yellow text. Quieter; risks blending with hairlines.                             |          |
| Bottom indicator bar only           | 2px yellow underline. Common Material pattern but doesn't read as "pill" — conflicts with `pill-style` wording in REQUIREMENTS BDP-01/04.  |          |

**User's choice:** Filled pill: yellow bg + black text

### Mobile (≤ 480px) tab strip

| Option                            | Description                                                                                       | Selected |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Horizontal scroll with snap       | Full text labels, `overflow-x: auto`, `scroll-snap-align`. Touch-native, no info loss.            |          |
| Equal-width 4-up, smaller text    | Cram 4 pills into viewport with smaller type. Risky for 360px screens; PL/UK labels may overflow. |          |
| Icon + label collapse below 480px | Icon-only for inactive pills, label for active. Saves space; needs icon set + a11y tooltips.      | ✓        |

**User's choice:** Icon + label collapse below 480px
**Notes:** Lucide icons used: LayoutGrid (Spendings), Coins (Reserves), Wallet (Wallets), Settings. 44×44 px tap target enforced.

### Sub-route navigation

| Option                                      | Description                                                                                                                                             | Selected |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Full Next.js routes per tab                 | `/budgets/[id]/[tab]/page.tsx`; shared `layout.tsx` carries pills + banner. RSC server-renders the active tab. Browser back/forward respects each step. | ✓        |
| Single page + query param `?tab=spendings`  | One page; tab state in URL query. BDP-05 prefers path segments.                                                                                         |          |
| Shallow routing inside a single client page | `history.replaceState` to swap path without re-rendering RSC. Breaks RSC per tab — not desirable for Phase 4 grid.                                      |          |

**User's choice:** Full Next.js routes per tab

---

## Budget switcher dropdown UX

### Dropdown interaction pattern

| Option                                        | Description                                                                                                          | Selected |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| Plain Popover with grouped lists              | Two labeled sections `Personal` / `Shared`. No search input. Most households < 10 budgets.                           | ✓        |
| Command-palette searchable (cmdk)             | `command.tsx` already in `ui/`. Search across groups. Power-user feel; adds top-nav weight. Better for > 20 budgets. |          |
| Hybrid: groups + search only when > 7 budgets | Conditional render. Smartest but adds branching logic + tests for two states.                                        |          |

**User's choice:** Plain Popover with grouped lists

### Active-budget indicator

| Option                      | Description                                                                                    | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Checkmark icon left of name | Lucide `Check` glyph in leading slot. Matches Radix dropdown-menu native a11y convention.      | ✓        |
| Yellow text + bold name     | Row recoloured to `{colors.primary}`. Conflicts with DESIGN.md "yellow scarcity" rule.         |          |
| Left yellow border bar      | 2px yellow indicator on row's left edge. Introduces a new visual primitive not used elsewhere. |          |

**User's choice:** Checkmark icon left of name

### `+ New budget` button placement

| Option                             | Description                                                                                                            | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Round icon button right of trigger | On nav bar, immediately right of switcher trigger. Always visible, single click to wizard. Satisfies NAV-03 literally. | ✓        |
| Pinned footer row inside dropdown  | Bottom of dropdown panel. Subtle violation of NAV-03 wording ("not as a list item").                                   |          |
| Sticky header row above groups     | Top of dropdown. Same NAV-03 ambiguity.                                                                                |          |

**User's choice:** Round icon button right of trigger

### Mobile switcher pattern

| Option                              | Description                                                                                                                                             | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Same popover anchored to trigger    | Radix Popover collapses to viewport-width on mobile. Familiar, fast, matches Binance mobile-nav.                                                        | ✓        |
| Full-screen Sheet (drawer from top) | Slide-down `Sheet` covering header. More room for groups but visually heavy. Existing `workspace-switcher.tsx` Sheet pattern — would be migrating away. |          |
| Bottom sheet (drawer from bottom)   | Thumb-reachable but inconsistent with desktop popover pattern — two mental models per breakpoint.                                                       |          |

**User's choice:** Same popover anchored to trigger

---

## Task banner shell behavior

### Data fetch strategy

User initially asked for pros/cons before deciding. After analysis:

| Option                              | Description                                                                                                                        | Selected |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RSC initial + client poll every 60s | Initial paint shows real count (no CLS). Polling pauses on hidden tab via `visibilitychange`. Cheap, predictable; up to 60s stale. | ✓        |
| RSC initial + poll every 15s        | 4× request load. Snappier feedback without SSE.                                                                                    |          |
| Build SSE now                       | Hono SSE + LISTEN/NOTIFY + pg-boss emit + PWA fallback. Real-time at cost of Phase 3 scope and Phase 8 PWA planning.               |          |

**User's choice:** RSC initial + client poll every 60s
**Notes:** User favored SSE initially. Pros/cons analysis showed Phase 7 generators run on cron (`0 6 * * *`, month-end) — most tasks arrive on a schedule that doesn't need sub-minute freshness. Swap is contained to a single hook; SSE remains a Phase 8 candidate (deferred).

### Empty-state behavior

| Option                                   | Description                                                                                            | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Banner hidden entirely                   | Zero visual weight when nothing's pending. Matches v1.1-SPEC §2 + BDP-03 wording.                      | ✓        |
| `All clear ✓` rendered as quiet info row | Always-visible banner area; flips between alert and confirmation. More chrome; risks banner-blindness. |          |
| Hidden default + toggle in header        | User opens it explicitly. Adds discovery friction.                                                     |          |

**User's choice:** Banner hidden entirely

### Expand interaction

| Option                                        | Description                                                                                    | Selected |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Inline accordion under banner                 | Height animates open; task rows render in-flow. Matches v1.1-SPEC §2 ("expandable into list"). | ✓        |
| Slide-down overlay drawer                     | Overlay covers tabs. Loses context.                                                            |          |
| Route to dedicated `/budgets/[id]/tasks` page | Full nav away. Conflicts with BDP-03 wording.                                                  |          |

**User's choice:** Inline accordion under banner

### Task row contents

| Option                                                  | Description                                                                                              | Selected |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Title + kind chip + disabled action button              | Title binds to `t('tasks.title.${kind}')`. Disabled button placeholder. Forward-compatible with Phase 7. | ✓        |
| Title-only rows, no action buttons                      | Smallest shell; Phase 7 adds buttons. Risks layout shift later.                                          |          |
| Full mock action buttons that toast "Coming in Phase 7" | Feels broken in UAT.                                                                                     |          |

**User's choice:** Title + kind chip + disabled action button

---

## Home cards: layout & data shape

### Grid layout / responsive breakpoints

| Option                     | Description                                                                   | Selected |
| -------------------------- | ----------------------------------------------------------------------------- | -------- |
| 1/2/3 col responsive grid  | 1 col < 640px, 2 cols 640–1023px, 3 cols ≥ 1024px. CSS Grid auto-fill minmax. | ✓        |
| Always single-column stack | Vertical list, full-width cards. Wastes desktop real estate.                  |          |
| Masonry / asymmetric       | Variable card heights. Conflicts with DESIGN.md rectilinear card precedents.  |          |

**User's choice:** 1/2/3 col responsive grid

### Card content density

| Option                                              | Description                                                                                              | Selected |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Sectioned card: header + stat row + overspent strip | Top: name + private/shared + type badge. Middle: spent + wallets value. Bottom: top-1–2-overspent strip. | ✓        |
| Compact stat tile                                   | Single big number + name. Loses overspent visibility.                                                    |          |
| Feature card with chart preview                     | Mini sparkline. Out of scope for Phase 3 (HOME-04 chart = placeholder).                                  |          |

**User's choice:** Sectioned card

### Data fetching shape

| Option                                      | Description                                                                                                                                               | Selected |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RSC parallel-Suspense per card              | Each `<BudgetCard>` is async RSC fetching its own `/home-summary`. Suspense per card → stream in as data arrives. One slow budget doesn't block siblings. | ✓        |
| Single `/me/home` aggregated endpoint       | Fewer round-trips but couples N budgets' latency together.                                                                                                |          |
| RSC: budgets list → client-fetched per-card | Worst of both: layout shift + N round-trips.                                                                                                              |          |

**User's choice:** RSC parallel-Suspense per card

### FX conversion path (total wallets value in `display_currency`)

| Option                                                     | Description                                                                                                                               | Selected |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Server: per-card endpoint converts using budget's FX rates | Backend pulls latest `fx_rate` (Phase 2 fxProvider) and emits `{wallets_value_in_display_ccy}`. Money math stays behind adapter boundary. | ✓        |
| Client-side: shared `useDisplayFx` hook                    | Endpoint returns raw `{wallet_ccy, amount_cents}`; client converts. Violates `Money` value-object boundary in CLAUDE.md.                  |          |
| Hybrid: server returns both original sums + converted      | Useful for tooltips later. Over-spec for Phase 3.                                                                                         |          |

**User's choice:** Server: per-card endpoint converts

---

## Claude's Discretion

- Placeholder chart shape — CSS box with `min-height: 240px`, hairline border, centered `home.chart.placeholder` i18n string. No chart lib added.
- Whole-card click affordance — `<Link>` wrapping the card with hover state. No explicit CTA button inside card.
- Empty home state (zero budgets) — hero "Create your first budget" block linking to `/budgets/new`, replacing the cards grid.
- Private/shared icon glyph — lucide `Lock` (Private) / `Users` (Shared).
- Currency code badge inside switcher dropdown row — small monospace `Badge` with 3-letter code.
- Mobile icon-only pill tap target — 44×44 px minimum.
- React Query as client-fetch lib for the polling wrapper (likely needed in Phase 4 too).
- Whether to introduce a dedicated `BudgetHomeSummaryRepo` port vs composing existing `WalletRepo` / `TransactionRepo` aggregations — researcher / planner decide.

## Deferred Ideas

- **Home dashboard v2 — custom tile list** (user request 2026-05-12): user will hand a specific tile list later. Current sectioned-card layout is provisional scaffold.
- **Real-time task banner (SSE)** — Phase 8 candidate if 60s poll feels stale post-launch.
- **Searchable budget switcher (cmdk)** — defer until any single user owns > 15 budgets.
- **Per-card chart sparkline** — out of scope (HOME-04 = placeholder); Phase 8+ Insights surface.
- **Scroll-aware sticky shrink for pills** — rejected for v1.1; revisit only if mobile vertical-space pressure surfaces in usability testing.
