---
phase: 01-foundations
plan: 08
plan_id: 01.08
type: execute
wave: 3
depends_on: ['01.00', '01.01', '01.05', '01.06', '01.07']
files_modified:
  - apps/web/package.json
  - apps/web/tsconfig.json
  - apps/web/next.config.mjs
  - apps/web/postcss.config.mjs
  - apps/web/tailwind.config.ts
  - apps/web/components.json
  - apps/web/proxy.ts
  - apps/web/i18n/routing.ts
  - apps/web/i18n/request.ts
  - apps/web/i18n.config.ts
  - apps/web/messages/en.json
  - apps/web/messages/pl.json
  - apps/web/messages/uk.json
  - apps/web/src/app/layout.tsx
  - apps/web/src/app/[locale]/layout.tsx
  - apps/web/src/app/[locale]/sign-in/page.tsx
  - apps/web/src/app/[locale]/sign-up/page.tsx
  - apps/web/src/app/[locale]/(app)/layout.tsx
  - apps/web/src/app/[locale]/(app)/onboarding/page.tsx
  - apps/web/src/app/[locale]/(app)/workspaces/page.tsx
  - apps/web/src/app/[locale]/(app)/workspaces/[id]/page.tsx
  - apps/web/src/app/[locale]/(app)/settings/page.tsx
  - apps/web/src/app/[locale]/health/route.ts
  - apps/web/src/app/global.css
  - apps/web/src/components/ui/button.tsx
  - apps/web/src/components/ui/input.tsx
  - apps/web/src/components/ui/label.tsx
  - apps/web/src/components/ui/form.tsx
  - apps/web/src/components/ui/card.tsx
  - apps/web/src/components/ui/dialog.tsx
  - apps/web/src/components/ui/alert.tsx
  - apps/web/src/components/ui/alert-dialog.tsx
  - apps/web/src/components/ui/badge.tsx
  - apps/web/src/components/ui/checkbox.tsx
  - apps/web/src/components/ui/select.tsx
  - apps/web/src/components/ui/dropdown-menu.tsx
  - apps/web/src/components/ui/separator.tsx
  - apps/web/src/components/ui/sheet.tsx
  - apps/web/src/components/ui/skeleton.tsx
  - apps/web/src/components/ui/sonner.tsx
  - apps/web/src/components/ui/table.tsx
  - apps/web/src/components/ui/tabs.tsx
  - apps/web/src/components/ui/tooltip.tsx
  - apps/web/src/components/ui/avatar.tsx
  - apps/web/src/components/ui/popover.tsx
  - apps/web/src/components/ui/command.tsx
  - apps/web/src/components/auth/sign-in-form.tsx
  - apps/web/src/components/auth/sign-up-form.tsx
  - apps/web/src/components/auth/verify-email-banner.tsx
  - apps/web/src/components/workspace/create-workspace-form.tsx
  - apps/web/src/components/workspace/workspace-switcher.tsx
  - apps/web/src/components/workspace/shares-editor.tsx
  - apps/web/src/components/workspace/invite-member-form.tsx
  - apps/web/src/components/settings/sessions-list.tsx
  - apps/web/src/components/settings/locale-select.tsx
  - apps/web/src/components/settings/display-currency-picker.tsx
  - apps/web/src/components/common/currency-picker.tsx
  - apps/web/src/lib/api-client.ts
  - apps/web/src/lib/auth-client.ts
  - apps/web/src/lib/utils.ts
  - apps/web/src/lib/locales.ts
  - apps/web/sw.ts
  - apps/web/test/setup.ts
  - apps/web/test/sign-in-form.test.tsx
  - apps/web/test/locale-switcher.test.tsx
  - apps/web/test/workspace-switcher.test.tsx
  - apps/web/test/display-currency-picker.test.tsx
  - apps/web/Dockerfile
  - apps/web/.dockerignore
  - apps/web/README.md
autonomous: true
requirements: [IDNT-04, IDNT-05, IDNT-06, IDNT-07, IDNT-08, TENT-01, TENT-02, TENT-04, TENT-06, TENT-09, TENT-10, TENT-11, TENT-12, TENT-13, MONY-09, PLAT-05, PLAT-06]
provides:
  - apps/web Next.js 16 App Router skeleton
  - 21 shadcn/ui components (new-york preset, zinc, cssVariables)
  - next-intl proxy.ts + EN/PL/UK message catalogs (~70 keys per UI-SPEC)
  - Hono RPC client wired to apps/api AppType
  - Better Auth client wired with credential sign-in/sign-up
  - Tailwind v4 + Geist Sans + Geist Mono via next/font/google
  - Serwist PWA wiring with Webpack-only build (Turbopack disabled)
  - Vitest 4 + happy-dom + RTL component test harness
  - apps/web/Dockerfile (multi-stage Bun build)
