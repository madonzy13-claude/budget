# Phase 3: Navigation, Home & BDP Frame - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 33 (8 delete, 4 modify, 21 create)
**Analogs found:** 30 / 33 (3 have no close analog → planner uses RESEARCH.md patterns)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/app/[locale]/(app)/layout.tsx` (rewrite) | RSC layout | session validate + render shell | self (current state) | exact (modify-in-place) |
| `apps/web/src/app/[locale]/(app)/page.tsx` (new) | Async RSC page | RSC → serverApiFetch → render grid | `apps/web/src/app/[locale]/(app)/workspaces/page.tsx` | exact |
| `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` (new) | RSC placeholder | static markup | `workspaces/page.tsx` empty-state branch | role-match |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` (new) | Async RSC nested layout | params → fetch tasks → render shell + `{children}` | `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx` | exact |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/page.tsx` (new) | RSC redirect | `redirect('./spendings')` | inline `redirect()` in `workspaces/[wsId]/layout.tsx` line 37 | role-match |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx` (new) | RSC placeholder | static markup | `workspaces/[wsId]/recurring/page.tsx` | role-match (placeholder shape) |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx` (new) | RSC placeholder | static markup | `workspaces/[wsId]/recurring/page.tsx` | role-match |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx` (new) | RSC placeholder | static markup | `workspaces/[wsId]/recurring/page.tsx` | role-match |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx` (new) | RSC placeholder | static markup | `workspaces/[wsId]/recurring/page.tsx` | role-match |
| `apps/web/src/components/budgeting/top-nav.tsx` (new) | RSC composition | renders shell pieces | header in current `(app)/layout.tsx` lines 44–67 | exact (extraction) |
| `apps/web/src/components/budgeting/budget-switcher.tsx` (new) | Client Component | props → Popover → router.push | `components/workspace/workspace-switcher.tsx` | exact (rewrite + Sheet→Popover swap) |
| `apps/web/src/components/budgeting/new-budget-button.tsx` (new) | Client Component | onClick → router.push | `components/auth/sign-out-button.tsx` | role-match |
| `apps/web/src/components/budgeting/budget-card.tsx` (new) | Async RSC | serverApiFetch(id) → render Link | `app/[locale]/(app)/workspaces/page.tsx` lines 19–25 (RSC fetch) + `components/workspace/workspace-row.tsx` (link card markup) | role-match |
| `apps/web/src/components/budgeting/budget-card-skeleton.tsx` (new) | RSC pure markup | none | `components/ui/skeleton.tsx` consumers | partial |
| `apps/web/src/components/budgeting/home-cards-grid.tsx` (new) | RSC | iterates + Suspense wrap | `workspaces/page.tsx` lines 70–80 (list iterator) | role-match |
| `apps/web/src/components/budgeting/placeholder-chart.tsx` (new) | RSC pure markup | static | empty-state block in `workspaces/page.tsx` lines 32–50 | role-match |
| `apps/web/src/components/budgeting/bdp-tabs.tsx` (new) | Client Component | usePathname → Link list | `components/workspace/workspace-sidebar.tsx` | exact |
| `apps/web/src/components/budgeting/task-banner.tsx` (new) | Client wrapper | RSC props → React Query poll | none — first React-Query polling surface | no analog |
| `apps/web/src/components/budgeting/task-banner-row.tsx` (new) | Client Component | static markup + disabled button | `components/workspace/workspace-row.tsx` (row layout) | partial |
| `apps/web/src/components/ui/tabs.tsx` (rewrite) | Primitive | add `variant="pill"` via CVA | `components/ui/button.tsx` (CVA variant pattern) | role-match |
| `apps/api/src/routes/budgets.ts` (modify) | Hono route handler | tenant → service → JSON | self (existing routes in file) | exact (modify-in-place) |
| `apps/api/src/routes/tasks.ts` (new) | Hono route factory | tenant → service → JSON | `apps/api/src/routes/wallets.ts` | exact |
| `packages/budgeting/src/application/get-budget-home-summary.ts` (new) | Application service | Compose Repos + FxProvider → DTO | `packages/budgeting/src/application/get-latest-transactions.ts` | role-match (read-only composition) |
| `packages/budgeting/src/application/list-pending-tasks.ts` (new) | Application service | Repo.listPending → DTO | `packages/budgeting/src/application/list-pending-drafts.ts` | exact |
| `packages/budgeting/src/ports/task-repo.ts` (new) | Port interface | type-only | `packages/budgeting/src/ports/reserve-balance-repo.ts` | exact |
| `packages/budgeting/src/adapters/persistence/task-repo.ts` (new) | Drizzle adapter | tenant tx → SELECT → rows | `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` | exact |
| `apps/api/test/routes/tasks.test.ts` (new) | Integration test | real PG → seed → assert | `apps/api/test/routes/wallets.test.ts` | exact |
| `apps/api/test/routes/budgets.test.ts` (extend) | Integration test | add `home-summary` cases | self (existing file) | exact |
| `apps/web/test/budget-switcher.test.tsx` (new) | Vitest + RTL | mock i18n + render + fireEvent | `apps/web/test/workspace-switcher.test.tsx` | exact |
| `apps/web/test/components/bdp-tabs.test.tsx` (new) | Vitest + RTL | mock `usePathname` | `apps/web/test/locale-switcher.test.tsx` | role-match |
| `apps/web/test/components/budget-card.test.tsx` (new) | Vitest + RTL (async RSC) | mock serverApiFetch | `apps/web/test/components/fx-freshness-badge.test.tsx` | partial |
| `apps/web/test/components/task-banner.test.tsx` (new) | Vitest + RTL | RQ provider + initial data | `apps/web/test/components/pending-drafts-inbox.test.tsx` | role-match |
| `apps/web/e2e/features/budget-switcher.feature` (new) | Playwright BDD | Gherkin scenarios | existing `apps/web/e2e/features/*.feature` (planner verifies) | role-match (project convention) |

---

## Pattern Assignments

### `apps/web/src/app/[locale]/(app)/layout.tsx` (RSC layout — REWRITE)

**Analog:** self (current file)

**Imports pattern** (current lines 1–8): keep `getTranslations`, `cookies`, `redirect`, `getServerSession`, `BrandMark`, `SignOutButton`, `SiteFooter`. **Add** `TopNav` (new extraction).

**Session-gate pattern** (lines 28–38) — KEEP VERBATIM, do not touch the stale-cookie redirect logic:
```tsx
const session = await getServerSession();
if (!session) {
  const cookieStore = await cookies();
  const hasStaleCookie = !!cookieStore.get("better-auth.session_token")?.value;
  const reason = hasStaleCookie ? "session_expired" : "required";
  redirect(`/${locale}/sign-in?reason=${reason}`);
}
```

**Header shell pattern** (lines 44–67) — REPLACE the center `<nav>` with `<TopNav locale={locale} />`. Keep `<header className="sticky top-0 z-40 ...">`, keep `<BrandMark>`, keep `<SignOutButton>`, keep `<SiteFooter>`.

**Deviations:**
- Drop the two inline `<Link>` (workspaces, settings) — replaced by `<BudgetSwitcher>` + `<NewBudgetButton>`.
- Move composition into `components/budgeting/top-nav.tsx` so it can be unit-tested.
- Layout must NOT fetch budgets list itself — that lives in `<TopNav>` (RSC) which calls `serverApiFetch(null, '/budgets/active')` and passes the list to `<BudgetSwitcher>` as props.

---

### `apps/web/src/components/budgeting/top-nav.tsx` (NEW — RSC composition)

**Analog:** header block in current `(app)/layout.tsx` lines 44–67.

**Pattern excerpt** (current header):
```tsx
<header className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 backdrop-blur">
  <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
    <div className="flex items-center gap-8">
      <BrandMark href={`/${locale}/budgets`} />
      <nav className="hidden items-center gap-6 sm:flex"> ... </nav>
    </div>
    <div className="flex items-center gap-2">
      <SignOutButton locale={locale} />
    </div>
  </div>
</header>
```

**Server-fetch pattern** (from `workspaces/page.tsx` lines 19–25):
```tsx
const res = await serverApiFetch(null, "/budgets/active");
if (!res.ok) return [];
const body = (await res.json()) as { workspaces?: WorkspaceLite[] };
return body.workspaces ?? [];
```

**Deviations:** Top-nav fetches `/budgets/active` server-side, derives `activeBudgetId` from URL via `headers().get('x-next-pathname')` OR receives via prop from `layout.tsx`. Passes `budgets[]` + `activeBudgetId` to client `<BudgetSwitcher>`. Adds `<NewBudgetButton>` aside the switcher. Spec calls for max-width 1280 (UI-SPEC §1) — change `max-w-6xl` → `max-w-[1280px]`. Spec calls for **32px** outer gutter on desktop — `px-4 sm:px-8`.

---

### `apps/web/src/components/budgeting/budget-switcher.tsx` (NEW Client Component — REWRITE of workspace-switcher.tsx)

**Analog:** `apps/web/src/components/workspace/workspace-switcher.tsx`

**Imports pattern** (lines 1–17) — KEEP `"use client"`, `useState`, `useTranslations`, `Badge`. **Replace** Sheet imports with Popover imports, **remove** Checkbox/Separator/toast.
```tsx
"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Lock, Users } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
```

**Type pattern** (lines 19–24) — RENAME but keep shape:
```tsx
export interface BudgetSummary {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
}
```

**Grouped-list pattern** (lines 43–94) — KEEP the Personal/Shared split and the `renderGroup` helper. **Replace** the `<label>` + `<Checkbox>` row with a `<button role="menuitemradio" aria-checked>` row:
```tsx
const privateWs = budgets.filter((b) => b.kind === "PRIVATE");
const sharedWs  = budgets.filter((b) => b.kind === "SHARED");

const renderGroup = (group, heading) => {
  if (group.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="px-3 text-caption uppercase tracking-wide text-[var(--muted-foreground)]">{heading}</p>
      {group.map((b) => (
        <button key={b.id}
                role="menuitemradio"
                aria-checked={b.id === activeBudgetId}
                onClick={() => onPick(b.id)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-[var(--surface-elevated-dark)]">
          {b.id === activeBudgetId
            ? <Check className="h-4 w-4 text-[var(--body-on-dark)]" />
            : <span className="h-4 w-4" />}
          {b.kind === "PRIVATE" ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          <span className="flex-1 text-sm">{b.name}</span>
          <Badge variant="outline" className="num text-[11px]">{b.default_currency}</Badge>
        </button>
      ))}
    </div>
  );
};
```

**Deviations from `workspace-switcher.tsx`:**
- **No Sheet, no mobile branch.** Single Popover handles both breakpoints (D-PH3-08). Delete lines 142–177 entirely.
- **No checkbox / no `api.settings["active-workspaces"].$put`.** Selecting a row → `router.push('/${locale}/budgets/${id}/spendings')`. Delete `persistActiveIds` (lines 108–126).
- **No toast / no rollback.** Selection is purely client navigation, no async error path.
- Trigger must be a Popover-trigger button with: kind icon (Lock/Users) + name (`.text-title-sm`) + ChevronDown.
- Active-row indicator = leading `Check` lucide icon (D-PH3-06) — never yellow.

---

### `apps/web/src/components/budgeting/new-budget-button.tsx` (NEW Client Component)

**Analog:** `apps/web/src/components/auth/sign-out-button.tsx`

**Pattern excerpt** (lines 1–17, 36–53):
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
// ...
<Button
  variant="ghost"
  size="sm"
  onClick={handleSignOut}
  data-testid="sign-out-button"
  aria-label={t("sign_out")}
  className="text-[var(--muted-foreground)] hover:text-[var(--on-dark)]"
>
  <LogOut className="mr-2 h-4 w-4" />
  {t("sign_out")}
</Button>
```

**Deviations:** Use `variant="ghost" size="icon"` (40×40 — `Button` already defines `icon: "size-10"` line 86). Icon = lucide `Plus`. `onClick` → `router.push(\`/${locale}/budgets/new\`)`. No loading state needed — navigation is instant.

---

### `apps/web/src/components/budgeting/bdp-tabs.tsx` (NEW Client Component)

**Analog:** `apps/web/src/components/workspace/workspace-sidebar.tsx`

**Imports + active-segment pattern** (lines 1–6, 32, 50–66):
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, ListTree, RotateCw, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
// ...
const pathname = usePathname();
// ...
const active = pathname?.startsWith(tab.href) ?? false;
return (
  <Link
    key={tab.href}
    href={tab.href}
    className={cn(
      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
      active
        ? "bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-[var(--primary)] font-medium"
        : "text-[var(--muted-foreground)] hover:bg-muted/50 hover:text-[var(--on-dark)]",
    )}
  >
    <Icon className="h-4 w-4" />
    {tab.label}
  </Link>
);
```

**Deviations:**
- 4 tabs (Spendings / Reserves / Wallets / Settings) — lucide `LayoutGrid`, `Coins`, `Wallet`, `Settings` (UI-SPEC §5).
- Horizontal `<nav>` (`inline-flex`), not vertical `<aside>`. Wrap in `<nav aria-label={t('bdp.tabs.aria')}>`.
- Active-pill styling = **filled** yellow (D-PH3-02): `bg-[var(--primary)] text-[var(--on-primary)]`. The analog uses 15%-mix tint — REJECT, follow D-PH3-02 exactly.
- Rounded `--radius-pill` (9999px), height 36px (UI-SPEC §5).
- Mobile (< 480px): inactive pills show icon only (`<span className={cn(active ? 'inline' : 'hidden sm:inline')}>`).
- Each `<Link>` carries `aria-current={active ? 'page' : undefined}` and `aria-label={t(\`bdp.tab.${slug}\`)}` (a11y contract §Accessibility).

---

### `apps/web/src/components/budgeting/budget-card.tsx` (NEW Async RSC)

**Analog:** RSC fetch from `workspaces/page.tsx` lines 19–25 + link-card markup from `components/workspace/workspace-row.tsx` lines 51–69.

**Async RSC fetch pattern:**
```tsx
import Link from "next/link";
import { serverApiFetch } from "@/lib/budget-fetch.server";

export async function BudgetCard({ budget, locale }: { budget: BudgetSummary; locale: string }) {
  const res = await serverApiFetch(budget.id, `/budgets/${budget.id}/home-summary`);
  if (!res.ok) return <BudgetCardError budget={budget} locale={locale} />;
  const summary = (await res.json()) as HomeSummary;
  return (
    <Link
      href={`/${locale}/budgets/${budget.id}/spendings`}
      className="group block rounded-[var(--radius-xl)] border border-transparent bg-[var(--surface-card-dark)] transition-all hover:border-[var(--primary)] hover:scale-[1.01]"
      aria-label={t("home.card.openAria", { budgetName: budget.name })}
    >
      {/* sectioned anatomy */}
    </Link>
  );
}
```

**Card-link hover pattern** from `workspace-row.tsx` lines 51–69 — KEEP the `group` + hover transition pattern but use yellow hairline on hover per D-PH3-10 (analog uses `--primary/30`; spec says full `--primary`).

**Deviations:**
- `serverApiFetch(budget.id, ...)` — analog passes `null` (no budget header); MUST pass `budget.id` so `X-Budget-ID` is set (tenant guard, CONTEXT integration §Middleware `X-Budget-ID` header).
- Per-card Suspense boundary lives in **parent** (`home-cards-grid.tsx`), not here.
- Use `<Link>` only — no nested clickable elements per CONTEXT failure-mode §`<Link>` inside `<Link>`.

---

### `apps/web/src/components/budgeting/home-cards-grid.tsx` + `apps/web/src/app/[locale]/(app)/page.tsx` (NEW)

**Analog:** iterator in `workspaces/page.tsx` lines 70–80.

**Iterator pattern:**
```tsx
<main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
  <div className="mb-6 flex items-center justify-between">
    <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">{t("list.heading")}</h1>
    {/* ... */}
  </div>
  <div className="space-y-2">
    {workspaces.map((w) => (
      <WorkspaceRow key={w.id} workspaceId={w.id} name={w.name} ... />
    ))}
  </div>
