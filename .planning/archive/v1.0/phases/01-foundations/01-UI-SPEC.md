---
phase: 1
slug: foundations
status: approved
shadcn_initialized: false
preset: new-york
created: 2026-05-05
reviewed_at: 2026-05-05T19:41:00Z
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for the Phase 1 surfaces: auth flows (signup, email-verify grace banner, signin, password reset), settings (sessions + display_currency + locale), workspace lifecycle (empty state, create form with kind+default_currency, switcher multi-select), SHARED workspace owner controls (member shares editor, invite member), and the cross-workspace dashboard _layout scaffolding only_ (widgets are Phase 2/4).
>
> All copywriting keys are EN canonical strings; PL and UK catalogs ship at the same string-IDs. Per-locale length budget: PL/UK strings may be up to **30% longer** than EN — buttons must size to content, not fixed widths; table cells must allow 2-line wrap.

---

## Design System

| Property          | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Tool              | shadcn                                                                          |
| Preset            | new-york (style: new-york, baseColor: zinc, cssVariables: true, radius: 0.5rem) |
| Component library | radix (via shadcn/ui copied components)                                         |
| Icon library      | lucide-react                                                                    |
| Font              | Geist Sans (UI) + Geist Mono (numerics — currency amounts, percentages, codes)  |

**Initialization command (planner runs in Phase 1, not now):**

```bash
cd apps/web && npx shadcn@latest init --base-color zinc --style new-york --css-variables
```

**Phase 1 component inventory (shadcn official only — no third-party registry in this phase):**

`button`, `input`, `label`, `form` (react-hook-form + zod), `card`, `dialog`, `alert`, `alert-dialog`, `badge`, `checkbox`, `select`, `dropdown-menu`, `separator`, `sheet` (mobile workspace switcher drawer), `skeleton`, `sonner` (toasts), `table`, `tabs`, `tooltip`, `avatar`, `popover`, `command` (currency picker fuzzy-search).

**Forbidden in Phase 1:** charts (recharts ships Phase 4), date pickers (Phase 2), data-table (Phase 2 expense list), any third-party registry.

---

## Spacing Scale

Declared values (multiples of 4 only — Tailwind v4 default `--spacing` unit = 0.25rem so values map 1:1):

| Token | Value | Usage                                                |
| ----- | ----- | ---------------------------------------------------- |
| xs    | 4px   | Icon-to-label gap, badge inner padding               |
| sm    | 8px   | Form field row spacing, button icon gap              |
| md    | 16px  | Default element gap, card inner padding-y            |
| lg    | 24px  | Section padding, card outer gap, form section breaks |
| xl    | 32px  | Page-section gaps (e.g. settings tab content)        |
| 2xl   | 48px  | Auth-form vertical breathing room above/below card   |
| 3xl   | 64px  | Empty-state hero spacing on `> sm` viewports         |

**Exceptions (locked):**

- Touch targets: minimum **44x44px** hit area on mobile (icon-only buttons in workspace switcher, session-revoke kebab). Visual button can be 32px tall as long as the click target is padded to 44.
- Form field minimum height: **40px** (mobile-friendly). Inputs are `h-10` in Tailwind.
- Workspace switcher checkbox row: `py-2 px-3` (8/12) — denser than default to fit 6+ workspaces above the fold on a 375px-wide phone.

**Layout grid:**

- Mobile (default, <640px): single column, page padding `px-4` (16px), max-width 100%.
- Tablet (≥640px): page padding `px-6` (24px).
- Desktop (≥1024px): centered content max-width `max-w-2xl` (672px) for auth/settings/forms; `max-w-6xl` (1152px) for dashboard scaffolding.
- Auth pages: card max-width `max-w-md` (448px), vertically centered, `py-12` page padding.

---

## Typography

Locked to **4 sizes, 2 weights**. Tailwind v4 `text-*` classes map to these px values via the default scale.