must_haves:
  truths:
    - "apps/web boots Next.js 16 with App Router; bunx next build apps/web exits 0"
    - "apps/web/proxy.ts (NOT middleware.ts) ships next-intl routing per Pitfall 12"
    - "next.config.mjs disables Turbopack via { turbopack: false } per CLAUDE.md compatibility table (Serwist requires Webpack)"
    - "messages/{en,pl,uk}.json contain identical key sets — key parity test passes"
    - "Every UI string from 01-UI-SPEC.md Copywriting section exists as a key in messages/en.json"
    - "i18n.config.ts exports locales = ['en','pl','uk'] and defaultLocale = 'en' (PLAT-06)"
    - "components.json declares style: new-york, baseColor: zinc, cssVariables: true (UI-SPEC §Design System)"
    - "All 21 shadcn components from UI-SPEC §component inventory exist under src/components/ui/"
    - "Geist Sans + Geist Mono loaded via next/font/google in app/layout.tsx (UI-SPEC §Typography)"
    - "Hono RPC client imports AppType from apps/api/src/server.ts via 'hono/client' hc<AppType>"
    - "PC-02 + PC-15: api-client.ts imports apps/api AppType via TypeScript type-only path; never reaches into packages/*/src/{adapters,domain,application,ports}/. apps/api server.ts is a sibling app, not a package — direct import is allowed for the AppType only"
    - "Better Auth client (auth-client.ts) reuses session cookie from apps/api; never proxies password through web bundle"
    - "Sign-in / sign-up forms use react-hook-form + zodResolver (UI-SPEC §Form validation)"
    - "Workspace create form exposes kind selector (PRIVATE | SHARED) AND default_currency picker (TENT-10, TENT-11)"
    - "Workspace switcher persists active_workspace_ids on each toggle via PUT /api/settings/active-workspaces (D-07, TENT-12)"
    - "Shares editor disables Save until sum === 100.00 (UI-SPEC §Member shares editor)"
    - "Verify-email banner shows {seconds}s cooldown; resend POST rate-limited 1/min (D-13)"
    - "Empty workspace list renders workspaces.empty.heading + CTA per UI-SPEC §Workspace lifecycle (D-03 — signup completes with zero workspaces; creation is intentional)"
    - "Settings page binds locale + display_currency + preferred_llm_provider + preferred_stt_provider"
    - "Sessions list renders Current badge for active session and AlertDialog confirm for revoke (IDNT-04)"
    - "/[locale]/health route returns 200 with {status:'ok',commit:<sha>} JSON (used by docker compose healthcheck)"
    - "Serwist service worker (sw.ts) registered via @serwist/next; runtimeCaching MUST exclude /api/* and authenticated HTML"
    - "@testing-library/react + happy-dom render sign-in form without crash (test/sign-in-form.test.tsx)"
    - "Workspace switcher Sheet (mobile <640px) and inline rail (≥640px) per UI-SPEC §Workspace switcher"
    - "Currency picker uses shadcn Command in Popover with top-8 hardcoded list [USD,EUR,PLN,GBP,UAH,CHF,NOK,SEK]"
    - "Light theme only ships in Phase 1; dark CSS vars defined but not toggleable (UI-SPEC §Color)"
    - "apps/web/Dockerfile multi-stage: install -> build (bunx next build) -> standalone runtime"
    - "PC-16: display-currency-picker.test.tsx renders the picker, asserts 8 fiat options visible, simulates selection, asserts PUT mutation fires against /api/settings/display-currency"
  artifacts:
    - path: apps/web/proxy.ts
      provides: "Next.js 16 proxy (renamed from middleware.ts) wiring next-intl routing"
      contains: "createMiddleware"
    - path: apps/web/i18n/routing.ts
      provides: "next-intl defineRouting with locales ['en','pl','uk']"
      contains: "defineRouting"
    - path: apps/web/messages/en.json
      provides: "EN canonical catalog — every key from UI-SPEC Copywriting"
      contains: "auth.signup.heading"
    - path: apps/web/messages/pl.json
      provides: "PL catalog at identical key set"
      contains: "auth.signup.heading"
    - path: apps/web/messages/uk.json
      provides: "UK catalog at identical key set"
      contains: "auth.signup.heading"
    - path: apps/web/i18n.config.ts
      provides: "Single source of locale list + default — adding a language = JSON file + entry here (PLAT-06)"
      contains: "['en', 'pl', 'uk']"
    - path: apps/web/next.config.mjs
      provides: "Next.js 16 config: Turbopack disabled, Serwist plugin wired, output standalone"
      contains: "withSerwist"
    - path: apps/web/components.json
      provides: "shadcn config: new-york, zinc, cssVariables (UI-SPEC)"
      contains: '"style": "new-york"'
    - path: apps/web/src/lib/api-client.ts
      provides: "Hono RPC client typed against apps/api AppType"
      contains: "hc<AppType>"
    - path: apps/web/src/lib/auth-client.ts
      provides: "Better Auth client (cookie-based; no JWT)"
      contains: "createAuthClient"
    - path: apps/web/src/components/workspace/workspace-switcher.tsx
      provides: "Multi-select active-workspace switcher persisting active_workspace_ids (D-07, TENT-12)"
      contains: "active_workspace_ids"
    - path: apps/web/src/components/workspace/shares-editor.tsx
      provides: "SHARED workspace owner shares editor — sum=100 invariant in UI (TENT-13, D-06)"
      contains: "100"
    - path: apps/web/src/app/[locale]/(app)/onboarding/page.tsx
      provides: "First-workspace creation surface (PRIVATE default + default_currency picker)"
      contains: "PRIVATE"
    - path: apps/web/sw.ts
      provides: "Serwist service worker — runtimeCaching excludes /api/* and authenticated HTML"
      contains: "/api/"
    - path: apps/web/test/sign-in-form.test.tsx
      provides: "Vitest 4 + happy-dom + RTL skeleton test"
      contains: "render"
    - path: apps/web/test/display-currency-picker.test.tsx
      provides: "PC-16: PUT mutation + 8-fiat-options assertion for display_currency setting"
      contains: "display-currency"
    - path: apps/web/Dockerfile
      provides: "Multi-stage Bun image producing Next standalone server"
      contains: "next build"
  key_links:
    - from: "apps/web/src/lib/api-client.ts"
      to: "apps/api/src/server.ts AppType"
      via: "hc<AppType> from 'hono/client'"
      pattern: "AppType"
    - from: "apps/web/src/lib/auth-client.ts"
      to: "apps/api Better Auth handler"
      via: "createAuthClient({ baseURL: process.env.NEXT_PUBLIC_API_URL })"
      pattern: "createAuthClient"
    - from: "apps/web/proxy.ts"
      to: "apps/web/i18n/routing.ts"
      via: "createMiddleware(routing)"
      pattern: "from './i18n/routing'"
    - from: "apps/web/src/components/workspace/workspace-switcher.tsx"
      to: "/api/settings/active-workspaces"
      via: "Hono RPC client PUT"
      pattern: "active-workspaces"
    - from: "apps/web/src/components/workspace/shares-editor.tsx"
      to: "/api/workspaces/:id/shares"
      via: "Hono RPC client PUT"
      pattern: "shares"
