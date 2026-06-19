---
phase: 8
slug: pwa-offline-push-i18n-e2e-hardening
status: approved
reviewed_at: 2026-06-10T16:12:00Z
shadcn_initialized: true
preset: "style=new-york, baseColor=zinc, rsc=true, cssVariables=true, prefix=''"
created: 2026-06-10
requirements_covered:
  - PWAX-01
  - PWAX-02
  - PWAX-03
  - PWAX-04
  - PWAX-05
  - PWAX-06
  - I18N-01
  - I18N-02
  - I18N-03
  - I18N-04
  - I18N-05
  - E2EX-01
  - E2EX-02
  - E2EX-03
  - E2EX-04
  - E2EX-05
source_of_truth:
  - DESIGN.md
  - apps/web/src/app/global.css
  - .planning/phases/08-pwa-offline-push-i18n-e2e-hardening/08-CONTEXT.md
  - .planning/phases/08-pwa-offline-push-i18n-e2e-hardening/08-RESEARCH.md
  - .planning/phases/07-tasks-queue/07-UI-SPEC.md
---

# Phase 8 — UI Design Contract: PWA, Offline, Push, i18n & E2E Hardening

> **⚠️ OFFLINE COMPONENTS SUPERSEDED (2026-06-16/17, `tasks-redesign` SPA/SWR refactor).**
> Two of the "5 new components" below were **deleted** and one extension reverted:
> the **offline-status-badge** and **sync-issues-list** are gone (no more offline
> write-queue/replay), and the spendings-row **pending-sync marker** is gone (offline
> WRITE is now an honest POST + rollback-toast). The offline-read cache-age UI is no
> longer a per-view "last synced X ago" staleness marker — it's a single full-width
> **`OfflineStaleBar`** below the header (`useCacheAge`, 3-state: "data updated X ago"
> / **"data never cached"** / generic), plus `offline-shell.html` with a **Back**
> button for nav cache-misses. **Still valid in this spec:** install-banner,
> push-prefs-section, fallback screens (offline/server-down), i18n namespaces, the
> spacing/type/color tokens. See **08-CONTEXT.md** banner + memory
> `project_offline_architecture`.

> Visual and interaction contract for the four new UI surfaces introduced in Phase 8:
> (1) PWA install banner + profile-menu Install entry, (2) push notification opt-in +
> per-budget/per-kind preference controls, (3) offline + server-down fallback screens,
> (4) sync-issue list + per-row pending markers.
>
> **Source-of-truth precedence:** `DESIGN.md` > `apps/web/src/app/global.css` >
> Phase 3–7 UI-SPEC carry-forward > this document.
>
> **Carry-forward locked (do NOT redefine):** dark-only theme, 4-multiple spacing scale,
> Inter (`--font-sans`) + IBM Plex Sans (`--font-numeric`) stacks, single-yellow-accent
> scarcity rule, `--info-ring` focus ring, shadcn new-york component set, sonner toast
> pattern, BDP sticky pill tabs, autosave-per-field + blur-to-save, `<Sheet>` primitive,
> `<AlertDialog>` primitive, `<Badge>` primitive, banner ribbon pattern
> (`verify-email-banner.tsx`), edge-to-edge ribbon with yellow tint (`color-mix` pattern).
>
> **Phase 8 adds 5 new UI components** (install-banner, offline-status-badge,
> sync-issues-list, push-prefs-section, fallback screens) and extends 2 existing ones
> (profile mini-menu gets Install entry; spendings grid row gets pending-sync marker).
> All new components consume existing tokens — no new CSS variables introduced.

---

## Design System

| Property                        | Value                                                                            | Source                         |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ |
| Tool                            | shadcn (initialized Phase 3, verified Phase 4–7)                                 | `apps/web/components.json`     |
| Preset                          | `style=new-york`, `baseColor=zinc`, `rsc=true`, `cssVariables=true`, `prefix=""` | `apps/web/components.json`     |
| Component library               | Radix UI primitives (via shadcn new-york)                                        | `apps/web/src/components/ui/*` |
| New shadcn components (Phase 8) | `<Switch>` (push prefs toggles) — install if absent                              | shadcn official                |
| Toast library                   | `sonner` — same position + key convention as Phase 4–7                           | carry-forward                  |
| Icon library                    | `lucide-react`                                                                   | `apps/web/components.json`     |
| Font (display + body)           | Inter via `--font-sans`                                                          | `apps/web/src/app/global.css`  |
| Font (numeric / tabular)        | IBM Plex Sans via `--font-numeric` + `font-variant-numeric: tabular-nums`        | `apps/web/src/app/global.css`  |
| Theme scope                     | **Dark-only** — `--canvas-dark` floor, `--surface-card-dark` elevations          | DESIGN.md + global.css         |
| i18n stack                      | `next-intl` — new namespaces: `pwa.*`, `push.*`, `offline.*`, `sync.*`           | EN + PL + UK from day one      |
| Registry                        | shadcn official only                                                             | no third-party blocks          |