| Role    | Size | Weight         | Line Height | Tailwind                           |
| ------- | ---- | -------------- | ----------- | ---------------------------------- |
| Body    | 16px | 400 (regular)  | 1.5 (24px)  | `text-base font-normal leading-6`  |
| Label   | 14px | 600 (semibold) | 1.4 (~20px) | `text-sm font-semibold leading-5`  |
| Heading | 20px | 600 (semibold) | 1.3 (26px)  | `text-xl font-semibold leading-7`  |
| Display | 28px | 600 (semibold) | 1.2 (~34px) | `text-3xl font-semibold leading-9` |

**Numerics (currency, percentages, ISO codes):** Geist Mono at the same size as the surrounding role. Tabular figures (`font-variant-numeric: tabular-nums`) on every numeric cell so columns align in the member-shares editor and the (future) dashboard.

**Locale handling:**

- UK uses Cyrillic glyphs — Geist Sans + Geist Mono both ship Cyrillic; verify at planning time.
- Display heading at 28px must accommodate PL/UK ~30% length growth without wrapping below `sm` viewport width — if it would wrap, prefer the Heading role (20px) on small screens and bump to Display only at `≥sm`.

**Forbidden:**

- No 5th font size, no italic body, no font-weight outside {400, 600}.
- No `text-xs` (12px) anywhere — fails minimum readable size for a multi-locale finance product. Form helper text uses 14px (Label role) at weight 400.

---

## Color

Tailwind v4 + shadcn `new-york` zinc baseline. CSS variables drive light + dark themes; system-preference respected with manual override switch deferred to Phase 6 (Phase 1 ships **light theme only** — dark theme rails exist via CSS vars but are not user-toggleable yet).

| Role            | Value (light)                                                                          | Value (dark, defined but not toggleable in Phase 1) | Usage                                 |
| --------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| Dominant (60%)  | `oklch(1 0 0)` (`--background`, white)                                                 | `oklch(0.141 0.005 285.823)`                        | Page background, surfaces             |
| Secondary (30%) | `oklch(0.985 0 0)` (`--muted`, zinc-50) + `oklch(0.967 0.001 286.375)` (`--secondary`) | zinc-900/zinc-800 equivalents                       | Cards, sidebar, nav, form field fills |
| Accent (10%)    | `oklch(0.21 0.006 285.885)` (`--primary`, zinc-900)                                    | zinc-50 inverse                                     | See reserved-for list below           |
| Destructive     | `oklch(0.577 0.245 27.325)` (`--destructive`, red)                                     | same                                                | Destructive confirmations only        |

**Accent reserved for:**

1. Primary CTA button on each surface (exactly **one** per surface — Sign up / Sign in / Send reset link / Reset password / Create workspace / Save shares / Send invite).
2. Active-state indicator on the workspace switcher checkbox (filled checkbox).
3. Email-verification banner accent border (left edge, 2px) — the banner itself uses the warning surface, the accent border draws the eye.
4. Focus rings on every interactive element (`focus-visible:ring-2 ring-primary`).

**Accent NOT used for:**

- Body links (use `--foreground` underlined; underline becomes color-coded only on hover).
- Secondary buttons (zinc outline / ghost).
- Form labels (use `--foreground`).
- Icons in nav (use `--muted-foreground`).
- Workspace-kind chips (PRIVATE = neutral, SHARED = neutral — kind is structural, not "important").

**Semantic colors (in addition to the 60/30/10):**

| Role            | Value (light)                                                              | Usage                                               |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Warning surface | `oklch(0.96 0.05 95)` (amber-50) + `oklch(0.45 0.13 80)` (amber-700 text)  | Email-verification banner                           |
| Success surface | `oklch(0.96 0.05 145)` (green-50) + `oklch(0.4 0.13 145)` (green-700 text) | Toast on session-revoked, invite-sent, shares-saved |
| Info text       | `oklch(0.55 0.005 285)` (`--muted-foreground`, zinc-500)                   | Helper text under inputs, "snapshot date" hints     |

**Currency display rule (locked, MONY-09):**

