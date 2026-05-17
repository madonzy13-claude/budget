---
phase: 05-reserves-wallets-tabs
plan: "05"
subsystem: wallets-tab
tags:
  - frontend
  - wallets-tab
  - dnd
  - staged-add
  - inline-edit
dependency_graph:
  requires:
    - "05-03" # PATCH /wallets/:id, POST /wallets, GET /wallets, POST /wallets/:id/archive
    - "05-04" # InlineEditCell, DashedAddButton, RowDragHandle atoms
  provides:
    - WalletsSectionedList client island (DndContext + 3 sections + staged-add)
    - WalletRow component (persisted + draft modes, data-wallet-id per W-5)
    - WalletSection droppable wrapper
    - WalletDeleteConfirm AlertDialog
    - useWallets / useUpdateWallet / useCreateWallet / useArchiveWallet hooks
    - RSC WalletsPage (/budgets/[id]/wallets)
  affects:
    - "05-06" # Reserves tab shares useWallets data shape for cross-invalidation
    - "05-08" # Plan 08 E2E step bindings consume data-wallet-id per W-5
tech_stack:
  added: []
  patterns:
    - TanStack Query optimistic mutation with rollback
    - Staged-add flow (D-PH5-W9) — POST only on Name blur, not on +Add click
    - DnD cross-section drag (dnd-kit useDraggable + useDroppable)
    - Cross-tab cache invalidation (reserves key on reserve-touching mutations)
key_files:
  created:
    - apps/web/src/hooks/use-wallets.ts
    - apps/web/src/hooks/use-update-wallet.ts
    - apps/web/src/hooks/use-create-wallet.ts
    - apps/web/src/hooks/use-archive-wallet.ts
    - apps/web/src/components/budgeting/wallets-tab/wallet-delete-confirm.tsx
    - apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx
    - apps/web/src/components/budgeting/wallets-tab/wallet-section.tsx
    - apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
    - apps/web/test/hooks/use-update-wallet.test.tsx
    - apps/web/test/components/wallet-row.test.tsx
    - apps/web/test/components/wallets-sectioned-list.test.tsx
    - apps/web/test/components/wallets-add-staged.test.tsx
  modified:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx
  deleted:
    - apps/web/src/components/budgeting/accounts-list.tsx
    - apps/web/src/components/budgeting/account-form.tsx
    - apps/web/src/components/budgeting/account-form-sheet.tsx
    - apps/web/src/components/budgeting/account-actions.tsx
    - apps/web/test/components/account-form.test.tsx
decisions:
  - "Staged-add useQuery stale refetch: tests assert POST absence by filtering by method, not by total call count — GET from useWallets stale refetch is expected"
  - "useUpdateWallet.onSettled reads cache BEFORE invalidateQueries to correctly detect reserve cross-invalidation (cache would be cleared after invalidation)"
  - "DraftRow extracted as a separate function component to allow hook usage in both persisted and draft branches of WalletRow"
  - "account-form.test.tsx deleted alongside the legacy component (test imported deleted source)"
metrics:
  duration: "~45 minutes"
  completed: "2026-05-17"
  tasks_completed: 3
  files_created: 12
  files_deleted: 5
---

# Phase 05 Plan 05: Wallets Tab End-to-End Summary

**One-liner:** Wallets tab shipped end-to-end: RSC page → DnD client island → 3-section grouping → inline-edit per cell → staged-optimistic add-wallet (D-PH5-W9) → cross-tab invalidation → soft-archive with AlertDialog; legacy account-\* files removed.

## Tasks Completed

### Task 1: Mutation + query hooks

**Files:** `use-wallets.ts`, `use-update-wallet.ts`, `use-create-wallet.ts`, `use-archive-wallet.ts`, `test/hooks/use-update-wallet.test.tsx`