---

## Spacing Scale

Declared values (multiples of 4 — DESIGN.md `spacing` tokens, carry-forward from Phase 7):

| Token | Value | Usage                                                               |
| ----- | ----- | ------------------------------------------------------------------- |
| xxs   | 4px   | Icon gaps, pending-marker dot padding, badge internal padding       |
| xs    | 8px   | Compact element spacing, gap between icon and label in banner       |
| sm    | 12px  | Push pref row internal padding (vertical), sync-issue row padding   |
| md    | 16px  | Default element spacing, banner horizontal padding, form field gaps |
| lg    | 24px  | Section padding, push-prefs group gap, offline screen content gap   |
| xl    | 32px  | Layout column gaps, fallback screen vertical rhythm                 |
| xxl   | 48px  | Major section breaks, offline screen top offset                     |

Exceptions:

- Install banner height: fixed 48px (h-12) — matches existing banner-ribbon pattern (`verify-email-banner.tsx`).
- Touch targets: Install button minimum 40×40px (`h-10`); close (✕) button minimum 44×44px tap area via `p-2` padding around a 20px icon.
- Offline/fallback screens: centered content block `max-w-sm` with `gap-6` (24px) between icon, heading, body, and button.
- `sm` = 12px declared exception: consistent with Phase 5–7 input padding pattern.

---

## Typography

All roles carry forward from DESIGN.md via Phase 3–7 UI-SPECs. Declared for Phase 8 surfaces:

| Role                       | Size | Weight | Line Height | Font                  | Usage                                                        |
| -------------------------- | ---- | ------ | ----------- | --------------------- | ------------------------------------------------------------ |
| Body (banner / sync row)   | 14px | 400    | 1.5         | Inter (`--font-sans`) | Install banner copy, sync-issue row description (`text-sm`)  |
| Label (button / toggle)    | 14px | 600    | 1           | Inter (`--font-sans`) | Install button label, push pref toggle label, Reload button  |
| Heading (fallback screen)  | 20px | 600    | 1.35        | Inter (`--font-sans`) | Offline/server-down screen heading (`title-md` role)         |
| Body (fallback screen)     | 14px | 400    | 1.5         | Inter (`--font-sans`) | Fallback screen description paragraph                        |
| Caption (staleness / meta) | 12px | 500    | 1.4         | Inter (`--font-sans`) | "Last synced X ago" staleness marker, pending-sync dot label |
| Section label (push prefs) | 12px | 500    | 1.4         | Inter (`--font-sans`) | "Per-budget" / "Per-kind" group headings in push prefs       |

Two weights in use: regular (400) for body copy and descriptions; semibold (600) for button labels, headings, and section labels. No numeric font needed on Phase 8 surfaces (no financial figures rendered here).

---

## Color

All tokens defined in `DESIGN.md` and mapped to CSS variables in `apps/web/src/app/global.css`. No new colors introduced in Phase 8.

| Role            | CSS Variable                                                 | Hex     | Usage                                                                                           |
| --------------- | ------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| Dominant (60%)  | `--canvas-dark`                                              | #0b0e11 | Page background, offline screen background, fallback screens                                    |
| Secondary (30%) | `--surface-card-dark`                                        | #1e2329 | Install banner background tint base, push-prefs section background, sync-issues list background |
| Elevated        | `--surface-elevated-dark`                                    | #2b3139 | Sync-issue row hover, push-pref row hover, `<Switch>` track off-state                           |
| Accent (10%)    | `--primary`                                                  | #fcd535 | Install button (primary CTA), "Enable push" toggle thumb when ON, offline/queue nav badge dot   |
| Accent active   | `--primary-active`                                           | #f0b90b | Install button hover/press state                                                                |
| Accent disabled | `--primary-disabled`                                         | #3a3a1f | Install button disabled (if `beforeinstallprompt` not available)                                |
| Warning tint    | `color-mix(in oklab, var(--primary) 8%, var(--canvas-dark))` | —       | Install banner background (reuses `verify-email-banner.tsx` pattern)                            |
| Warning border  | `color-mix(in oklab, var(--primary) 45%, transparent)`       | —       | Install banner bottom border (reuses same pattern)                                              |
| Destructive     | `--destructive` / `--trading-down`                           | #f6465d | Sync-issue failed-item indicator dot, sync-issue error text                                     |
| Body text       | `--body-on-dark`                                             | #eaecef | Banner copy, fallback screen body, push-pref labels                                             |
| Muted text      | `--muted-foreground`                                         | #707a8a | "Last synced X ago" staleness marker, pending-sync caption, push-pref kind description          |
| Hairline        | `--hairline-dark`                                            | #2b3139 | Row dividers in sync-issues list, push-pref section dividers                                    |
| Focus ring      | `--info-ring`                                                | #3b82f6 | Button + toggle keyboard focus state (`0 0 0 2px` at 50% alpha)                                 |

