---
quick_id: 260615-bse
type: execute
wave: 1
depends_on: []
autonomous: false
files_modified:
  - apps/web/src/components/common/offline-status-badge.tsx
  - apps/web/src/components/budgeting/top-nav.tsx
  - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/hooks/use-create-transaction.ts
  - apps/web/messages/en.json
  - apps/web/messages/pl.json
  - apps/web/messages/uk.json
  - apps/web/test/components/offline-status-badge.test.tsx
  - apps/web/test/components/spendings-grid/quick-entry-input.test.tsx
  - apps/web/test/components/spendings-grid/spendings-grid-client.test.tsx
  - apps/web/test/i18n/offline-ux-keys.test.ts

must_haves:
  truths:
    - "Offline: header shows a pulsing globe icon (not wifi-off), online shows nothing (sr-only)."
    - "Hovering (desktop) or tapping (mobile) the globe shows a tooltip with the relative cache age, e.g. 'No internet — showing data from 13 minutes ago'."
    - "Offline quick-entry submit shows a popup and NEVER inserts a transaction row (no add-then-remove flicker)."
    - "Online quick-entry add still works unchanged (optimistic insert + server swap)."
    - "iOS lying-true case (onLine true, link dead): row inserts briefly, OfflineWriteError rolls it back AND shows the same popup (not a toast)."
    - "All new strings exist in en/pl/uk."
  artifacts:
    - path: "apps/web/src/components/common/offline-status-badge.tsx"
      provides: "Globe + pulse + cache-age tooltip indicator"
      contains: "Globe"
    - path: "apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx"
      provides: "Hosted offline AlertDialog + onOfflineAttempt callback"
      contains: "onOfflineAttempt"
    - path: "apps/web/src/hooks/use-create-transaction.ts"
      provides: "onOfflineError callback for lying-case popup"
  key_links:
    - from: "top-nav.tsx"
      to: "OfflineStatusBadge"
      via: "budgetId={activeBudgetId} prop"
      pattern: "OfflineStatusBadge\\s+budgetId"
    - from: "offline-status-badge.tsx"
      to: "getSyncMeta"
      via: "lastSyncedAt read for relative cache age"
      pattern: "getSyncMeta"
    - from: "quick-entry-input.tsx"
      to: "onOfflineAttempt"
      via: "navigator.onLine===false short-circuit before mutate"
      pattern: "navigator\\.onLine === false"
    - from: "use-create-transaction.ts"
      to: "onOfflineError"
      via: "onError fires callback for OfflineWriteError"
      pattern: "onOfflineError"
---

<objective>
Two offline UX refinements on already-fresh code (verified against file:line below).

1. Redesign the header offline indicator: GLOBE icon (lucide `Globe`) + pulse + a tooltip showing how stale the cached data is ("No internet — showing data from 13 minutes ago"). Tooltip must open on hover (desktop) AND tap (mobile).
2. Offline add must POP UP BEFORE inserting — no add-then-remove flicker. When the device knows it's offline (`navigator.onLine === false`), short-circuit BEFORE `mutate()`: show a dialog, clear input, never insert. The rare iOS lying-true case keeps the optimistic→rollback path but surfaces the SAME dialog instead of a toast.

Purpose: device-truthful offline feedback; kill the confusing "row appears then vanishes".
Output: redesigned indicator, hosted offline dialog wired through the grid, hook callback for the lying-case, i18n in 3 locales, Vitest coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_current_state>
INDICATOR — apps/web/src/components/common/offline-status-badge.tsx

- Client leaf. Reads navigator.onLine + online/offline events. online → `<span sr-only data-testid="offline-status-badge"/>`; offline → inline pill (h-6, animate-pulse on an inline wifi-off SVG, `t("badge.label")` "Offline").
- Takes NO props today. Uses `useTranslations("offline")`.
- Single mount: apps/web/src/components/budgeting/top-nav.tsx:64 `<OfflineStatusBadge />` in the right cluster. offline-resilience.tsx only MENTIONS it in a comment — NOT a real mount.
- TopNav (server) already has `activeBudgetId: string | null` in scope (TopNavProps) → this is the budgetId source for cache age.