- Per-workspace single-workspace UI areas: amounts render in that workspace's `default_currency` — **no FX badge needed** because the source currency _is_ the display currency.
- Cross-workspace dashboard rollups (scaffolding in Phase 1, populated Phase 2+): amounts render in user's `display_currency` with a small Label-role suffix `· in {ISO} (converted)` next to the figure. The "(converted)" suffix is the locale-keyed string; never hardcode "converted".
- Amounts with stale FX rates (Phase 2 onward, but the design rule lands here): wrap the figure in a tooltip-bearing element with a 1px dashed underline in `--muted-foreground` and tooltip copy pulled from `fx.stale.tooltip` key.

---

## Copywriting Contract

All strings are EN canonical. Keys are **stable contracts** — Phase 2+ surfaces reuse them. PL and UK catalogs ship at the same keys.

### Auth flows

| Element                        | Key                           | Copy                                                                                  |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------- |
| Signup page heading            | `auth.signup.heading`         | Create your Budget account                                                            |
| Signup page subtitle           | `auth.signup.subtitle`        | One account, multiple budgets — private and shared.                                   |
| Signup CTA                     | `auth.signup.cta`             | Create account                                                                        |
| Signup language label          | `auth.signup.locale.label`    | Display language                                                                      |
| Signup language helper         | `auth.signup.locale.helper`   | You can change this anytime in settings.                                              |
| Signin page heading            | `auth.signin.heading`         | Welcome back                                                                          |
| Signin CTA                     | `auth.signin.cta`             | Sign in                                                                               |
| Signin forgot link             | `auth.signin.forgot`          | Forgot your password?                                                                 |
| Password reset request heading | `auth.reset.request.heading`  | Reset your password                                                                   |
| Password reset request body    | `auth.reset.request.body`     | Enter your account email. We'll send you a link. The link works for 30 minutes.       |
| Password reset request CTA     | `auth.reset.request.cta`      | Send reset link                                                                       |
| Password reset request success | `auth.reset.request.success`  | If that email is registered, a reset link is on its way. Check your inbox.            |
| Password reset consume heading | `auth.reset.consume.heading`  | Choose a new password                                                                 |
| Password reset consume CTA     | `auth.reset.consume.cta`      | Reset password                                                                        |
| Reset link expired error       | `auth.reset.expired`          | This reset link has expired. Request a new one — they're valid for 30 minutes.        |
| Email-verify banner heading    | `auth.verify.banner.heading`  | Verify your email to continue                                                         |
| Email-verify banner body       | `auth.verify.banner.body`     | We sent a link to {email}. Workspace creation and invitations unlock once you verify. |
| Email-verify banner action     | `auth.verify.banner.resend`   | Resend email                                                                          |
| Email-verify banner cooldown   | `auth.verify.banner.cooldown` | You can resend in {seconds}s.                                                         |

### Settings

| Element                           | Key                                      | Copy                                                                                                    |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Settings page heading             | `settings.heading`                       | Settings                                                                                                |
| Sessions tab                      | `settings.sessions.tab`                  | Sessions                                                                                                |
| Sessions empty (only this device) | `settings.sessions.empty`                | This is your only active session.                                                                       |
| Session revoke button             | `settings.sessions.revoke`               | Sign out this session                                                                                   |
| Session revoke confirm title      | `settings.sessions.revoke.confirm.title` | Sign out this session?                                                                                  |
| Session revoke confirm body       | `settings.sessions.revoke.confirm.body`  | The signed-in device on {device} will be signed out immediately.                                        |
| Session revoke confirm CTA        | `settings.sessions.revoke.confirm.cta`   | Sign out                                                                                                |
| Display currency label            | `settings.display_currency.label`        | Display currency                                                                                        |
| Display currency helper           | `settings.display_currency.helper`       | Used to show totals across multiple workspaces. Each workspace keeps its own currency for its own data. |
| Language label                    | `settings.locale.label`                  | Display language                                                                                        |
| Save button                       | `settings.save`                          | Save changes                                                                                            |
| Save success toast                | `settings.save.success`                  | Settings saved.                                                                                         |

### Workspace lifecycle