**Accent reserved for:**

- Install banner "Install" button (the single primary CTA on that surface).
- "Enable push" `<Switch>` thumb when toggled ON — signals active subscription state.
- Global offline/queue nav badge dot — the one affordance that alerts the user to unsynced data.
- Active BDP tab pill (Phase 3, carry-forward).
- Nothing else on Phase 8 surfaces.

**Destructive color usage:**

- Sync-issue failed row: left-border or dot indicator in `--destructive` (#f6465d).
- Sync-issue error description text in `--destructive`.
- Never used as background fill (DESIGN.md do-not rule).

---

## Component Inventory

### New in Phase 8

#### 1. `InstallBanner` (`apps/web/src/components/common/install-banner.tsx`)

**Trigger:** Renders only when `beforeinstallprompt` event has been captured AND the app is not already installed (`window.matchMedia('(display-mode: standalone)').matches === false`) AND the user has not dismissed (localStorage key `pwa-install-dismissed`).

**Placement:** Edge-to-edge ribbon at the very top of the `(app)` layout, above the top nav. Same DOM position as `VerifyEmailBanner`. At most one banner renders at a time — if `VerifyEmailBanner` is active, `InstallBanner` defers.

**DOM shape:**

```
div[role="banner" aria-label={t("pwa.install.banner.ariaLabel")}]
  className: border-b border-[color-mix(in_oklab,var(--primary)_45%,transparent)]
             bg-[color-mix(in_oklab,var(--primary)_8%,var(--canvas-dark))]
  div.mx-auto.flex.max-w-6xl.items-center.justify-between.px-4.py-2.sm:px-6
    div.flex.items-center.gap-3
      MonitorSmartphone  ← Lucide icon 16px, color var(--primary)
      p.text-sm.text-[var(--body-on-dark)]  ← t("pwa.install.banner.body")
      a.text-sm.text-[var(--primary)].underline  ← t("pwa.install.banner.learnMore")
        → opens <Dialog> with benefits list (see below)
    div.flex.items-center.gap-2
      Button[variant="primary" size="sm"]  ← t("pwa.install.banner.cta") "Install app"
      Button[variant="ghost" size="icon" aria-label={t("pwa.install.banner.dismiss")}]
        X  ← Lucide icon 16px
```

**"Learn more" dialog:** shadcn `<Dialog>` with `<DialogContent>`. Lists 3 install benefits as a `<ul>` with `<li>` items in `text-sm` / `--body-on-dark`. Benefits copy: (1) "Works offline — access your budget without internet", (2) "Faster load — no browser chrome, launches from home screen", (3) "Push notifications — get task alerts without opening a browser". Dialog has a single close button (`<DialogClose>`).

**Dismiss behavior:** On ✕ click: set `localStorage.setItem('pwa-install-dismissed', '1')`, hide banner. On "Install app" click: call `deferredPrompt.prompt()`, await `userChoice`. If `outcome === 'accepted'`: hide banner, clear dismissed flag. If `outcome === 'dismissed'`: hide banner, set dismissed flag.

**Interaction states:**

| State                             | Visual                                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| Default                           | Yellow-tint ribbon, Install button `variant="primary"` size="sm" |
| Install button hover              | `--primary-active` (#f0b90b) background                          |
| Install button focus              | `--info-ring` focus ring                                         |
| ✕ button hover                    | `--surface-elevated-dark` background on ghost button             |
| `beforeinstallprompt` unavailable | Component renders null — no DOM output                           |

---

#### 2. Profile Menu `Install` Entry

**Placement:** Inside the existing profile mini-menu (the dropdown/popover that appears when clicking the user-profile button in the top nav). Add "Install app" as a persistent menu item.

**When to show:** Always visible in the profile menu when `display-mode !== standalone`. Unlike the banner, it is never dismissed — it persists as a durable install path.

**DOM shape (addition to existing menu):**

```
DropdownMenuItem  ← shadcn DropdownMenuItem (or equivalent)
  MonitorSmartphone  ← Lucide icon 16px, color var(--muted-foreground)
  span.text-sm  ← t("pwa.install.menuItem") "Install app"
```

**Behavior:** Same as Install button in banner — calls `deferredPrompt.prompt()`. If `beforeinstallprompt` not yet captured: show sonner toast `t("pwa.install.notAvailable")` ("Install not available in this browser").

---

#### 3. `OfflineStatusBadge` (`apps/web/src/components/common/offline-status-badge.tsx`)

**Placement:** In the global top nav, adjacent to the profile button. Renders only when `!navigator.onLine` OR `offlineQueue.length > 0`.

**DOM shape:**

```
div.relative[aria-label={t("sync.badge.ariaLabel")}]
  existing-nav-icon-or-slot
  span.absolute.-top-1.-right-1.h-2.w-2.rounded-full  ← dot indicator
    className: bg-[var(--primary)]  ← yellow dot when queue pending
    OR
    className: bg-[var(--destructive)] animate-pulse  ← red pulsing dot when offline with no queue
```

**States:**

| State                            | Dot color           | Animation       |
| -------------------------------- | ------------------- | --------------- |
| Online, queue empty              | hidden              | —               |
| Online, queue > 0 (pending sync) | `--primary` yellow  | none (static)   |
| Offline, queue = 0               | `--destructive` red | `animate-pulse` |
| Offline, queue > 0               | `--destructive` red | `animate-pulse` |

**Tooltip/title:** `aria-label` gives count: `t("sync.badge.ariaLabel", { count })` — EN: "3 transactions pending sync".

---

#### 4. Pending-Sync Row Marker (extension to Spendings grid row)

**Placement:** On each `SpendingsRow` (or equivalent transaction grid row) where the transaction's `idempotencyKey` is present in the offline queue.

**DOM shape (addition to existing row):**

```
existing-row-content
  span.ml-auto.flex.items-center.gap-1.text-[11px].font-medium
    className: text-[var(--muted-foreground)]
    Clock  ← Lucide icon 12px, color var(--muted-foreground)
    t("sync.row.pending")  ← EN: "Pending"
```

**Behavior:** Marker disappears when the transaction is confirmed synced (removed from offline queue). No animation on appearance/disappearance (avoid distraction in dense grid).

---

#### 5. `SyncIssuesList` (`apps/web/src/components/common/sync-issues-list.tsx`)

**Trigger:** Renders when `syncIssues.length > 0` (entries in the "failed replay" store). Displayed as a collapsible panel or sheet — use shadcn `<Collapsible>` or a fixed bottom sheet (`<Sheet side="bottom">`).

**Preferred placement:** Fixed bottom sheet (`<Sheet side="bottom">`) triggered by a "Sync issues" affordance in the nav or below the offline badge. Sheet opens on user tap, not auto-open.

**DOM shape (sheet interior):**

```
SheetHeader
  SheetTitle  ← t("sync.issues.title") "Sync issues"
  SheetDescription  ← t("sync.issues.description") "These transactions could not sync. Review and resolve."

ul[role="list"]
  li[role="listitem"]  ← per failed item
    div.flex.items-start.gap-3.border-b.border-[var(--hairline-dark)].py-3
      div.mt-1.h-2.w-2.rounded-full.bg-[var(--destructive)]  ← red dot
      div.flex-1
        p.text-sm.text-[var(--body-on-dark)]  ← description of txn (amount + category, NO raw payload)
        p.text-xs.text-[var(--destructive)]   ← error reason: t("sync.issues.reason.{code}")
        p.text-xs.text-[var(--muted-foreground)]  ← t("sync.issues.enqueuedAt", { time })
      Button[variant="ghost" size="sm"]  ← t("sync.issues.dismiss") "Dismiss"
```

**Empty state:** When `syncIssues.length === 0`, sheet is not accessible (trigger hidden). No empty state needed.

**Dismiss behavior:** On "Dismiss": remove item from sync issues store. No server call. Sonner toast `t("sync.issues.dismissed")` — EN: "Transaction dismissed."

**Destructive confirmation for dismiss:** No `<AlertDialog>` — dismissed transactions are not recoverable but are already failed. A single "Dismiss" button with clear label is sufficient. If the team wants undo: sonner toast with `action: { label: t("common.undo"), onClick }` pattern.

---

#### 6. `PushPrefsSection` (`apps/web/src/components/settings/push-prefs-section.tsx`)

**Placement:** In the Settings tab accordion, as a new accordion item "Notifications" after existing sections.

**DOM shape:**

```
AccordionItem[value="notifications"]
  AccordionTrigger  ← t("settings.push.sectionTitle") "Notifications"

  AccordionContent
    div.space-y-4

      /* Master enable toggle */
      div.flex.items-center.justify-between.py-2
        div
          p.text-sm.font-medium  ← t("settings.push.enableLabel") "Push notifications"
          p.text-xs.text-[var(--muted-foreground)]  ← t("settings.push.enableDescription")
        Switch[checked={pushEnabled} onCheckedChange={handleEnablePush}]

      /* Per-kind toggles — visible only when pushEnabled = true */
      div.mt-2.space-y-1[hidden={!pushEnabled}]
        p.text-xs.font-medium.text-[var(--muted-foreground)].mb-2
          ← t("settings.push.kindsLabel") "Notify me for"

        /* One row per kind */
        div.flex.items-center.justify-between.rounded-lg.px-3.py-2
          className: bg-[var(--surface-card-dark)] hover:bg-[var(--surface-elevated-dark)]
          div
            p.text-sm  ← t("settings.push.kind.RESERVE_TOPUP.label") "Reserve top-up needed"
            p.text-xs.text-[var(--muted-foreground)]
              ← t("settings.push.kind.RESERVE_TOPUP.description") "When a reserve needs topping up"
          Switch[checked={...} onCheckedChange={...}]

        /* Repeat for CONFIRM_DRAFT and CUSHION_BELOW_TARGET */
```

**Switch styling:** Uses shadcn `<Switch>`. Track OFF state: `--surface-elevated-dark` background. Track ON state: `--primary` (#fcd535) background. Thumb: white circle. This is the only use of `--primary` as a form-control fill — it signals "active subscription."

**"Enable push" interaction flow:**

1. User toggles ON → browser `Notification.requestPermission()` called.
2. If `permission === 'granted'` → `PushManager.subscribe(...)` → POST `/push/subscribe` → persist. Toggle stays ON.
3. If `permission === 'denied'` → toggle snaps back to OFF. Sonner toast: `t("settings.push.permissionDenied")` — EN: "Notification permission denied. Enable it in browser settings."
4. If already subscribed → toggle shows ON on mount (read from `/push/preferences`).
5. Toggle OFF → DELETE `/push/subscribe` → persist. Per-kind toggles hide.

**Per-kind toggle behavior:** Each kind toggle calls `PATCH /push/preferences` on change (debounced 500ms). No confirmation needed. Sonner toast `t("settings.push.saved")` — EN: "Notification preferences saved."

**Per-budget scope:** The push-prefs section is inside the Budget Detail Page (BDP) Settings accordion — it is automatically scoped to the current budget (`budgetId` from URL). No per-budget selector needed.

**Onboarding step:** In the onboarding wizard, one step asks "Enable push notifications?" with the same master `<Switch>` and a brief benefits sentence. Per-kind toggles are NOT shown in onboarding (too detailed). The step is skippable — "Skip for now" tertiary button.

---

#### 7. Offline Fallback Screen

**Trigger:** Serwist SW serves `offline.html` on navigation fetch failure. This HTML is the offline fallback surface.

**OR** as a Next.js error page (`not-found.tsx` variant): when a page loads but IndexedDB has no cached data (D-04 "unavailable offline" state), the page renders an inline empty-state panel (not a full-page redirect).

**Full offline screen DOM shape (offline.html — standalone):**

```
body  ← --canvas-dark background, --body-on-dark text, Inter font
  div.flex.min-h-screen.flex-col.items-center.justify-center.gap-6.p-8
    WifiOff  ← Lucide icon 48px, color var(--muted-foreground)
    div.text-center.space-y-2
      h1.text-xl.font-semibold.text-[var(--on-dark)]  ← t("offline.heading")
      p.text-sm.text-[var(--body-on-dark)]  ← t("offline.body")
    Button[onclick="window.location.reload()"]
      className: bg-[var(--primary)] text-[var(--on-primary)] rounded-md px-6 py-2 text-sm font-semibold
      t("offline.reload") "Try again"
```

**Inline "unavailable offline" empty-state (D-04):**

```
div.flex.flex-col.items-center.gap-4.py-12.text-center
  Database  ← Lucide icon 32px, color var(--muted-foreground)
  div.space-y-1
    p.text-sm.font-medium.text-[var(--body-on-dark)]  ← t("offline.unavailable.heading")
    p.text-xs.text-[var(--muted-foreground)]           ← t("offline.unavailable.body")
  Button[variant="outline" size="sm" onClick={retry}]  ← t("offline.unavailable.retry") "Retry when online"
```

---

#### 8. Server-Down / Auth-Failed Fallback Screen (D-07, D-08)

**Trigger:** When `Better Auth` session check fails because the server is unreachable (network error, not 401). Rendered by the auth middleware or a client-side error boundary — never redirects to `/login`.

**DOM shape:**

```
div.flex.min-h-screen.flex-col.items-center.justify-center.gap-6.p-8
  ServerCrash  ← Lucide icon 48px, color var(--muted-foreground)
  div.text-center.space-y-2
    h1.text-xl.font-semibold.text-[var(--on-dark)]  ← t("serverDown.heading")
    p.text-sm.text-[var(--body-on-dark)]             ← t("serverDown.body")
  Button[onClick={() => window.location.reload()}]
    className: bg-[var(--primary)] text-[var(--on-primary)] rounded-md px-6 py-2 text-sm font-semibold
    t("serverDown.reload") "Reload"
```

**Logged-out-on-server-error variant (D-08):**

```
div.flex.min-h-screen.flex-col.items-center.justify-center.gap-6.p-8
  Lock  ← Lucide icon 48px, color var(--muted-foreground)
  div.text-center.space-y-2
    h1.text-xl.font-semibold.text-[var(--on-dark)]  ← t("serverDown.signedOut.heading")
    p.text-sm.text-[var(--body-on-dark)]             ← t("serverDown.signedOut.body")
  Button[onClick={() => window.location.reload()}]
    ← same yellow primary button ← t("serverDown.signedOut.reload") "Reload"
```

**Critical invariant (D-07):** This screen MUST NOT contain an automatic redirect or a link to `/login`. The only interactive element is the manual Reload button. This breaks any auth-redirect loop.

---

#### 9. "Last synced X ago" Staleness Marker (D-05)

**Placement:** Appears as a single line below the page/tab heading on any cached view when the app is offline or just reconnected.

**DOM shape:**

```
p.text-xs.text-[var(--muted-foreground)].mt-1
  RefreshCw  ← Lucide icon 11px inline, same muted color
  ← " " + t("sync.staleness", { relativeTime })
  e.g. EN: "Last synced 5 minutes ago"
```

**Visibility rule:** Shown when `navigator.onLine === false` OR within 30 seconds of reconnection while cache is being refreshed. Hidden when fully online and fresh data loaded. Uses `next-intl` `formatRelativeTime` for the `{relativeTime}` value.

---

### Modified in Phase 8

#### Profile mini-menu (existing)

Add "Install app" `DropdownMenuItem` — see Component 2 above. No other changes.

#### Spendings grid row (existing)

Add pending-sync marker `<span>` — see Component 4 above. Marker positioned in the trailing cell. No layout shift; the trailing cell already has `flex` layout.

---

## Copywriting Contract

All strings delivered in EN + PL + UK at landing (D-17 CI gate). ICU format throughout.

### PWA Install

| Key                            | EN string                                                          | Notes                                |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `pwa.install.banner.ariaLabel` | `"Install Budget app"`                                             | ARIA region label                    |
| `pwa.install.banner.body`      | `"Install Budget for faster access and offline use"`               | Banner copy — no financial data      |
| `pwa.install.banner.learnMore` | `"Learn more"`                                                     | Opens benefits dialog                |
| `pwa.install.banner.cta`       | `"Install app"`                                                    | Primary CTA — specific verb + noun   |
| `pwa.install.banner.dismiss`   | `"Dismiss install banner"`                                         | ARIA label on ✕ button               |
| `pwa.install.dialog.title`     | `"Why install Budget?"`                                            | Dialog heading                       |
| `pwa.install.dialog.benefit1`  | `"Works offline — access your budget without internet"`            |                                      |
| `pwa.install.dialog.benefit2`  | `"Faster load — launches from home screen, no browser chrome"`     |                                      |
| `pwa.install.dialog.benefit3`  | `"Push notifications — get task alerts without opening a browser"` |                                      |
| `pwa.install.dialog.close`     | `"Close"`                                                          | Dialog close button                  |
| `pwa.install.menuItem`         | `"Install app"`                                                    | Profile menu item                    |
| `pwa.install.notAvailable`     | `"Install not available in this browser"`                          | Sonner toast when prompt unavailable |

### Push Notifications

| Key                                                   | EN string                                                               | Notes                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `settings.push.sectionTitle`                          | `"Notifications"`                                                       | Accordion trigger           |
| `settings.push.enableLabel`                           | `"Push notifications"`                                                  | Master toggle label         |
| `settings.push.enableDescription`                     | `"Receive alerts for tasks needing your attention"`                     | Toggle sub-label            |
| `settings.push.kindsLabel`                            | `"Notify me for"`                                                       | Per-kind group heading      |
| `settings.push.kind.RESERVE_TOPUP.label`              | `"Reserve top-up needed"`                                               | Toggle label                |
| `settings.push.kind.RESERVE_TOPUP.description`        | `"When a reserve needs topping up"`                                     | Toggle sub-label            |
| `settings.push.kind.CONFIRM_DRAFT.label`              | `"Draft needs confirming"`                                              | Toggle label                |
| `settings.push.kind.CONFIRM_DRAFT.description`        | `"When a recurring draft awaits confirmation"`                          | Toggle sub-label            |
| `settings.push.kind.CUSHION_BELOW_TARGET.label`       | `"Cushion below target"`                                                | Toggle label                |
| `settings.push.kind.CUSHION_BELOW_TARGET.description` | `"When the cushion balance falls short of the goal"`                    | Toggle sub-label            |
| `settings.push.permissionDenied`                      | `"Notification permission denied. Enable it in your browser settings."` | Sonner toast                |
| `settings.push.saved`                                 | `"Notification preferences saved."`                                     | Sonner toast on pref change |

### Push notification payloads (D-15 — no financials on lock screen)

| Kind                   | Title (EN)                   | Body (EN)               |
| ---------------------- | ---------------------------- | ----------------------- |
| `RESERVE_TOPUP`        | `"Reserve needs attention"`  | `"Go to Reserves tab"`  |
| `CONFIRM_DRAFT`        | `"A draft needs confirming"` | `"Go to Spendings tab"` |
| `CUSHION_BELOW_TARGET` | `"Cushion below target"`     | `"Go to Wallets tab"`   |

### Offline / Sync

| Key                                    | EN string                                                                                 | Notes                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `offline.heading`                      | `"You're offline"`                                                                        | Offline screen h1                              |
| `offline.body`                         | `"Budget is offline. Check your connection and try again."`                               | Offline screen body                            |
| `offline.reload`                       | `"Try again"`                                                                             | Reload button                                  |
| `offline.unavailable.heading`          | `"Not available offline"`                                                                 | Inline empty-state heading                     |
| `offline.unavailable.body`             | `"This data hasn't been loaded yet. Connect to the internet and reload."`                 | Inline empty-state body                        |
| `offline.unavailable.retry`            | `"Retry when online"`                                                                     | Retry button                                   |
| `sync.staleness`                       | `"Last synced {relativeTime}"`                                                            | ICU: `{relativeTime}` via `formatRelativeTime` |
| `sync.badge.ariaLabel`                 | `"{count, plural, one {# transaction pending sync} other {# transactions pending sync}}"` | ICU plural                                     |
| `sync.row.pending`                     | `"Pending"`                                                                               | Inline row marker                              |
| `sync.issues.title`                    | `"Sync issues"`                                                                           | Sheet title                                    |
| `sync.issues.description`              | `"These transactions could not sync. Review and resolve manually."`                       | Sheet description                              |
| `sync.issues.reason.VALIDATION_ERROR`  | `"Rejected — invalid data"`                                                               | Per-error-code reason                          |
| `sync.issues.reason.ARCHIVED_CATEGORY` | `"Rejected — category no longer active"`                                                  | Per-error-code reason                          |
| `sync.issues.reason.MONTH_ROLLED`      | `"Rejected — month has closed"`                                                           | Per-error-code reason                          |
| `sync.issues.reason.UNKNOWN`           | `"Sync failed — try again later"`                                                         | Fallback reason                                |
| `sync.issues.enqueuedAt`               | `"Queued {relativeTime}"`                                                                 | ICU `{relativeTime}`                           |
| `sync.issues.dismiss`                  | `"Dismiss"`                                                                               | Per-item dismiss button                        |
| `sync.issues.dismissed`                | `"Transaction dismissed."`                                                                | Sonner toast                                   |

### Server-Down / Auth-Failed

| Key                            | EN string                                                               | Notes                                                       |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `serverDown.heading`           | `"Service unavailable"`                                                 | Server-down screen h1                                       |
| `serverDown.body`              | `"Budget can't reach the server right now. Your data is safe."`         | Server-down screen body                                     |
| `serverDown.reload`            | `"Reload"`                                                              | Manual reload button — must be the only interactive element |
| `serverDown.signedOut.heading` | `"You're signed out"`                                                   | Auth-failed variant h1                                      |
| `serverDown.signedOut.body`    | `"Can't sign in right now due to a server problem. Your data is safe."` | Auth-failed variant body                                    |
| `serverDown.signedOut.reload`  | `"Reload"`                                                              | Manual reload — breaks redirect loop                        |

### Primary CTA summary (Phase 8)

| Surface                   | CTA label      |
| ------------------------- | -------------- |
| Install banner            | "Install app"  |
| Offline screen            | "Try again"    |
| Server-down screen        | "Reload"       |
| Auth-failed screen        | "Reload"       |
| Sync issue dismiss        | "Dismiss"      |
| Onboarding push step skip | "Skip for now" |

### Empty states

| Surface                     | Heading                         | Body                                                                    |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Offline (never-synced page) | "Not available offline"         | "This data hasn't been loaded yet. Connect to the internet and reload." |
| Sync issues (no failures)   | (not rendered — trigger hidden) | —                                                                       |

### Destructive actions

No permanent destructive actions. "Dismiss" on a sync-issue item is irreversible but low-stakes — confirmed by clear label only, no `<AlertDialog>`. If undo is desired: sonner toast with undo action (optional enhancement).

---

## Interaction States

### Install Banner

| State                   | Visual                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| Default                 | Yellow-tint ribbon with Install button (yellow bg) and ✕ (ghost)      |
| Install button hover    | `--primary-active` (#f0b90b) background                               |
| Install button focus    | `--info-ring` focus ring                                              |
| Install button disabled | `--primary-disabled` background + `--muted` text (prompt unavailable) |
| ✕ hover                 | `--surface-elevated-dark` fill on ghost                               |
| Dismissed               | Component unmounts, localStorage key set                              |
| Already installed       | Component renders null                                                |

### Push Enable Toggle (Settings)

| State                 | Visual                                                  |
| --------------------- | ------------------------------------------------------- |
| OFF                   | `<Switch>` track `--surface-elevated-dark`, thumb white |
| ON                    | `<Switch>` track `--primary` (#fcd535), thumb white     |
| Requesting permission | Toggle in loading state (`disabled`, spinner)           |
| Permission denied     | Toggle snaps to OFF + sonner toast                      |
| Focus                 | `--info-ring` ring around switch                        |

### Offline Status Badge

| State               | Dot                     | Animation       |
| ------------------- | ----------------------- | --------------- |
| Online, queue empty | hidden                  | —               |
| Online, queue > 0   | yellow `--primary` dot  | none            |
| Offline             | red `--destructive` dot | `animate-pulse` |

### Pending-Sync Row Marker

| State   | Visual                                                     |
| ------- | ---------------------------------------------------------- |
| Pending | Muted clock icon + "Pending" caption, `--muted-foreground` |
| Synced  | Marker removed from DOM                                    |

### Fallback Screens (offline / server-down)

| State               | Visual                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| Default             | Centered icon (muted) + heading (on-dark) + body (body-on-dark) + yellow Reload button |
| Reload button hover | `--primary-active` background                                                          |
| Reload button focus | `--info-ring` ring                                                                     |

---

## Accessibility

Carry-forward: dark-only theme, keyboard navigation, `--info-ring` focus ring, ARIA landmarks.

Phase 8 additions:

- `InstallBanner`: `role="banner"` + `aria-label` on the region. Install button is a `<button>` with descriptive label. ✕ button has `aria-label` (icon-only button rule).
- `OfflineStatusBadge` dot: `aria-label` on the container giving count. The dot itself is `aria-hidden="true"` (decorative).
- `PendingSync` row marker: `aria-label` on the `<span>` conveying "Pending sync" for screen readers.
- `SyncIssuesList` sheet: `role="list"` / `role="listitem"` on the items list. Error reason text has `aria-live="polite"` so screen readers announce when items are dismissed.
- `PushPrefsSection` switches: each `<Switch>` has a visible label associated via `htmlFor` or `aria-labelledby`. Permission-denied feedback uses `aria-live="assertive"` (permission state is a critical status change).
- Fallback screens: `<h1>` landmark heading, main content in `<main>`. Reload button is a `<button>` (not `<a>`) — avoids navigation semantics that could trigger unintended browser redirect behavior.
- Offline screen: `lang` attribute on `<html>` must be set in `offline.html` even though it is a static file (use `lang="en"` as static default — i18n not available in static fallback).
- Staleness marker: `aria-live="polite"` so reconnection updates are announced.

---

## i18n Key Additions Summary

New namespaces in `apps/web/messages/{en,pl,uk}.json`:

```
pwa.install.banner.ariaLabel
pwa.install.banner.body
pwa.install.banner.learnMore
pwa.install.banner.cta
pwa.install.banner.dismiss
pwa.install.dialog.title
pwa.install.dialog.benefit1
pwa.install.dialog.benefit2
pwa.install.dialog.benefit3
pwa.install.dialog.close
pwa.install.menuItem
pwa.install.notAvailable

settings.push.sectionTitle
settings.push.enableLabel
settings.push.enableDescription
settings.push.kindsLabel
settings.push.kind.RESERVE_TOPUP.label
settings.push.kind.RESERVE_TOPUP.description
settings.push.kind.CONFIRM_DRAFT.label
settings.push.kind.CONFIRM_DRAFT.description
settings.push.kind.CUSHION_BELOW_TARGET.label
settings.push.kind.CUSHION_BELOW_TARGET.description
settings.push.permissionDenied
settings.push.saved

onboarding.push.stepTitle
onboarding.push.enableLabel
onboarding.push.enableDescription
onboarding.push.skip

offline.heading
offline.body
offline.reload
offline.unavailable.heading
offline.unavailable.body
offline.unavailable.retry

sync.staleness
sync.badge.ariaLabel
sync.row.pending
sync.issues.title
sync.issues.description
sync.issues.reason.VALIDATION_ERROR
sync.issues.reason.ARCHIVED_CATEGORY
sync.issues.reason.MONTH_ROLLED
sync.issues.reason.UNKNOWN
sync.issues.enqueuedAt
sync.issues.dismiss
sync.issues.dismissed

serverDown.heading
serverDown.body
serverDown.reload
serverDown.signedOut.heading
serverDown.signedOut.body
serverDown.signedOut.reload
```

**Remove from all three catalogs:** no existing keys removed in Phase 8.

**Machine-origin PL/UK keys:** All new PL/UK translations for the above keys are LLM-generated and flagged `// @machine-translated` in source for later human review (D-19).

**CI gate:** `scripts/check-i18n-completeness.ts` must include all keys above in the completeness check before the build succeeds (I18N-01).

---

## Registry Safety

| Registry        | Blocks Used                                               | Safety Gate  |
| --------------- | --------------------------------------------------------- | ------------ |
| shadcn official | `Switch` (if not yet installed — `npx shadcn add switch`) | not required |

No third-party registries. Registry vetting gate: not applicable.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