- `useWallets`: `useQuery` with `initialData` for SSR hydration. Query key `["budget", budgetId, "wallets"]`.
- `useUpdateWallet`: Optimistic `PATCH /wallets/:id` with `Idempotency-Key` header. `onMutate` patches cache; `onError` rolls back + toasts. `onSettled` reads cache BEFORE calling `invalidateQueries` to correctly check reserve cross-invalidation (D-PH5-E1). Handles `reserve_currency_mismatch` error code with a specific toast key.
- `useCreateWallet`: `POST /wallets` — invoked ONLY from `handleCommitDraft`; no optimistic insert (staged-add DOM presence managed by React state). Cross-invalidates reserves when RESERVE wallet created.
- `useArchiveWallet`: Optimistic removal from cache with rollback. Cross-invalidates reserves when archived wallet was RESERVE.
- **Vitest:** 8 tests covering PATCH contract, rollback matrix, `reserve_currency_mismatch` toast, and 3-scenario reserve cross-invalidation matrix.

**Cross-invalidation logic (D-PH5-E1):**

```
touchesReserves(cachedWallets, input):
  wallet is currently RESERVE → true
  input.walletType === "RESERVE" → true
  otherwise → false
```

Read cache BEFORE `invalidateQueries` in `onSettled` to capture the pre-invalidation type.

### Task 2: Wallets components + staged-add flow

**Files:** `wallet-row.tsx`, `wallet-section.tsx`, `wallets-sectioned-list.tsx`, `wallet-delete-confirm.tsx`, 3 Vitest test files

**WalletRow dual-mode design:**

- `mode="persisted"`: `useDraggable({ id: wallet.id })`, 3 `InlineEditCell` wrappers (Name editable, Currency editable unless `isReserveSection`, Amount editable), hover trash. Emits `data-testid="wallet-row"` + `data-wallet-id={wallet.id}` per W-5.
- `mode="draft"`: No drag, no trash, autoFocus on Name `<Input>`. `onBlur` → trim → empty? discard silently : call `onCommit`. Escape → discard. Pending state disables input. Error state adds destructive ring + refocuses via `useEffect([error])`. Emits `data-testid="wallet-row-draft"` + `data-wallet-id=""` per W-5.

**Staged-add lifecycle (W-4 / D-PH5-W9) — exact implementation:**

| Step                 | What happens                                                                  | Where                                                  |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Click +Add           | `setDrafts(d => d[type] ? d : {...d, [type]: {pending: false, error: null}})` | `handleAdd` in WalletsSectionedList                    |
| Draft row renders    | WalletRow in draft mode, autoFocus on Name                                    | WalletSection                                          |
| Non-empty blur       | `handleCommitDraft(type)(name)` → `createMut.mutateAsync({...})`              | Draft WalletRow → WalletSection → WalletsSectionedList |
| POST success         | `setDrafts` deletes type entry; cache invalidates; persisted row appears      | handleCommitDraft                                      |
| POST failure         | `setDrafts({...d, [type]: {pending: false, error: code}})`                    | handleCommitDraft catch                                |
| Empty blur or Escape | `handleDiscardDraft(type)()` → `setDrafts` deletes type entry                 | Draft WalletRow → WalletSection → WalletsSectionedList |

**W-5 contract confirmation:** `data-wallet-id={wallet.id}` on every persisted row; `data-wallet-id=""` on draft rows. Plan 08 step bindings read this attribute to resolve wallet UUID by name.

**WalletDeleteConfirm:** Thin AlertDialog wrapper. Title: `Delete wallet '{name}'?`; body: `This can't be undone here.` (D-PH5-W10 literal). CTA: `Delete` (destructive bg).

**Vitest:** 25 tests across 3 files:

- `wallet-row.test.tsx`: W-5 data-wallet-id, SPENDINGS currency editable, RESERVE currency read-only, draft attrs, draft error ring, AlertDialog opens on trash click
- `wallets-sectioned-list.test.tsx`: 3 sections rendered, wallet rows in correct sections, DashedAddButton per section, empty state
- `wallets-add-staged.test.tsx`: W-4 staged contract — no POST on +Add click, POST on Name blur, empty blur discards, 422 keeps draft with error, idempotent double-click, Escape discards

### Task 3: RSC page + legacy cleanup

**`apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx`** replaced from placeholder to:

