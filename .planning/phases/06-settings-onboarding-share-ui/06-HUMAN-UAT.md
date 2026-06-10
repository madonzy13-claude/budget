---
status: partial
phase: 06-settings-onboarding-share-ui
source: [06-VERIFICATION.md]
started: 2026-05-22T18:40:00Z
updated: 2026-05-22T18:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Settings tab — full functional + visual sweep
expected: All 5 accordion sections render (Budget Identity, Cushion Mode, Recurring Rules, Members for SHARED, Danger Zone) with yellow-accent discipline. Editing the budget name and blurring shows an autosave toast. Cushion-mode toggle persists instantly. "Generate share link" produces a URL in the field and copies to clipboard. Archive soft-deletes. Delete button stays disabled until the typed name matches; correct name hard-deletes.
result: [pending]

### 2. Onboarding wizard — full flow + resume
expected: Signing up as a new user redirects to the `/budgets/new` wizard. All 5 steps (name → currency → type → categories → review) advance in order. Finishing redirects to `/budgets/[id]/spendings`. Signing out and back in does NOT re-show the wizard (completed_at persisted).
result: [pending]

### 3. Share-link recipient join flow
expected: A SHARED-budget owner generates a share link. Opening it in an incognito window renders the join page with the budget name and a "Join" CTA. Clicking Join while unauthenticated redirects to sign-in; after auth, membership is created and the user lands on `/budgets/[id]/spendings`. Re-opening a used link shows the "already used" state.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