</main>
```

**Deviations:**
- Wrap each `<BudgetCard>` in `<Suspense fallback={<BudgetCardSkeleton/>}>` (RESEARCH Pattern 1 — D-PH3-11). Analog has no Suspense (sync RSC).
- Grid not list: `grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (D-PH3-09).
- `max-w-[1280px]`, `px-4 sm:px-8 pt-12` (UI-SPEC §5.4).
- Empty state (zero budgets) = hero block matching `workspaces/page.tsx` lines 32–50 (eyebrow → heading → body → CTA) but using `home.empty.*` i18n keys and routing to `/budgets/new`.

---

### `apps/web/src/components/budgeting/budget-card-skeleton.tsx` + `placeholder-chart.tsx` (NEW)

**Analog:** existing `apps/web/src/components/ui/skeleton.tsx` (one-liner `bg-muted animate-pulse`); no consumer analog with this anatomy.

**Pattern:** Compose `<Skeleton className="h-4 w-32" />` shapes inside `<Card>`. Three sections (header / stat / strip) separated by `<div className="h-px bg-[var(--hairline-dark)]" />`.

**Deviations:** none — straightforward markup. Planner cites UI-SPEC §5.4 "Loading skeleton" for the exact dimensions.

---

### `apps/web/src/components/budgeting/task-banner.tsx` + `task-banner-row.tsx` (NEW Client wrappers)