CACHE AGE SOURCE — apps/web/src/lib/offline-cache.ts

- `getSyncMeta(budgetId): Promise<string|null>` returns ISO `lastSyncedAt` from sync-meta store (keyPath "key" = budgetId). `setSyncMeta` writes it. No "use client".

RELATIVE-TIME PATTERN TO REUSE — apps/web/src/components/common/staleness-marker.tsx

- `const fmt = useFormatter(); fmt.relativeTime(lastSyncedAt, now)` → "13 minutes ago" (i18n via next-intl). Loads via `getSyncMeta(budgetId)` in useEffect; ticks `setNow` every 30s while offline. REUSE this exact approach (useFormatter + getSyncMeta + 30s tick).

TOOLTIP PRIMITIVE — apps/web/src/components/ui/tooltip.tsx

- Radix wrapper: `Tooltip` (Root), `TooltipTrigger`, `TooltipContent`, `TooltipProvider`. Radix tooltip is hover/focus ONLY — does NOT open on tap. → Use CONTROLLED `open` state (Tooltip `open=` + `onOpenChange`): desktop opens via Radix hover (delayDuration), mobile via an explicit `onClick`/`onPointerDown` toggle on the trigger. State this in the component doc comment.

ALERT-DIALOG PRIMITIVE — apps/web/src/components/ui/alert-dialog.tsx

- Full set: AlertDialog (Root, controlled via `open`/`onOpenChange`), AlertDialogContent/Header/Title/Description/Footer/Action/Cancel. spendings-grid-client.tsx already imports + uses these for the permanent-delete dialog (good co-host pattern).

OFFLINE WRITE — apps/web/src/hooks/use-create-transaction.ts

- mutationFn: line 101 `if (navigator.onLine === false) throw new OfflineWriteError();` then POST wrapped in Promise.race 6000ms timeout → OfflineWriteError on dead link.
- onMutate (line 162): prepends optimistic txn row + bumps spendings-summary.
- onError (line 190): rolls back, then `toast.error(err instanceof OfflineWriteError ? t("write.offline") : t("write.failed"))`.
- → Add an optional `onOfflineError?: () => void` param to `useCreateTransaction`; in onError, when `err instanceof OfflineWriteError`, call it (and DROP the offline toast — keep `t("write.failed")` toast for genuine 4xx). Rollback stays.

QUICK-ENTRY — apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx

- submit(silent) (line 42): validates, `setValue("")`, then `mutate({...})`. Per-column instance.
- → Add prop `onOfflineAttempt: () => void`. In submit, AFTER parse-valid + `setValue("")`, BEFORE mutate: `if (navigator.onLine === false) { onOfflineAttempt(); return; }` (no mutate → no onMutate → no optimistic row). For onLine===true, mutate as today.

GRID HOST — apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx

- Already hosts AlertDialogs + state. → Add `const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)`. Render ONE shared offline AlertDialog (title/body/OK). Pass `onOfflineAttempt={() => setOfflineDialogOpen(true)}` down to each CategoryColumn → QuickEntryInput. Also pass `onOfflineError: () => setOfflineDialogOpen(true)` into useCreateTransaction — BUT that hook is called inside QuickEntryInput, so the callback must thread: grid → CategoryColumn → QuickEntryInput, and QuickEntryInput passes onOfflineError into useCreateTransaction. Use a SINGLE prop name `onOfflineAttempt` for the column→input wiring; inside QuickEntryInput pass that same handler as both the pre-insert short-circuit AND as `onOfflineError` to useCreateTransaction (one dialog, both paths).

PROP WIRING — apps/web/src/components/budgeting/spendings-grid/category-column.tsx

- Renders `<QuickEntryInput .../>` at line 213 (only when !archived). → Add `onOfflineAttempt: () => void` to CategoryColumnProps, forward to QuickEntryInput. Grid passes it at line 622-651 mapping.

MESSAGES — apps/web/messages/{en,pl,uk}.json (verified en shapes)