---

<read_first>
- .planning/phases/01-foundations/01-CONTEXT.md (D-01..D-30 — workspace model, active filter, currency rules)
- .planning/phases/01-foundations/01-UI-SPEC.md (locked design contract — preset, fonts, copy keys, interaction rules)
- .planning/phases/01-foundations/01-RESEARCH.md §Pattern 11, §Pitfall 7, §Pitfall 12 (next-intl proxy + Bun/Next interop)
- .planning/phases/01-foundations/01-VALIDATION.md (rows for plan 8 — locale render, key-parity, dashboard scaffolding)
- .planning/phases/01-foundations/01-05-SUMMARY.md (identity contracts; user.locale, display_currency, providers)
- .planning/phases/01-foundations/01-06-SUMMARY.md (workspace contracts; kind, default_currency, shares, active filter)
- .planning/phases/01-foundations/01-07-SUMMARY.md (Hono AppType export; auth, workspaces, settings routes)
- CLAUDE.md (Next.js 16, next-intl, Tailwind v4, Serwist Webpack-only, react-hook-form, lucide-react)
</read_first>

<truths>
- Stack pin (CLAUDE.md): Next.js ^16 (App Router), next-intl ^4.4.3, tailwindcss ^4, react-hook-form latest, @hookform/resolvers latest, lucide-react latest, vitest ^4, happy-dom latest, @testing-library/react latest, @serwist/next latest, hono ^4.12.16 (for hc client only), zod (match version pinned in plan 00 — v3 or v4)
- D-29: i18n catalogs at apps/web/messages/{en,pl,uk}.json; adding a language = drop a JSON + entry in i18n.config.ts (PLAT-06)
- Pitfall 12: Next.js 16 renamed middleware.ts → proxy.ts; ALWAYS use proxy.ts
- Pitfall 7: If `bunx next dev` fails to start under Bun workspaces, fall back to `bun x --bun next dev` OR `npx next dev`. Document in apps/web/README.md.
- Compatibility (CLAUDE.md): Serwist requires Webpack; Turbopack incompatible — set turbopack: false in next.config.mjs
- D-07: active_workspace_ids comes from user_preferences (NOT cookie). The switcher PUT updates that table via apps/api.
- Pitfall 3 mitigation: Phase 1 does NOT use Better Auth customSession (avoids activeOrganizationId drop). Active filter is decoupled.
- D-15: session is Postgres-backed (no JWT); auth-client uses cookies — never localStorage.
- UI-SPEC §Color: light theme only Phase 1; dark CSS vars exist but not toggleable
- UI-SPEC §Component inventory: exactly 21 shadcn official components — NO third-party registry
- UI-SPEC §Currency picker: top-8 deterministic list [USD, EUR, PLN, GBP, UAH, CHF, NOK, SEK]
- PC-02 + PC-15: api-client.ts uses TypeScript `import type { AppType } from 'apps/api/src/server'` — type-only import (zero runtime). The AppType is `apps/api`'s public RPC contract; web is allowed to import it. Apps/web does NOT import from any `packages/*/src/{adapters,domain,application,ports}/` path; the only `@budget/*` imports allowed in apps/web are package roots (e.g. `@budget/shared-kernel` for shared types like Locale).
</truths>