**Analog:** **No existing analog** for React-Query polling in this repo. Use RESEARCH.md Pattern §"Task Banner Skeleton Contract" (lines 720+) as the source. Row markup analog: `components/workspace/workspace-row.tsx` lines 51–87.

**Row markup pattern (from `workspace-row.tsx`):**
```tsx
<div className="group flex items-center justify-between rounded-lg border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4 py-3.5">
  <div className="flex flex-1 min-w-0 items-center gap-3">
    <p className="truncate text-sm font-semibold text-[var(--on-dark)]">{name}</p>
  </div>
  <div className="ml-2 flex gap-1">
    {/* ... */}
  </div>
</div>
```

**Disabled-button pattern** from `Button` primitive lines 26: `disabled:cursor-not-allowed disabled:opacity-50` — append `aria-disabled="true"` per D-PH3-16.

**Deviations:**
- Task-banner shell receives `initialTasks: TaskSummary[]` from parent RSC (D-PH3-13). Wraps `<TaskBannerInner>` which uses `useQuery({ queryKey, initialData: initialTasks, refetchInterval: 60_000, refetchIntervalInBackground: false })`.
- Visibility pause: `useEffect` with `document.addEventListener('visibilitychange', ...)` → `queryClient.invalidateQueries(['tasks', budgetId, 'pending'])` on re-visible.
- Action button is `<Button variant="primary" size="sm" disabled aria-disabled="true" title={t('bdp.tasks.actionComingSoon')}>` — placeholder layout per D-PH3-16.
- React Query provider must be mounted somewhere — CONTEXT says "add it in plan-phase if not present". Planner verifies `apps/web/package.json` for `@tanstack/react-query` and plans installation in Wave 0 if missing.