```tsx
const [walletsRes, budgetRes] = await Promise.all([
  serverApiFetch(budgetId, "/wallets"),
  serverApiFetch(budgetId, `/budgets/${budgetId}`),
]);
// passes initial wallets + budgetCurrency to WalletsSectionedList
```

Field name verified: `GET /budgets/:id` returns `defaultCurrency` (camelCase). Fallback `?? "EUR"` for defensive SSR.

**Deleted (v1.0 legacy — confirmed no consumers before deletion):**

- `apps/web/src/components/budgeting/accounts-list.tsx`
- `apps/web/src/components/budgeting/account-form.tsx`
- `apps/web/src/components/budgeting/account-form-sheet.tsx`
- `apps/web/src/components/budgeting/account-actions.tsx`
- `apps/web/test/components/account-form.test.tsx` (orphaned test — imported deleted source)

Docker web image rebuild initiated after file changes (CLAUDE.md requirement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest mock strategy for useWallets stale refetch**

- **Found during:** Task 2 (wallets-add-staged.test.tsx)
- **Issue:** `useWallets` hook fires `clientApiFetch` on mount (stale refetch, staleTime=0), causing test assertions `expect(mockClientApiFetch).not.toHaveBeenCalled()` to fail
- **Fix:** Changed assertions to filter by HTTP method (`method === "POST"`). Added default GET mock in `beforeEach`. The 422 test uses `mockImplementation` to route by method rather than `mockResolvedValueOnce` sequencing (which breaks when GET consumes the 422 mock first)
- **Files modified:** `test/components/wallets-add-staged.test.tsx`

**2. [Rule 1 - Bug] useUpdateWallet cross-invalidation timing**

- **Found during:** Task 1 implementation review
- **Issue:** `touchesReserves` reads cache inside `onSettled` but `invalidateQueries` clears the cache — if reserves check happens after wallet invalidation, the wallet type is gone
- **Fix:** Read cache BEFORE calling `invalidateQueries`. Sequence: `const current = qc.getQueryData(...)` → `qc.invalidateQueries(wallets)` → `if (touchesReserves(current, input)) qc.invalidateQueries(reserves)`
- **Files modified:** `apps/web/src/hooks/use-update-wallet.ts`

**3. [Rule 2 - Missing functionality] Delete orphaned account-form.test.tsx**

- **Found during:** Task 3 (after deleting account-form.tsx)
- **Issue:** `apps/web/test/components/account-form.test.tsx` imported the now-deleted `account-form.tsx` component — would have caused build failures
- **Fix:** `git rm` the orphaned test file
- **Files deleted:** `apps/web/test/components/account-form.test.tsx`

## Known Stubs

None. All data flows from the Plan 03 API through RSC initial data into the client island. No hardcoded empty values, placeholder text, or unwired components.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All mutations route through existing Plan 03 routes with server-side RLS. T-05-02, T-05-03, T-05-10, T-05-11, T-05-14 mitigations confirmed implemented.

## Self-Check: PASSED

- `apps/web/src/hooks/use-wallets.ts` — FOUND
- `apps/web/src/hooks/use-update-wallet.ts` — FOUND
- `apps/web/src/hooks/use-create-wallet.ts` — FOUND
- `apps/web/src/hooks/use-archive-wallet.ts` — FOUND
- `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` — FOUND
- `apps/web/src/components/budgeting/wallets-tab/wallet-section.tsx` — FOUND
- `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` — FOUND
- `apps/web/src/components/budgeting/wallets-tab/wallet-delete-confirm.tsx` — FOUND
- `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx` — FOUND (WalletsSectionedList)
- `accounts-list.tsx` — DELETED (confirmed)
- `account-form.tsx` — DELETED (confirmed)
- `account-form-sheet.tsx` — DELETED (confirmed)
- `account-actions.tsx` — DELETED (confirmed)
- Commits: `365f973` (hooks), `64727b9` (components), `5a7ae45` (RSC page + legacy delete)
- Vitest: 33 tests pass (8 hook + 25 component)