<acceptance_criteria>
- [ ] `test -f apps/web/proxy.ts` exits 0 AND `test -f apps/web/middleware.ts` exits 1 (Pitfall 12)
- [ ] `grep -q "turbopack: false" apps/web/next.config.mjs` (Serwist + Webpack)
- [ ] `grep -q "withSerwist" apps/web/next.config.mjs`
- [ ] `grep -q "@serwist/next" apps/web/package.json`
- [ ] `grep -q '"style": "new-york"' apps/web/components.json`
- [ ] `grep -q '"baseColor": "zinc"' apps/web/components.json`
- [ ] `grep -q '"cssVariables": true' apps/web/components.json`
- [ ] All 21 component files exist: `for c in button input label form card dialog alert alert-dialog badge checkbox select dropdown-menu separator sheet skeleton sonner table tabs tooltip avatar popover command; do test -f apps/web/src/components/ui/$c.tsx; done`
- [ ] `test -f apps/web/messages/en.json && test -f apps/web/messages/pl.json && test -f apps/web/messages/uk.json`
- [ ] All three catalogs share identical key sets
- [ ] `grep -q "auth.signup.heading" apps/web/messages/en.json`
- [ ] `grep -q "workspaces.create.kind.private" apps/web/messages/en.json`
- [ ] `grep -q "workspace.shares.total.error" apps/web/messages/en.json`
- [ ] `grep -q "['en', 'pl', 'uk']" apps/web/i18n.config.ts` (PLAT-06)
- [ ] `grep -q "hc<AppType>" apps/web/src/lib/api-client.ts`
- [ ] PC-02 + PC-15: api-client.ts uses TYPE-ONLY import for AppType — no runtime import: `grep -E "import\\s+type\\s+\\{\\s*AppType" apps/web/src/lib/api-client.ts` exits 0
- [ ] PC-02 + PC-15: apps/web does NOT import from packages/*/src/{adapters,domain,application,ports}: `! grep -RE "from ['\"]@budget/[a-z-]+/(src/(adapters|domain|application|ports)|dist)" apps/web/src` exits 0
- [ ] `grep -q "createAuthClient" apps/web/src/lib/auth-client.ts`
- [ ] `grep -q "Geist" apps/web/src/app/layout.tsx` (next/font/google Geist Sans + Mono)
- [ ] `grep -q "PRIVATE" apps/web/src/components/workspace/create-workspace-form.tsx`
- [ ] `grep -q "active_workspace_ids" apps/web/src/components/workspace/workspace-switcher.tsx`
- [ ] `grep -q "100" apps/web/src/components/workspace/shares-editor.tsx`
- [ ] sw.ts runtimeCaching excludes /api: `grep -E "url.*/api" apps/web/sw.ts` AND `grep -E "deny|exclude|NetworkOnly.*api" apps/web/sw.ts` exit 0
- [ ] `bunx tsc --noEmit --project apps/web/tsconfig.json` exits 0
- [ ] `bunx next build apps/web` exits 0 (Webpack build, standalone output)
- [ ] `bunx vitest run --root apps/web` exits 0 (skeleton tests pass)
- [ ] `bunx eslint apps/web --max-warnings 0` exits 0
- [ ] `bunx depcruise --config .dependency-cruiser.cjs apps/web` exits 0 (no domain → adapter imports introduced; PC-02 boundary holds)
- [ ] PC-16: `test -f apps/web/test/display-currency-picker.test.tsx` exits 0
- [ ] PC-16: display-currency test asserts 8 fiat options + PUT mutation: `grep -F 'USD' apps/web/test/display-currency-picker.test.tsx && grep -F 'PUT' apps/web/test/display-currency-picker.test.tsx && grep -F 'display-currency' apps/web/test/display-currency-picker.test.tsx` exits 0
- [ ] `docker build -t budget-web:test -f apps/web/Dockerfile .` exits 0 in CI
- [ ] `apps/web/Dockerfile` contains `next build` AND multi-stage (`FROM .* AS`)
- [ ] curl http://localhost:3000/en/health returns 200 + JSON (verified via docker compose smoke in plan 9)
</acceptance_criteria>

<tasks>