---

### `apps/web/src/components/ui/tabs.tsx` (REWRITE — add `variant="pill"`)

**Analog:** `apps/web/src/components/ui/button.tsx` (CVA variant pattern lines 20–98).

**CVA pattern from `button.tsx`:**
```tsx
const buttonVariants = cva(
  ["inline-flex cursor-pointer ..."].join(" "),
  {
    variants: {
      variant: {
        primary: ["bg-[var(--primary)] text-[var(--on-primary)]", "..."].join(" "),
        ghost:   ["bg-transparent text-[var(--foreground)]", "..."].join(" "),
      },
      size: { sm: "h-8 ...", md: "h-10 ...", icon: "size-10" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
```

**Deviations:** Wrap current `TabsList` + `TabsTrigger` classNames into CVA. Add `variant: "underline" | "pill"`. Keep `underline` as default for backwards compat. `pill` variant: `data-[state=active]:bg-[var(--primary)] data-[state=active]:text-[var(--on-primary)] rounded-[var(--radius-pill)] h-9 px-4`. Existing consumers (settings page lines 56–61) keep working untouched.

---

### `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` (NEW Async RSC nested layout)

**Analog:** `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/layout.tsx`

**Pattern excerpt** (full file):
```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}

async function fetchWorkspace(wsId: string): Promise<WorkspaceLite | null> {
  const res = await serverApiFetch(null, "/budgets/active");
  if (!res.ok) return null;
  const body = (await res.json()) as { workspaces?: WorkspaceLite[] };
  return body.workspaces?.find((w) => w.id === wsId) ?? null;
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { locale, wsId } = await params;
  const ws = await fetchWorkspace(wsId);
  if (!ws) {
    redirect(`/${locale}/workspaces`);
  }
  // ...
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6">
      <WorkspaceSidebar workspaceName={ws!.name} ... />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

**Deviations:**
- Membership-verify redirect: 404 acceptable per D-09 (no `/workspaces` aliases). Redirect to `/${locale}` (home) on not-found instead of `/workspaces`.
- After membership check, additionally fetch `serverApiFetch(id, \`/budgets/${id}/tasks?status=pending\`)`. Pass result to `<TaskBanner>` as `initialTasks` prop.
- Replace sidebar with **single sticky wrapper** (D-PH3-01): `<div className="sticky top-16 z-40 bg-[var(--canvas-dark)] border-b border-[var(--hairline-dark)]">{tasks.length > 0 && <TaskBanner ... />}<BdpTabs ... /></div>`.
- Drop the sidebar flex layout.

---

### `apps/web/src/app/[locale]/(app)/budgets/[id]/page.tsx` (NEW redirect)

**Analog:** the `redirect()` call in `workspaces/[wsId]/layout.tsx` line 37.

**Pattern excerpt:**
```tsx
if (!ws) {
  redirect(`/${locale}/workspaces`);
}
```

**Deviations:** Use as a page-level redirect for `/budgets/[id]` → `/budgets/[id]/spendings`:
```tsx
import { redirect } from "next/navigation";
export default async function BdpIndex({ params }) {
  const { locale, id } = await params;
  redirect(`/${locale}/budgets/${id}/spendings`);
}
```

---

### `apps/web/src/app/[locale]/(app)/budgets/[id]/{spendings,reserves,wallets,settings}/page.tsx` (NEW placeholder RSCs)

**Analog:** `apps/web/src/app/[locale]/(app)/workspaces/[wsId]/recurring/page.tsx`

**Pattern excerpt** (lines 1–20):
```tsx
import { getTranslations } from "next-intl/server";

interface RecurringPageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function RecurringPage({ params }: RecurringPageProps) {
  const { locale, wsId } = await params;
  const t = await getTranslations({ locale, namespace: "budgeting.recurring" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">{t("title")}</h1>
      </div>
    </main>
  );
}
```

**Deviations:** Strip the inner sections. Each placeholder renders just `<h1 className="text-title-lg">{t('bdp.tab.${kind}.title')}</h1><p className="body-md text-muted-foreground">{t('bdp.tab.${kind}.placeholder')}</p>`. Padding `pt-8 px-6 sm:px-8` per UI-SPEC §5.5. `params` destructure `{ locale, id }`, not `{ locale, wsId }`.

---

### `apps/web/src/app/[locale]/(app)/budgets/new/page.tsx` (NEW placeholder)

**Analog:** empty-state branch of `workspaces/page.tsx` lines 32–50.

**Pattern excerpt:**
```tsx
<main className="mx-auto flex max-w-2xl flex-col items-start gap-10 px-4 py-16 sm:px-6">
  <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">{t("empty.eyebrow")}</p>
  <div className="space-y-3">
    <h1 className="text-display-md text-[var(--on-dark)]">{t("empty.heading")}</h1>
    <p className="max-w-prose text-base text-[var(--muted-foreground)]">{t("empty.body")}</p>
  </div>
  <Button asChild size="lg">
    <Link href={`/${locale}/onboarding`}>{t("empty.cta")}</Link>
  </Button>
</main>
```

**Deviations:** Use `budgets.new.*` keys. Body text "The onboarding wizard lands in Phase 6." Link back to home `/${locale}` (no CTA needed — Phase 6 fills the wizard).

---

### `apps/api/src/routes/tasks.ts` (NEW Hono route factory)

**Analog:** `apps/api/src/routes/wallets.ts`

**Factory pattern** (lines 18–34, 73–81):
```ts
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function createTasksRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();

  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  app.get("/", async (c) => {
    const tenantId = pickTenant(c);
    const status = c.req.query("status");
    if (status !== "pending") return c.json({ error: "status=pending required" }, 422);

    const r = await deps.budgeting.listPendingTasks({ tenantId, budgetId: /* from c.req.param() */ });
    if (r.isErr()) return serverError(c, "list_tasks_failed", r.error);
    return c.json({ tasks: r.value });
  });

  return app;
}
```

**Deviations:**
- Route mounted at `/budgets/:budgetId/tasks` (RESEARCH §File Map). `budgetId` from `c.req.param('budgetId')`.
- Phase 3 ships READ-ONLY (`GET ?status=pending`). Phase 7 extends with writes.
- Wire `listPendingTasks` into `deps.budgeting` in `apps/api/src/boot.ts` (planner verifies).

---

### `apps/api/src/routes/budgets.ts` (MODIFY — add `home-summary`)

**Analog:** self (existing routes in same file).

**Existing route pattern** (lines 50, 53–81):
```ts
r.get("/health", (c) => c.json({ ok: true, phase: "1" }));

r.post("/", zValidator("json", createSchema), async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  // ...
});
```

**Deviations:** Append a new `r.get('/:id/home-summary', async (c) => { ... })` handler. Read `tenantId` via `c.get('tenantIds')[0]` (wallets.ts pattern lines 23–26). Call `deps.budgeting.getBudgetHomeSummary({ tenantId, budgetId })`. Return `{ name, kind, spent_current_month, wallets_value_display_ccy, top_overspent: [{ category, over_amount }, ...] }` per D-PH3-11.

---

### `packages/budgeting/src/application/list-pending-tasks.ts` (NEW application service)

**Analog:** `packages/budgeting/src/application/list-pending-drafts.ts`

**Pattern excerpt** (full file):
```ts
import { ok, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface PendingDraftRow {
  id: string;
  tenantId: string;
  ruleId: string;
  // ...
}

export function listPendingDrafts(_deps: Record<string, unknown> = {}) {
  return async (input: ListPendingDraftsInput): Promise<Result<PendingDraftRow[], Error>> => {
    const r = await withTenantTx(TenantId(input.tenantId), UserId(SYSTEM_USER_ID), async (tx) => {
      const { sql } = await import("drizzle-orm");
      const result = await /* drizzleTx */.execute(sql`
        SELECT id, tenant_id, ...
          FROM budgeting.expense_ledger
         WHERE tenant_id = ${input.tenantId}::uuid
           AND confirmed_at IS NULL
         ORDER BY transaction_date ASC
      `);
      return result.rows.map((row) => ({ /* DTO mapping */ }));
    });
    if (r.isErr()) return r as unknown as Result<PendingDraftRow[], Error>;
    return ok(r.value);
  };
}
```

**Deviations:**
- Use the port-based variant — accept `{ taskRepo }` deps so the unit test can mock it. (analog uses inline SQL; we want testability via port).
- Input: `{ tenantId, budgetId }`. Output: `TaskSummary[]` where `TaskSummary = { id, kind, status, createdAt, payload }`.
- Filter `WHERE budget_id = $1 AND status = 'PENDING'`.

---

### `packages/budgeting/src/application/get-budget-home-summary.ts` (NEW application service)

**Analog:** `packages/budgeting/src/application/get-latest-transactions.ts` (read-only composition, port-based)

**Pattern excerpt** (full file):
```ts
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { Transaction } from "../domain/transaction";

export interface GetLatestTransactionsInput {
  tenantId: string;
  limit?: number;
  before?: { transactionDate: string; id: string };
}

export interface GetLatestTransactionsDeps {
  transactionRepo: TransactionRepo;
}

export function getLatestTransactions(deps: GetLatestTransactionsDeps) {
  return async (input: GetLatestTransactionsInput): Promise<Result<Transaction[], Error>> => {
    try {
      const rows = await deps.transactionRepo.listLatest(input.tenantId, {
        limit: input.limit ?? 50,
        before: input.before,
      });
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
```

**Deviations:**
- Compose 4 ports: `TransactionRepo` (sum current month), `WalletRepo` (list by budget), `FxProvider` (convert wallets sum → `display_currency` per D-PH3-12), `ReserveBalanceRepo` + `CategoryLimitRepo` (top-overspent).
- Money math stays inside `Money` value object — never cross adapter boundary as plain floats (CLAUDE.md hex rule).
- Return DTO `{ name, kind, spent_current_month: { amount, currency }, wallets_value_display_ccy: { amount, currency }, top_overspent: [{ category, over_amount }, ...] }`.

---

### `packages/budgeting/src/ports/task-repo.ts` (NEW Port)

**Analog:** `packages/budgeting/src/ports/reserve-balance-repo.ts`

**Pattern excerpt** (full file):
```ts
import type { Money } from "@budget/shared-kernel";

export interface ReserveBalanceRepo {
  getForBudget(budgetId: string, tenantId: string, asOf: Date): Promise<Map<string, Money>>;
  getForCategory(budgetId: string, categoryId: string, tenantId: string, asOf: Date): Promise<Money>;
}
```

**Deviations:** Single method `listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>`. Type-only — no Drizzle imports (ENGR-02, dep-cruiser).

```ts
export interface TaskSummary {
  id: string;
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "STALE_WALLET" | "MONTH_END_REVIEW";
  status: "PENDING" | "RESOLVED";
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface TaskRepo {
  listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>;
}
```

---

### `packages/budgeting/src/adapters/persistence/task-repo.ts` (NEW Drizzle adapter)

**Analog:** `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts`

**Tenant-tx + SQL pattern** (lines 1–13, 40–68):
```ts
import { sql } from "drizzle-orm";
import { withTenantTx, withInfraTx } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { ReserveBalanceRepo } from "../../ports/reserve-balance-repo";

export function createReserveBalanceRepo(): ReserveBalanceRepo {
  return {
    async getForBudget(budgetId, tenantId, _asOf) {
      const r = await withTenantTx(TenantId(tenantId), UserId("system"), async (tx) => {
        const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
        const result = await drizzleTx.execute(
          sql`SELECT category_id, balance_cents
              FROM budgeting.category_reserve_balance
              WHERE budget_id = ${budgetId}::uuid`,
        );
        return result.rows;
      });
      if (r.isErr()) throw r.error;
      const map = new Map<string, Money>();
      for (const row of r.value) {
        map.set(row.category_id as string, centsToMoney(row.balance_cents, currency));
      }
      return map;
    },
  };
}
```

**Deviations:** Read from `budgeting.tasks` table (schema already exists per `tasks-schema.ts`). Use `withTenantTx` so RLS GUC is set. SQL: `SELECT id, kind, status, payload_json, created_at FROM budgeting.tasks WHERE budget_id = ${budgetId}::uuid AND status = 'PENDING' ORDER BY created_at ASC`. Map rows → `TaskSummary[]`. No `Money` conversion needed (tasks have JSON payload, not money fields at this layer).

---

### `apps/api/test/routes/tasks.test.ts` (NEW integration test)

**Analog:** `apps/api/test/routes/wallets.test.ts`

**Setup pattern** (lines 1–82):
```ts
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DB_URL });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  // ...INSERT identity.users, INSERT tenancy.budgets...
  return { userId, tenantId };
}

async function buildApp(userId: string, tenantId: string) {
  const { createWalletsRoute } = await import("../../src/routes/wallets");
  // ...
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/wallets", createWalletsRoute(deps));
  return app;
}
```

**Deviations:** Substitute `createTasksRoute`. Mount at `/budgets/:budgetId/tasks`. Test cases per D-PH3-20 + RESEARCH §Test Strategy:
1. Empty (0 pending tasks) → `{ tasks: [] }`, 200.
2. 3 pending tasks seeded → returns 3, 200.
3. Tenant isolation: tenant B seeds 1, tenant A queries → returns 0 (cross-tenant leak guard, ties into `make ci-gate` 6/6).
4. Status filter: 1 RESOLVED + 2 PENDING → returns 2.

Plus add `budgets.test.ts` cases for `GET /:id/home-summary`: empty wallets → 0; mixed currencies → FX-converted sum; overspent strip ordering.

---

### `apps/web/test/budget-switcher.test.tsx` (NEW Vitest + RTL)

**Analog:** `apps/web/test/workspace-switcher.test.tsx`

**Mock + render pattern** (lines 1–67):
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceSwitcher } from "../src/components/workspace/workspace-switcher";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: { defaultValue?: string; count?: number }) => {
    if (key === "group.private") return "Private budgets";
    if (key === "group.shared") return "Shared budgets";
    return opts?.defaultValue ?? key;
  },
}));