- offline.badge.{ariaLabel,label} exist. offline.unavailable.\* exist.
- sync.staleness = "Last synced {relativeTime}".
- grid.txn.write.{offline,failed} exist.
- → ADD: offline.indicator.tooltip = "No internet — showing data from {relativeTime}"; offline.indicator.tooltipUnknown = "No internet — cached data age unknown"; offline.indicator.ariaLabel = "No internet connection". ADD: grid.offlineDialog.{title,body,ok}. Mirror in pl + uk.
  </verified_current_state>

<interfaces>
From offline-cache.ts:
```typescript
export async function getSyncMeta(budgetId: string): Promise<string | null>;
```
From tooltip.tsx:
```typescript
export const Tooltip, TooltipTrigger, TooltipContent, TooltipProvider;
// Radix: Tooltip accepts open / onOpenChange / delayDuration (controlled).
```
From use-create-transaction.ts:
```typescript
export class OfflineWriteError extends Error {}
export function useCreateTransaction(budgetId: string, month: string): { mutate, ... };
// → extend signature: useCreateTransaction(budgetId, month, opts?: { onOfflineError?: () => void })
```
From next-intl (reuse staleness-marker pattern):
```typescript
const fmt = useFormatter(); fmt.relativeTime(date, now); // i18n relative time
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Globe + pulse + cache-age tooltip indicator</name>
  <files>
    apps/web/src/components/common/offline-status-badge.tsx,
    apps/web/src/components/budgeting/top-nav.tsx,
    apps/web/messages/en.json, apps/web/messages/pl.json, apps/web/messages/uk.json,
    apps/web/test/components/offline-status-badge.test.tsx,
    apps/web/test/i18n/offline-ux-keys.test.ts
  </files>
  <behavior>
    RED first — apps/web/test/components/offline-status-badge.test.tsx (new). Follow the mock style in
    test/components/spendings-grid/quick-entry-input.test.tsx (vi.mock("next-intl") returning key-echo
    useTranslations + a useFormatter stub returning a fixed relativeTime string; mock @/lib/offline-cache
    getSyncMeta → resolves an ISO ~13 min ago). Set navigator.onLine via Object.defineProperty.
    - online (navigator.onLine=true): renders an sr-only span data-testid="offline-status-badge", no globe.
    - offline: renders a lucide Globe icon (assert an svg with class containing "lucide-globe" OR data-testid="offline-globe"), and the icon/dot carries a pulse class (assert className contains "animate-pulse").
    - offline + tooltip: after getSyncMeta resolves, the tooltip content text includes the formatted relative age (assert the rendered tooltip/aria text contains the mocked relativeTime, e.g. "13 minutes ago"). If getSyncMeta → null, tooltip uses offline.indicator.tooltipUnknown.
    - tap-to-open (mobile): firing click/pointerdown on the trigger toggles the tooltip open (controlled open state) — assert content becomes visible after click without hover.
    - zero layout shift: online branch stays sr-only (no h-6 box).
    i18n test — apps/web/test/i18n/offline-ux-keys.test.ts (new): assert offline.indicator.{tooltip,tooltipUnknown,ariaLabel} and grid.offlineDialog.{title,body,ok} are strings in en+pl+uk (copy the get()+locales loop from test/i18n/pill-slider-keys.test.ts).
  </behavior>
  <action>
    Rewrite offline-status-badge.tsx to accept `{ budgetId }: { budgetId: string | null }`.
    - Keep online → sr-only span (unchanged testid). Keep the online/offline event listeners + navigator.onLine seed.
    - Offline branch: replace the inline wifi-off SVG with lucide `Globe` (import { Globe } from "lucide-react"), `className="h-4 w-4 animate-pulse"` in the --destructive accent. Keep h-6 inline-flex shrink-0 pill envelope so header height/no-shift invariants hold; the "Offline" text label may stay or be dropped (icon-only is fine) — keep aria-label = t("indicator.ariaLabel"). A pulsing ring is optional; animate-pulse on the icon is the baseline.
    - Cache age: reuse staleness-marker's pattern — `const fmt = useFormatter()`, `useState<Date|null> lastSyncedAt`, `useState now`, `useEffect` loads `getSyncMeta(budgetId)` (guard null budgetId → tooltipUnknown), tick `setNow` every 30s while offline. tooltipText = lastSyncedAt ? t("indicator.tooltip", { relativeTime: fmt.relativeTime(lastSyncedAt, now) }) : t("indicator.tooltipUnknown").
    - Tooltip: wrap the globe trigger in TooltipProvider/Tooltip/TooltipTrigger/TooltipContent. CONTROLLED open: `const [open,setOpen]=useState(false)`, Tooltip `open={open} onOpenChange={setOpen}`, TooltipTrigger `asChild` on a button with `onClick={()=>setOpen(o=>!o)}` (mobile tap) — Radix still drives hover/focus open via onOpenChange (desktop). TooltipContent renders tooltipText. Document in the file header WHY controlled (Radix tooltip has no native tap).
    - top-nav.tsx: change line 64 to `<OfflineStatusBadge budgetId={activeBudgetId} />` (activeBudgetId already in TopNavProps scope).
    - Add the 3 offline.indicator.* keys + 3 grid.offlineDialog.* keys to en/pl/uk (Task 2 uses the dialog ones — add all six here so the i18n test is one file). PL/UK translations native, not English.
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- offline-status-badge offline-ux-keys</automated>
  </verify>
  <done>Indicator renders globe+pulse offline / sr-only online; tooltip shows relative cache age and opens on click; budgetId wired from top-nav; all six keys present in 3 locales; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Offline popup-before-insert (no flicker) + lying-case dialog</name>
  <files>
    apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx,
    apps/web/src/components/budgeting/spendings-grid/category-column.tsx,
    apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx,
    apps/web/src/hooks/use-create-transaction.ts,
    apps/web/test/components/spendings-grid/quick-entry-input.test.tsx,
    apps/web/test/components/spendings-grid/spendings-grid-client.test.tsx
  </files>
  <behavior>
    RED first — extend test/components/spendings-grid/quick-entry-input.test.tsx (existing mocks already stub useCreateTransaction → {mutate} and next-intl). Add an onOfflineAttempt mock prop in defaultProps/renderInput.
    - offline pre-insert: set navigator.onLine=false (Object.defineProperty). Type "5.96" + Enter → mutate NOT called; onOfflineAttempt called once; input cleared (value === "").
    - online unchanged: navigator.onLine=true → existing tests still pass (mutate called with 596, onOfflineAttempt NOT called). Keep all current passing assertions.
    - blur path offline: navigator.onLine=false + valid value + blur → onOfflineAttempt called, mutate not called.
    spendings-grid-client.test.tsx (existing): add a test that the shared offline AlertDialog is closed initially (query offline dialog testid → not visible) and that the grid renders the dialog element. (Triggering open through nested columns is covered by the unit-level quick-entry test; here assert the dialog host exists + has the i18n title key.) Use the file's existing NextIntlClientProvider/render harness.
    use-create-transaction: no new RED test required (covered behaviorally), but ensure the existing hook tests (if any reference onError/toast) still pass after adding the optional callback — the offline toast is replaced by the callback ONLY when onOfflineError is provided; when absent, keep the prior toast so nothing else regresses.
  </behavior>
  <action>
    quick-entry-input.tsx:
    - Add `onOfflineAttempt: () => void` to QuickEntryInputProps (required).
    - In submit(): after `setValue("")` and BEFORE mutate, add `if (navigator.onLine === false) { onOfflineAttempt(); return; }`. So the device-knows-offline path never calls mutate → no onMutate → no optimistic row → no flicker.
    - For the onLine===true path: still call mutate. Pass the lying-case handler into the hook: `const { mutate } = useCreateTransaction(budgetId, month, { onOfflineError: onOfflineAttempt })` so an OfflineWriteError (timeout/dead link) opens the SAME dialog after rollback.
    use-create-transaction.ts:
    - Extend signature: `useCreateTransaction(budgetId, month, opts?: { onOfflineError?: () => void })`.
    - In onError: keep the rollback + spendings-summary invalidate. Then: if `err instanceof OfflineWriteError`: call `opts?.onOfflineError?.()`; only `toast.error(t("write.offline"))` when no onOfflineError was provided (back-compat). Genuine non-OfflineWriteError (4xx) → keep `toast.error(t("write.failed"))` unchanged.
    category-column.tsx:
    - Add `onOfflineAttempt: () => void` to CategoryColumnProps; forward to `<QuickEntryInput onOfflineAttempt={onOfflineAttempt} ... />` (line ~213).
    spendings-grid-client.tsx:
    - Add `const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)`.
    - Pass `onOfflineAttempt={() => setOfflineDialogOpen(true)}` to each CategoryColumn in the map (line ~622).
    - Render ONE shared AlertDialog (reuse the imports already present): controlled `open={offlineDialogOpen} onOpenChange={setOfflineDialogOpen}`, data-testid="offline-add-dialog", Title=t("offlineDialog.title"), Description=t("offlineDialog.body"), Footer with a single AlertDialogAction (OK = t("offlineDialog.ok")) that closes. Use `useTranslations("grid")` (grid.offlineDialog.* — keys added in Task 1).
    Keep online happy path + 4xx generic toast unchanged. The previous offline write TOAST is now replaced by the dialog (callback path); the bare-hook fallback toast remains only when no callback is wired (it always is wired now from quick-entry).
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- quick-entry-input spendings-grid-client</automated>
  </verify>
  <done>Offline submit opens the shared dialog and never calls mutate / inserts a row; online add unchanged; lying-case OfflineWriteError opens the same dialog after rollback; dialog hosted once in grid-client and threaded via onOfflineAttempt; tests green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Globe+pulse offline indicator with cache-age tooltip (hover desktop / tap mobile), and an offline add dialog that pops BEFORE any row insert. Rebuilt + redeployed web.
  </what-built>
  <how-to-verify>
    Claude first runs: `cd apps/web && bun run typecheck` (green) and `bun run test -- offline-status-badge quick-entry-input spendings-grid-client offline-ux-keys` (green), then rebuilds + restarts web:
      `docker compose build web && make restart-web`
    then verifies the SERVED bundle (per memory feedback_always_rebuild_web + docker_build_cache_stale):
      - `docker compose ps` shows web restarted recently + healthy.
      - grep the served .next for the globe + dialog strings (e.g. lucide-globe / offline-add-dialog / the offline.indicator.tooltip copy). If a change won't appear → `--no-cache` rebuild + re-verify the served bundle id.
    Then DEVICE confirm on https://budget-dev.madonzy.com (HTTPS — SW/offline needs secure context):
      1. Open the spendings grid online → header shows NO indicator.
      2. Toggle device offline (airplane mode / devtools offline). Header now shows a PULSING GLOBE (red accent), no layout shift, avatar still visible.
      3. Hover (desktop) the globe → tooltip "No internet — showing data from N ... ago". On mobile, TAP the globe → same tooltip appears.
      4. Type an amount in a category quick-entry + Enter while offline → a DIALOG appears ("Can't add while offline" / body / OK). The expense row NEVER appears in the list (no add-then-remove flicker). Close dialog → list unchanged.
      5. Go back online → adding works normally; indicator disappears.
      6. (Optional iOS lying-true) If reproducible: with onLine reporting true on a dead link, the row may flash then the SAME dialog appears and the row is gone.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what's off (icon, pulse, tooltip text/tap, dialog copy, flicker).</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/web && bun run typecheck` green.
- `cd apps/web && bun run test -- offline-status-badge quick-entry-input spendings-grid-client offline-ux-keys` green.
- Served bundle contains globe icon + offline-add-dialog + new tooltip/dialog copy after rebuild.
- Device: pulsing globe offline / nothing online; tooltip on hover AND tap; offline add = dialog, zero inserted row; online add unchanged.
</verification>

<success_criteria>

- Indicator: lucide Globe + animate-pulse offline, sr-only online, zero header height change, tooltip shows i18n relative cache age from getSyncMeta(activeBudgetId), opens on hover (desktop) + tap (mobile).
- Offline add: navigator.onLine===false short-circuits before mutate → shared dialog, no optimistic row. Lying-case OfflineWriteError → rollback + same dialog (not toast). Online happy path + 4xx toast unchanged.
- Strings in en/pl/uk; i18n key test green.
- Existing quick-entry online tests still pass (no regression).
  </success_criteria>

<output>
After completion, create `.planning/quick/260615-bse-offline-ux-polish-2-globe-pulsing-offlin/260615-bse-SUMMARY.md`.
</output>