| Element                                                 | Key                                 | Copy                                                                                                |
| ------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Empty-state heading (zero workspaces)                   | `workspaces.empty.heading`          | Create your first workspace                                                                         |
| Empty-state body                                        | `workspaces.empty.body`             | A workspace holds one budget. Make a private one for yourself, or a shared one to plan with family. |
| Empty-state CTA                                         | `workspaces.empty.cta`              | Create workspace                                                                                    |
| Create form heading                                     | `workspaces.create.heading`         | New workspace                                                                                       |
| Create form name label                                  | `workspaces.create.name.label`      | Workspace name                                                                                      |
| Create form kind label                                  | `workspaces.create.kind.label`      | Workspace type                                                                                      |
| Create form kind PRIVATE                                | `workspaces.create.kind.private`    | Private — just me                                                                                   |
| Create form kind SHARED                                 | `workspaces.create.kind.shared`     | Shared — invite family                                                                              |
| Create form currency label                              | `workspaces.create.currency.label`  | Default currency                                                                                    |
| Create form currency helper                             | `workspaces.create.currency.helper` | This is permanent — every entry in this workspace settles in this currency.                         |
| Create form CTA                                         | `workspaces.create.cta`             | Create workspace                                                                                    |
| Create success toast                                    | `workspaces.create.success`         | Workspace "{name}" created.                                                                         |
| Switcher label                                          | `workspaces.switcher.label`         | Active workspaces                                                                                   |
| Switcher helper                                         | `workspaces.switcher.helper`        | Pick the workspaces you want to see. We'll remember this.                                           |
| Switcher group: private                                 | `workspaces.switcher.group.private` | Private budgets                                                                                     |
| Switcher group: shared                                  | `workspaces.switcher.group.shared`  | Shared budgets                                                                                      |
| Switcher empty (first login prompt)                     | `workspaces.switcher.first_pick`    | Pick at least one workspace to start.                                                               |
| Verify-required gate (clicked Create from banner state) | `workspaces.verify_required`        | Verify your email first to create or join a workspace.                                              |

### SHARED workspace owner controls

| Element                     | Key                                     | Copy                                                                                                    |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shares editor heading       | `workspace.shares.heading`              | Contribution shares                                                                                     |
| Shares editor body          | `workspace.shares.body`                 | Set what portion of this workspace's budget each member is responsible for. Shares must add up to 100%. |
| Shares column member        | `workspace.shares.col.member`           | Member                                                                                                  |
| Shares column percentage    | `workspace.shares.col.percentage`       | Share                                                                                                   |
| Shares running total        | `workspace.shares.total`                | Total: {percentage}%                                                                                    |
| Shares total OK             | `workspace.shares.total.ok`             | Total: 100% — looks good.                                                                               |
| Shares total error          | `workspace.shares.total.error`          | Total must equal 100%. Currently {percentage}%.                                                         |
| Shares save CTA             | `workspace.shares.save`                 | Save shares                                                                                             |
| Shares save success toast   | `workspace.shares.save.success`         | Contribution shares updated.                                                                            |
| Shares audit hint           | `workspace.shares.audit_hint`           | Every change is logged.                                                                                 |
| Invite member heading       | `workspace.invite.heading`              | Invite a member                                                                                         |
| Invite email label          | `workspace.invite.email.label`          | Email address                                                                                           |
| Invite CTA                  | `workspace.invite.cta`                  | Send invitation                                                                                         |
| Invite success toast        | `workspace.invite.success`              | Invitation sent to {email}.                                                                             |
| Invite already-member error | `workspace.invite.error.already_member` | {email} is already a member of this workspace.                                                          |

### Empty / error / destructive baselines

| Element                                                                                                | Key                                              | Copy                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Generic empty state heading (reusable)                                                                 | `state.empty.heading`                            | Nothing here yet                                                                |
| Generic empty state body                                                                               | `state.empty.body`                               | Once you {action}, it'll show up here.                                          |
| Generic error toast                                                                                    | `state.error.generic`                            | Something went wrong. Try again — if it keeps happening, refresh the page.      |
| Network error                                                                                          | `state.error.network`                            | You're offline. Changes will retry once you're back online.                     |
| Validation error inline (per field)                                                                    | `state.error.field`                              | {field}: {message}                                                              |
| Destructive confirm: revoke session                                                                    | (see `settings.sessions.revoke.confirm.*` above) | —                                                                               |
| Destructive confirm: leave SHARED workspace (UI ships in Phase 1, mechanic via Better-Auth org plugin) | `workspace.leave.confirm.title`                  | Leave "{name}"?                                                                 |
| Destructive confirm body                                                                               | `workspace.leave.confirm.body`                   | You'll lose access to this workspace's data. The owner can re-invite you later. |
| Destructive confirm CTA                                                                                | `workspace.leave.confirm.cta`                    | Leave workspace                                                                 |