const mockWorkspaces: WorkspaceSummary[] = [
  { id: "ws-1", name: "My Budget",     kind: "PRIVATE", default_currency: "USD" },
  { id: "ws-2", name: "Family Budget", kind: "SHARED",  default_currency: "EUR" },
];

describe("WorkspaceSwitcher", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("renders PRIVATE workspace row", () => {
    render(<WorkspaceSwitcher workspaces={mockWorkspaces} initialActiveIds={["ws-1"]} />);
    expect(screen.getByText("My Budget")).toBeTruthy();
  });
});
```

**Deviations:**
- Mock `next/navigation` `useRouter().push` instead of `api.settings.$put` (analog mocks the persist call; new switcher navigates instead).
- Test cases per CONTEXT D-PH3-20: renders Personal/Shared groups, shows `Check` on active row, clicking row triggers `router.push('/en/budgets/ws-2/spendings')`, Escape closes popover. Mock Radix Popover behavior is straightforward with RTL + happy-dom.

---

### `apps/web/test/components/bdp-tabs.test.tsx`, `budget-card.test.tsx`, `task-banner.test.tsx` (NEW Vitest + RTL)

**Analog:** `apps/web/test/components/pending-drafts-inbox.test.tsx` (planner confirms via `Read` during planning).

**Deviations:** For `bdp-tabs.test.tsx`, mock `usePathname()` to return `/en/budgets/abc/wallets` and assert Wallets pill has `aria-current="page"`. For `task-banner.test.tsx`, wrap in `<QueryClientProvider>` test harness and seed `initialTasks` via React-Query `initialData`.

---

## Shared Patterns

### RSC ↔ API: `serverApiFetch`
**Source:** `apps/web/src/lib/budget-fetch.server.ts`
**Apply to:** `budget-card.tsx`, `top-nav.tsx`, `budgets/[id]/layout.tsx`, `(app)/page.tsx`

```ts
export async function serverApiFetch(
  budgetId: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  const headers = new Headers(init.headers);
  if (cookieHeader && !headers.has("Cookie")) headers.set("Cookie", cookieHeader);
  if (budgetId && !headers.has("X-Budget-ID")) headers.set("X-Budget-ID", budgetId);
  return fetch(`${SERVER_API_BASE}${path}`, { ...init, headers, cache: init.cache ?? "no-store" });
}
```

**Rule:** Pass `budgetId` (not `null`) for any per-budget endpoint so `X-Budget-ID` is attached. Pass `null` only for `/budgets/active` and other auth-only endpoints.

### Hono route factory + tenant pick
**Source:** `apps/api/src/routes/wallets.ts` lines 18–34
**Apply to:** `apps/api/src/routes/tasks.ts`, additions to `budgets.ts`

```ts
export function createXRoute(deps: BootedDeps) {
  const app = new Hono<{ Variables: Record<string, any> }>();
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }
  // routes...
}
```

### Result-based application service
**Source:** `packages/budgeting/src/application/get-latest-transactions.ts`
**Apply to:** `get-budget-home-summary.ts`, `list-pending-tasks.ts`

```ts
import { ok, err, type Result } from "@budget/shared-kernel";

export function svc(deps) {
  return async (input): Promise<Result<DTO, Error>> => {
    try {
      // compose port calls
      return ok(value);
    } catch (e) { return err(e as Error); }
  };
}
```

### Adapter `withTenantTx` + raw SQL
**Source:** `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` lines 8–24, 42–68
**Apply to:** `task-repo.ts`

Use `withTenantTx(TenantId(tenantId), UserId(...), async (tx) => { ... })` to set the RLS GUC. NEVER reach for `withInfraTx` for tenant data.

### Vitest + RTL component test scaffold
**Source:** `apps/web/test/workspace-switcher.test.tsx`
**Apply to:** all new `apps/web/test/components/*.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?) => opts?.defaultValue ?? key,
}));
```

### Hex layering / dep-cruiser invariant
**Source:** CLAUDE.md (project root)
**Apply to:** `packages/budgeting/src/{ports,application,adapters}/**`

- Domain (`domain/`) + ports (`ports/`) — NO Drizzle/Hono/React imports.
- Application (`application/`) — imports only from `ports/` and `shared-kernel`.
- Adapters (`adapters/`) — only place that imports `drizzle-orm`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/src/components/budgeting/task-banner.tsx` | Client wrapper | RSC initial + React Query 60s poll | First React-Query polling surface in the repo. Use RESEARCH.md Pattern §"Task Banner Skeleton Contract" + TanStack Query docs (verify via context7 if planner needs syntax). Verify React Query is in `apps/web/package.json` — install in Wave 0 if not. |
| `apps/web/src/components/ui/tabs.tsx` (pill variant) | Primitive | n/a | Existing tabs use plain class strings, not CVA. Borrow CVA pattern from `components/ui/button.tsx` lines 20–98. |
| `apps/web/e2e/features/*.feature` | Playwright BDD | Gherkin | Need to confirm `apps/web/e2e/features/` exists before mapping. Memory says playwright-bdd is project convention; planner verifies existing scenarios. |

---

## Metadata

**Analog search scope:**
- `apps/web/src/app/[locale]/(app)/**`
- `apps/web/src/components/{ui,common,workspace,budgeting,auth}/**`
- `apps/web/src/lib/**`
- `apps/web/test/**`
- `apps/api/src/routes/**`
- `apps/api/test/routes/**`
- `packages/budgeting/src/{application,ports,adapters/persistence}/**`

**Files scanned (read):** 18 source files, 1 test file, 1 schema file. All under 200 lines except wallets.test.ts (read first 90 lines only).

**Pattern extraction date:** 2026-05-12

**Search strategy:** RESEARCH.md File Map (lines 187–290) enumerated every new path; codebase navigation via `ls` and direct Reads of named analogs rather than Grep — sufficient for an analog-mapping pass at this corpus size.