<task id="01.08.01" type="auto">
  <description>Scaffold apps/web Next.js 16 App Router with tailwindcss v4, shadcn/ui new-york preset (zinc, cssVariables), 21 official shadcn components, components.json. Initialize via `cd apps/web && bunx shadcn@latest init --base-color zinc --style new-york --css-variables --yes` then add components: button input label form card dialog alert alert-dialog badge checkbox select dropdown-menu separator sheet skeleton sonner table tabs tooltip avatar popover command. Generate src/lib/utils.ts (cn helper). Wire Geist Sans + Geist Mono via next/font/google in src/app/layout.tsx. Configure tsconfig.json extending tsconfig.base.json (paths alias @/*). Forbidden: any third-party shadcn registry. Pin shadcn-ui CLI per plan 00 lockfile.</description>
  <files>apps/web/package.json, apps/web/tsconfig.json, apps/web/next.config.mjs, apps/web/postcss.config.mjs, apps/web/tailwind.config.ts, apps/web/components.json, apps/web/src/app/layout.tsx, apps/web/src/app/global.css, apps/web/src/components/ui/*.tsx (21 files), apps/web/src/lib/utils.ts</files>
  <verify>
    <automated>bash -c 'set -e; bunx tsc --noEmit --project apps/web/tsconfig.json; for c in button input label form card dialog alert alert-dialog badge checkbox select dropdown-menu separator sheet skeleton sonner table tabs tooltip avatar popover command; do test -f apps/web/src/components/ui/$c.tsx || { echo "missing $c"; exit 1; }; done; grep -q "\"style\": \"new-york\"" apps/web/components.json; grep -q "\"baseColor\": \"zinc\"" apps/web/components.json; grep -q "Geist" apps/web/src/app/layout.tsx'</automated>
  </verify>
  <deps>01.00</deps>
</task>

<task id="01.08.02" type="auto">
  <description>Wire next-intl on App Router with EN/PL/UK catalogs. Create apps/web/proxy.ts (NOT middleware.ts — Pitfall 12) using `createMiddleware` from 'next-intl/middleware' with matcher `['/((?!api|_next|.*\\..*).*)']`. Create apps/web/i18n/routing.ts with `defineRouting({locales: ['en','pl','uk'], defaultLocale: 'en', localePrefix: 'as-needed'})`. Create apps/web/i18n/request.ts loading the per-request locale messages. Create apps/web/i18n.config.ts re-exporting `locales = ['en','pl','uk']` (PLAT-06 single source of truth). Populate messages/en.json with EVERY key from 01-UI-SPEC.md §Copywriting Contract (auth.*, settings.*, workspaces.*, workspace.*, state.* — ~70 keys). Translate to messages/pl.json and messages/uk.json at identical key set (machine translation acceptable; key parity is the gate). Use ICU MessageFormat for currency formatting per UI-SPEC §Tone rules.</description>
  <files>apps/web/proxy.ts, apps/web/i18n/routing.ts, apps/web/i18n/request.ts, apps/web/i18n.config.ts, apps/web/messages/en.json, apps/web/messages/pl.json, apps/web/messages/uk.json, apps/web/src/lib/locales.ts</files>
  <verify>
    <automated>bash -c 'set -e; test -f apps/web/proxy.ts; test ! -f apps/web/middleware.ts; grep -q "createMiddleware" apps/web/proxy.ts; grep -qE "locales.*en.*pl.*uk" apps/web/i18n.config.ts'</automated>
  </verify>
  <deps>01.08.01</deps>
</task>

<task id="01.08.03" type="auto">
  <description>Wire Hono RPC client + Better Auth client. Create apps/web/src/lib/api-client.ts importing AppType from apps/api/src/server.ts via TYPE-ONLY import (`import type { AppType } from '../../../api/src/server'` — relative workspace path; PC-02/PC-15: type-only, zero runtime, AppType is apps/api's public contract). Export `api = hc<AppType>(process.env.NEXT_PUBLIC_API_URL!)`. Create apps/web/src/lib/auth-client.ts with `createAuthClient({ baseURL })` from better-auth/client. Add NEXT_PUBLIC_API_URL to .env.example (already present per plan 00 — verify and update if missing). Create /[locale]/health server route (apps/web/src/app/[locale]/health/route.ts) returning `{status:'ok',commit: process.env.GIT_COMMIT ?? 'dev'}` JSON for compose healthcheck. PC-02 + PC-15: do NOT import from `@budget/identity/dist/...` or `@budget/identity/src/adapters/...` — apps/web only consumes apps/api's HTTP surface (AppType for RPC + Better Auth client).</description>
  <files>apps/web/src/lib/api-client.ts, apps/web/src/lib/auth-client.ts, apps/web/src/app/[locale]/health/route.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "hc<AppType>" apps/web/src/lib/api-client.ts; grep -qE "import\\s+type\\s+\\{\\s*AppType" apps/web/src/lib/api-client.ts; grep -q "createAuthClient" apps/web/src/lib/auth-client.ts; grep -q "status.*ok" apps/web/src/app/\[locale\]/health/route.ts; ! grep -RE "from [\"\x27]@budget/[a-z-]+/(src/(adapters|domain|application|ports)|dist)" apps/web/src'</automated>
  </verify>
  <deps>01.08.01, 01.08.02</deps>
</task>

<task id="01.08.04" type="auto">
  <description>Build auth surfaces per UI-SPEC §Auth flows. Create [locale]/sign-in/page.tsx and [locale]/sign-up/page.tsx using Server Components for layout + Client Components for forms (sign-in-form.tsx, sign-up-form.tsx). Forms use react-hook-form + zodResolver; submit buttons disable on submit per UI-SPEC §Loading states; inline errors at 14px red text; submit-time error renders shadcn Alert (variant=destructive) above form. Sign-up form includes locale picker (auth.signup.locale.label) populated from i18n.config.ts. Build verify-email-banner.tsx as a sticky full-width Alert (warning surface) with `Resend` button on 60s cooldown calling Better Auth resend endpoint. Banner persists across all (app) routes until verified — placement in [locale]/(app)/layout.tsx. Workspace creation CTA on the empty state is enabled visually but on click shows tooltip + alert with workspaces.verify_required (UI-SPEC §Email-verify banner).</description>
  <files>apps/web/src/app/[locale]/sign-in/page.tsx, apps/web/src/app/[locale]/sign-up/page.tsx, apps/web/src/components/auth/sign-in-form.tsx, apps/web/src/components/auth/sign-up-form.tsx, apps/web/src/components/auth/verify-email-banner.tsx, apps/web/src/app/[locale]/(app)/layout.tsx</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "react-hook-form" apps/web/src/components/auth/sign-in-form.tsx; grep -q "zodResolver" apps/web/src/components/auth/sign-in-form.tsx; grep -q "auth.signup.locale.label" apps/web/src/components/auth/sign-up-form.tsx; grep -q "workspaces.verify_required" apps/web/src/components/auth/verify-email-banner.tsx || grep -q "workspaces.verify_required" apps/web/src/app/\[locale\]/\(app\)/layout.tsx; grep -q "auth.verify.banner.cooldown" apps/web/src/components/auth/verify-email-banner.tsx'</automated>
  </verify>
  <deps>01.08.02, 01.08.03</deps>
</task>

<task id="01.08.05" type="auto">
  <description>Build workspace lifecycle surfaces. Create [locale]/(app)/onboarding/page.tsx (first-workspace creation; PRIVATE preselected; default_currency picker required). Create [locale]/(app)/workspaces/page.tsx listing user workspaces grouped by kind with the multi-select switcher inline. Create [locale]/(app)/workspaces/[id]/page.tsx with Tabs for Members + Shares + Settings. Create create-workspace-form.tsx (kind RadioGroup PRIVATE|SHARED, name input, default_currency Command-in-Popover picker per UI-SPEC §Currency picker with hardcoded top-8 [USD,EUR,PLN,GBP,UAH,CHF,NOK,SEK], permanent helper text workspaces.create.currency.helper). Create workspace-switcher.tsx: Sheet on mobile (<640px), inline rail (≥640px); Checkbox per row + kind chip + currency badge; grouped headers `Private budgets` / `Shared budgets`; per-toggle PUT to /api/settings/active-workspaces (api-client) — optimistic UI with revert + toast on error. Build shares-editor.tsx (Table with member rows, percentage Input type=number step=0.01 min=0 max=100 width w-24 with `%` Mono suffix; live total Mono in tfoot; Save disabled until total === 100.00 ± 0.005). Build invite-member-form.tsx (email Input + Send invitation CTA; success toast workspace.invite.success). Wire transfer-ownership and leave-workspace AlertDialog confirmations (workspace.leave.confirm.*).</description>
  <files>apps/web/src/app/[locale]/(app)/onboarding/page.tsx, apps/web/src/app/[locale]/(app)/workspaces/page.tsx, apps/web/src/app/[locale]/(app)/workspaces/[id]/page.tsx, apps/web/src/components/workspace/create-workspace-form.tsx, apps/web/src/components/workspace/workspace-switcher.tsx, apps/web/src/components/workspace/shares-editor.tsx, apps/web/src/components/workspace/invite-member-form.tsx, apps/web/src/components/common/currency-picker.tsx</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "PRIVATE" apps/web/src/components/workspace/create-workspace-form.tsx; grep -q "SHARED" apps/web/src/components/workspace/create-workspace-form.tsx; grep -q "active_workspace_ids" apps/web/src/components/workspace/workspace-switcher.tsx; grep -q "100" apps/web/src/components/workspace/shares-editor.tsx; grep -q "USD" apps/web/src/components/common/currency-picker.tsx; grep -q "PLN" apps/web/src/components/common/currency-picker.tsx; grep -q "UAH" apps/web/src/components/common/currency-picker.tsx; grep -q "workspaces.create.currency.helper" apps/web/src/components/workspace/create-workspace-form.tsx; grep -q "workspace.shares.total.error" apps/web/src/components/workspace/shares-editor.tsx; grep -q "Sheet" apps/web/src/components/workspace/workspace-switcher.tsx'</automated>
  </verify>
  <deps>01.08.04</deps>
</task>

<task id="01.08.06" type="auto">
  <description>Build settings surface per UI-SPEC §Settings. Create [locale]/(app)/settings/page.tsx with Tabs: Sessions, Locale, Display Currency, Providers. Build sessions-list.tsx (Table: Device / Last active / Current? / Action; Current row shows neutral badge no revoke; other rows DropdownMenu → AlertDialog confirm with settings.sessions.revoke.confirm.* keys). Build locale-select.tsx (shadcn Select bound to i18n.config.ts locales; PUT /api/settings/locale on change). Build display-currency-picker.tsx reusing currency-picker.tsx with helper settings.display_currency.helper (MONY-09); on select, fires PUT /api/settings/display-currency mutation via api-client. Add provider preference selects (preferred_llm_provider, preferred_stt_provider) bound to apps/api settings routes (IDNT-07, IDNT-08). Save button shows settings.save.success toast. UI for Phase 5 wires the actual STT/LLM adapters; Phase 1 just ships the picker. PC-16: also create apps/web/test/display-currency-picker.test.tsx — render picker, assert 8 fiat options ([USD, EUR, PLN, GBP, UAH, CHF, NOK, SEK]) appear, simulate a selection via fireEvent.click, assert vi.mocked api-client.PUT called with /api/settings/display-currency body { currency: '<selected>' }.</description>
  <files>apps/web/src/app/[locale]/(app)/settings/page.tsx, apps/web/src/components/settings/sessions-list.tsx, apps/web/src/components/settings/locale-select.tsx, apps/web/src/components/settings/display-currency-picker.tsx, apps/web/test/display-currency-picker.test.tsx</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "settings.sessions.revoke.confirm.title" apps/web/src/components/settings/sessions-list.tsx; grep -q "settings.display_currency.helper" apps/web/src/components/settings/display-currency-picker.tsx; grep -q "preferred_llm_provider" apps/web/src/app/\[locale\]/\(app\)/settings/page.tsx; grep -q "preferred_stt_provider" apps/web/src/app/\[locale\]/\(app\)/settings/page.tsx; grep -q "AlertDialog" apps/web/src/components/settings/sessions-list.tsx; test -f apps/web/test/display-currency-picker.test.tsx; grep -q "USD" apps/web/test/display-currency-picker.test.tsx; grep -q "display-currency" apps/web/test/display-currency-picker.test.tsx; grep -q "PUT" apps/web/test/display-currency-picker.test.tsx'</automated>
  </verify>
  <deps>01.08.04, 01.08.05</deps>
</task>

<task id="01.08.07" type="auto">
  <description>Wire Serwist PWA per CLAUDE.md compatibility note. Add @serwist/next dependency. Create apps/web/sw.ts using `defaultCache` from @serwist/next/worker MINUS any rule that matches /api/* OR authenticated HTML — use a NetworkOnly strategy for both, and a denylist that blocks /api/auth/*, /api/workspaces/*, /api/settings/*. Update next.config.mjs to wrap with `withSerwist({ swSrc: 'sw.ts', swDest: 'public/sw.js', disable: process.env.NODE_ENV === 'development' })` AND set `turbopack: false` (CLAUDE.md: Serwist incompatible with Turbopack). Add manifest.json (PWA basics) under apps/web/public/. Threat T-9 mitigation: comment in sw.ts explaining the /api/* and authenticated-HTML denylist prevents tenant-A cached responses from being served to a tenant-B session on the same browser.</description>
  <files>apps/web/sw.ts, apps/web/next.config.mjs, apps/web/public/manifest.json, apps/web/package.json</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "@serwist/next" apps/web/package.json; grep -q "withSerwist" apps/web/next.config.mjs; grep -q "turbopack: false" apps/web/next.config.mjs; grep -q "/api" apps/web/sw.ts; grep -qE "(NetworkOnly|denylist|exclude)" apps/web/sw.ts; grep -q "T-9" apps/web/sw.ts'</automated>
  </verify>
  <deps>01.08.01</deps>
</task>

<task id="01.08.08" type="auto">
  <description>Wire Vitest 4 + happy-dom + RTL component test harness (apps/web/vitest.config.ts already created in plan 00). Create apps/web/test/setup.ts loading @testing-library/jest-dom and the next-intl test provider. Write skeleton tests: (1) test/sign-in-form.test.tsx — render the form, assert auth.signin.heading text from messages/en.json appears; (2) test/locale-switcher.test.tsx — render locale-select with all three locales; (3) test/workspace-switcher.test.tsx — render switcher with two mock workspaces, assert one PRIVATE row + one SHARED row, click toggles, assert PUT request fires with updated active_workspace_ids array. Use vi.mock for api-client and auth-client. The PC-16 display-currency-picker.test.tsx is authored in 01.08.06.</description>
  <files>apps/web/test/setup.ts, apps/web/test/sign-in-form.test.tsx, apps/web/test/locale-switcher.test.tsx, apps/web/test/workspace-switcher.test.tsx</files>
  <verify>
    <automated>bunx vitest run --root apps/web --reporter=basic</automated>
  </verify>
  <deps>01.08.04, 01.08.05, 01.08.06</deps>
</task>

<task id="01.08.09" type="auto">
  <description>Author apps/web/Dockerfile (multi-stage Bun image producing Next.js standalone server). Stage 1: `oven/bun:1.2-slim` install. Stage 2: build with `bunx next build` (uses Webpack per turbopack:false). Stage 3: bun:slim runtime copying `.next/standalone`, `.next/static`, `public`, server.js. EXPOSE 3000. CMD ["bun","server.js"]. Add HEALTHCHECK CMD pointing at /en/health. Author apps/web/.dockerignore (exclude node_modules, .next, test, README). Update apps/web/README.md documenting the Pitfall 7 fallback (`bunx next dev` issues → use `npx next dev` for local dev) and PLAT-06 instructions for adding a language.</description>
  <files>apps/web/Dockerfile, apps/web/.dockerignore, apps/web/README.md</files>
  <verify>
    <automated>bash -c 'set -e; grep -qE "FROM .* AS " apps/web/Dockerfile; grep -q "next build" apps/web/Dockerfile; grep -q "EXPOSE 3000" apps/web/Dockerfile; grep -q "HEALTHCHECK" apps/web/Dockerfile; grep -q "/en/health" apps/web/Dockerfile; grep -qi "PLAT-06\|adding a language" apps/web/README.md; grep -q "Pitfall 7\|bun.*next dev" apps/web/README.md'</automated>
  </verify>
  <deps>01.08.07, 01.08.08</deps>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Next.js server | Client RSC requests + form submissions |
| Next.js server → apps/api (Hono) | Hono RPC client + Better Auth cookie forwarding |
| Service worker cache → page | Cached responses served to authenticated DOM |
| apps/web → packages/* | PC-02: web bundle imports apps/api AppType (sibling app) and `@budget/shared-kernel` package root only; never reaches into packages/*/src/{adapters,domain,application,ports} |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-8 | I (Information disclosure) | Better Auth session ↔ active workspace | mitigated | Phase 1 does NOT use customSession (Pitfall 3); active_workspace_ids lives in user_preferences and is read by tenant-guard (plan 07). Switcher PUT goes through authenticated /api/settings/active-workspaces — server intersects with actual memberships before persisting. |
| T-9 | I (Information disclosure) | Serwist runtime cache | mitigated | sw.ts runtimeCaching uses NetworkOnly + explicit denylist for /api/auth/*, /api/workspaces/*, /api/settings/*, and any authenticated HTML route. Plan 10 (test #6, PC-10) adds an end-to-end Playwright assertion that tenant-A workspaces never appear in a tenant-B session via cache. |
| T-10 | T (Tampering) | State-changing /api/* via cookie auth | mitigated | Better Auth ships SameSite=Lax cookie; auth-client adds CSRF token header on POST/PUT/PATCH/DELETE. Hono RPC client uses fetch credentials: 'include'. |
| T-11 | T (Tampering) | next-intl locale routing | mitigated | proxy.ts uses createMiddleware(routing) — locales validated against the `routing.locales` allowlist. |
| T-1 | I | RPC requests bypassing tenant guard | mitigated (transferred) | Plan 07 owns tenant-guard; web bundle never holds tenant_id. plan 10 adds the leak-CI gate. |
| T-12 | T (Tampering) | apps/web reaching into packages/* internals (PC-02) | mitigated | dep-cruiser rule `apps-only-public-package-surface` (Plan 00) bans apps/** → packages/*/src/{adapters,domain,application,ports}; CI grep also bans `@budget/*/dist/` and `@budget/*/src/` paths in apps/web |
</threat_model>

<verification>
Run all of the following from repo root; all must exit 0:

```bash
bash -c '
set -e
# 1. Files / structural
test -f apps/web/proxy.ts
test ! -f apps/web/middleware.ts
test -f apps/web/i18n.config.ts
test -f apps/web/messages/en.json
test -f apps/web/messages/pl.json
test -f apps/web/messages/uk.json
test -f apps/web/sw.ts
test -f apps/web/Dockerfile
test -f apps/web/test/display-currency-picker.test.tsx          # PC-16

# 2. Locked configuration
grep -q "\"style\": \"new-york\"" apps/web/components.json
grep -q "\"baseColor\": \"zinc\"" apps/web/components.json
grep -q "turbopack: false" apps/web/next.config.mjs
grep -q "withSerwist" apps/web/next.config.mjs

# 3. 21 shadcn components present
for c in button input label form card dialog alert alert-dialog badge checkbox select dropdown-menu separator sheet skeleton sonner table tabs tooltip avatar popover command; do
  test -f "apps/web/src/components/ui/$c.tsx" || { echo "missing $c"; exit 1; }
done

# 4. Locale catalog parity (PLAT-06)
node -e "
const fs=require(\"fs\");
const flat=(o,p=\"\",r=[])=>{Object.entries(o).forEach(([k,v])=>{const n=p?p+\".\"+k:k;if(v&&typeof v===\"object\"&&!Array.isArray(v))flat(v,n,r);else r.push(n)});return r};
const en=flat(JSON.parse(fs.readFileSync(\"apps/web/messages/en.json\",\"utf8\"))).sort();
const pl=flat(JSON.parse(fs.readFileSync(\"apps/web/messages/pl.json\",\"utf8\"))).sort();
const uk=flat(JSON.parse(fs.readFileSync(\"apps/web/messages/uk.json\",\"utf8\"))).sort();
if(JSON.stringify(en)!==JSON.stringify(pl))throw new Error(\"PL drift\");
if(JSON.stringify(en)!==JSON.stringify(uk))throw new Error(\"UK drift\");
console.log(\"key parity ok: \"+en.length+\" keys\");
"

# 5. UI-SPEC required keys present
for k in auth.signup.heading auth.signin.heading auth.reset.request.heading auth.verify.banner.heading auth.verify.banner.cooldown settings.heading settings.sessions.tab settings.display_currency.label settings.display_currency.helper workspaces.empty.heading workspaces.create.kind.private workspaces.create.kind.shared workspaces.create.currency.helper workspaces.switcher.label workspaces.switcher.first_pick workspaces.verify_required workspace.shares.heading workspace.shares.total.error workspace.shares.save workspace.invite.heading state.error.generic state.error.network; do
  grep -q "\"$k\"" apps/web/messages/en.json || { echo "missing key: $k"; exit 1; }
done

# 6. Type + lint + dep gate + build
bunx tsc --noEmit --project apps/web/tsconfig.json
bunx eslint apps/web --max-warnings 0
bunx depcruise --config .dependency-cruiser.cjs apps/web
NEXT_PUBLIC_API_URL=http://localhost:3001 bunx next build apps/web

# 7. PC-02 + PC-15: apps/web does not reach into packages/* internals or /dist/
! grep -RE "from [\"\x27]@budget/[a-z-]+/(src/(adapters|domain|application|ports)|dist)" apps/web/src
grep -qE "import\\s+type\\s+\\{\\s*AppType" apps/web/src/lib/api-client.ts

# 8. Component tests
bunx vitest run --root apps/web --reporter=basic

# 9. Serwist denies /api routes (T-9)
grep -E "/api" apps/web/sw.ts >/dev/null
grep -E "(NetworkOnly|denylist|exclude)" apps/web/sw.ts >/dev/null

echo "all checks pass"
'
```
</verification>

<success_criteria>
- apps/web is a buildable Next.js 16 App Router app with Webpack output
- next-intl ships EN/PL/UK at exact key parity for every UI-SPEC string
- 21 shadcn components present; new-york + zinc + cssVariables locked
- Hono RPC client typed against apps/api AppType (PC-02 + PC-15: type-only import)
- Better Auth client wired via cookie
- PC-02 + PC-15: apps/web does NOT import from packages/*/src/{adapters,domain,application,ports} or /dist/ paths; only AppType (sibling app) and @budget/shared-kernel package root
- Workspace switcher persists active_workspace_ids per toggle
- Workspace creation form enforces kind + immutable default_currency at UX layer
- Shares editor disables Save until sum === 100.00
- Verify-email banner enforces 60s resend cooldown
- Sessions list supports per-row revoke via AlertDialog
- PC-16: display-currency-picker.test.tsx asserts 8 fiat options + PUT mutation against /api/settings/display-currency
- Serwist runtime cache excludes /api/* and authenticated HTML (T-9; Plan 10 PC-10 covers end-to-end)
- Vitest skeleton tests pass; tsc + eslint + depcruise green
- apps/web/Dockerfile produces a Next standalone production image
</success_criteria>

<output>
.planning/phases/01-foundations/01-08-SUMMARY.md
</output>