**Tone rules (locked, applied across catalogs):**

- Address the user directly ("your account", "you").
- Verb-led CTAs (`Create workspace`, never `Workspace creation`).
- Numbers always with the currency code or % suffix ("100%", "USD 1,234.50") — currency code goes _before_ the amount in EN, _after_ in PL and UK (already next-intl's default ICU `{value, number, ::currency/USD}` behavior; do not hand-format).
- No emoji in any catalog string. No exclamation points except in success toasts (and even there, prefer period).
- Errors: state the problem, then the next action. Never blame the user ("Bad input" → "Email isn't a valid address. Check the format and try again.").

---

## Interaction Contracts (Phase 1 surfaces)

### Loading states

- All async forms (Sign up, Sign in, Reset, Create workspace, Save shares, Send invite, Save settings) disable the submit button + swap label to a spinner-prefixed loading state during submission. Use shadcn `Button` with `disabled` + lucide `Loader2` spinning.
- Page-level data load (sessions list, workspace list, members list) renders shadcn `Skeleton` placeholders matching the final layout shape — never a centered spinner.

### Form validation

- react-hook-form + zodResolver. Zod schemas live in `packages/<context>/contracts/`.
- Validation triggers `onBlur` for first interaction, then `onChange` after the first error (shadcn-form default).
- Inline error: 14px (Label role) red text directly under the input, 4px gap. Never a tooltip-only error.
- Submit-time server errors: shadcn `Alert` (variant=destructive) inside the card, above the form fields. Toast for _success_, in-card alert for _error_ (so the error stays put while the user reads it).

### Email-verify banner

- Renders as a full-width `Alert` (variant: warning, defined as the warning surface above) sticky to the top of every authenticated page — outside the page padding so it spans edge-to-edge.
- Persists across all auth-required surfaces until verified.
- "Resend" link triggers cooldown (60s); button shows the countdown copy.
- Workspace-creation CTA on the empty state is **enabled visually** but on click shows a `Tooltip` (when hovered) and an `Alert` (when clicked) saying `workspaces.verify_required`. **Do not gray out the button** — graying out reads as "broken" not "blocked".

### Workspace switcher (multi-select)

- Mobile (<640px): renders inside a `Sheet` (slide-over from left), triggered by a header button labelled with the active count (`{count} workspaces`).
- Tablet+: renders inline in the left rail (sidebar), 240px wide.
- Each row: shadcn `Checkbox` + workspace name + small kind chip (`Private` / `Shared`) + currency code badge.
- Grouped by `Private budgets` / `Shared budgets` headers (Label role, muted).
- "Select all in group" affordance per group.
- First-login state: switcher is empty; all data surfaces below show the "first_pick" message with a CTA to focus the switcher.
- Persistence: each toggle PUTs the new array immediately (optimistic UI; revert + toast on error). No "Apply" button — selection is the action.

### Currency picker (used 2x: workspace creation, settings display_currency)

- shadcn `Command` inside a `Popover`. Search by ISO code or localized currency name.
- Top results list: top 8 by user prevalence (deterministic — for Phase 1 it's a hardcoded list of [USD, EUR, PLN, GBP, UAH, CHF, NOK, SEK]; later phases personalize).
- Each row: `{ISO}` (Mono, accent if selected) + localized currency name + symbol.
- ISO-4217 list source: `Intl.supportedValuesOf('currency')` filtered to next-intl's known set.
- Workspace `default_currency`: picker shows a permanent helper note `workspaces.create.currency.helper` reinforcing immutability. After creation, the field renders as read-only display text on the workspace settings page (Phase 2+ surface).

### Member shares editor

- Layout: `Table` with columns Member / Share / (delete is N/A — members come from invite/leave flow, not this editor).
- Share input: `Input type="number"` with step="0.01", min="0", max="100", `inputMode="decimal"`, suffix "%" rendered as a Mono span. Width 96px (`w-24`).
- Running total: live-updated row at table footer, Mono. Renders `workspace.shares.total.ok` (success surface) when sum === 100.00 ± 0.005 tolerance, else `workspace.shares.total.error` (destructive text).
- Save CTA: disabled until total === 100.00 AND form is dirty.
- Audit hint: 14px muted text below the table (`workspace.shares.audit_hint`) with a lucide `History` icon.

### Sessions list

- Table: Device / Last active / Current? / Action.
- Current session row: badge `Current` (neutral), no revoke button.
- Other sessions: `DropdownMenu` with single item "Sign out this session" → opens `AlertDialog` confirmation.
- Empty state (only one session): `settings.sessions.empty` text replaces the table.

### Cross-workspace dashboard (scaffolding only — Phase 1)

Phase 1 does **not** implement widget content. Phase 1 locks **layout** + **currency-display rule** so Phase 2+ slot content in cleanly.

- Page route: `/dashboard` (post-login default landing for users with ≥1 active workspace).
- Layout: 12-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), gap `lg` (24px).
- Each widget = empty `Card` with title (Heading role) + body containing a `Skeleton` block at the right aspect ratio (e.g. 16:9 for chart slots, 4-row for list slots).
- Header strip above the grid: shows active-workspace pills (e.g. `Family · USD`, `My freelance · EUR`) + total count, with a "Manage" link opening the switcher.
- Currency-display indicator: top-right of the header strip, reads `Totals shown in {USER_DISPLAY_CCY}` (Mono code) — **only visible when ≥2 workspaces are active**, hidden in single-workspace mode.

---

## Accessibility (locked, gates in checker)

- WCAG 2.2 AA color contrast: every text role hits 4.5:1 against its dominant surface. Verified pairs in this contract: `--foreground` on `--background` (zinc-950 on white = 19.5:1), `--muted-foreground` on `--background` (zinc-500 on white = 4.6:1 — minimum); accent text on accent surface uses `--primary-foreground` for sufficient contrast.
- Every interactive element gets a `focus-visible:ring-2 ring-ring ring-offset-2` ring. Never `outline: none` without replacement.
- Forms: every input has a real `<label>` (shadcn `Form` enforces this); helper text via `aria-describedby`; errors via `aria-invalid` + `aria-errormessage`.
- Modals: `Dialog`/`AlertDialog` trap focus; ESC dismisses non-destructive only (destructive `AlertDialog` requires explicit click).
- Mobile touch target ≥44x44px (per Spacing exception).
- Reduced motion: respect `prefers-reduced-motion` — no transitions on the workspace-switcher Sheet, swap to instant; respect across shadcn defaults (already honored by Radix primitives).

---

## Registry Safety

| Registry        | Blocks Used                                                                                                                                                                               | Safety Gate             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| shadcn official | button, input, label, form, card, dialog, alert, alert-dialog, badge, checkbox, select, dropdown-menu, separator, sheet, skeleton, sonner, table, tabs, tooltip, avatar, popover, command | not required (official) |

**No third-party registries declared for Phase 1.** Phase 2 may revisit (e.g. for a date picker block). Any future third-party registry must run the `shadcn view` vetting gate before entering this contract.

---

## Out of Scope for Phase 1 UI-SPEC (do not design ahead)

- Budget / Categories / Expense screens (Phase 2)
- Reserve / Cushion / Investments screens (Phase 3)
- Tasks queue / Insights charts / Notifications UI (Phase 4)
- Onboarding wizard / voice STT preview (Phase 5)
- PWA install prompt UX / offline indicator / GDPR export download (Phase 6)
- Dashboard widget _content_ (Phase 1 ships layout + skeletons only)
- Dark theme toggle (Phase 6 — CSS vars exist now, switch lands later)
- 2FA / OAuth flows (deferred to v1.x)

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved
