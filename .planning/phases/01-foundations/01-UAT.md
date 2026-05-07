---
status: testing
phase: 01-foundations
source:
  - 01-00-SUMMARY.md
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
  - 01-07-SUMMARY.md
  - 01-08-SUMMARY.md
  - 01-09-SUMMARY.md
  - 01-10-SUMMARY.md
started: "2026-05-06T21:40:00Z"
updated: "2026-05-06T21:40:00Z"
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 3
name: Sign Up — New User
expected: |
Go to the sign-up page. Enter a valid email and password.
Account is created. A verification email appears in Mailpit at http://localhost:8025.
The app shows an email verification banner/prompt after signup.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: |
Kill any running containers. Run `docker compose up --build` from the repo root.
All 6 services start in order: db → migrator (exits 0) → api + worker → web + mailpit.
Web app responds at http://localhost:3000/en (or configured port).
No errors in `docker compose logs` after all services are healthy.
result: pass

### 2. Web App Loads with i18n Routing

expected: |
Open http://localhost:3000 in a browser.
Redirected to /en (default locale) automatically.
Navigation to /pl and /uk shows the same page in Polish and Ukrainian respectively.
No 404s, no console errors on initial page load.
result: pass

### 3. Sign Up — New User

expected: |
Go to the sign-up page. Enter a valid email and password.
Account is created. A verification email appears in Mailpit at http://localhost:8025.
The app shows an email verification banner/prompt after signup.
result: [pending]

### 4. Email Verification

expected: |
After signing up, open Mailpit (http://localhost:8025). Find the verification email.
Click the verification link. The app confirms email is verified (banner disappears or success message shown).
result: [pending]

### 5. Sign In / Sign Out

expected: |
Go to the sign-in page. Enter email and password for the verified account.
Successful login redirects to the app dashboard or home.
Sign out button ends the session and redirects to sign-in.
result: [pending]

### 6. Create Workspace

expected: |
After signing in, find the "Create workspace" option (workspace switcher or settings).
Enter a workspace name and default currency.
Workspace is created and becomes the active workspace.
The workspace switcher shows the new workspace.
result: [pending]

### 7. Workspace Switcher

expected: |
If multiple workspaces exist, the workspace switcher UI shows them all.
Clicking a different workspace switches the active context (page reflects the new workspace).
The selected workspace persists on page reload.
result: [pending]

### 8. Invite Member to Workspace

expected: |
In workspace settings, find the "Invite member" option.
Enter an email address and submit.
An invitation email appears in Mailpit.
The workspace members list shows the invited user as pending.
result: [pending]

### 9. Shares Editor — Sum Invariant

expected: |
In workspace settings for a SHARED workspace, open the member shares editor.
Adjust contribution percentages. The UI enforces shares must sum to 100% (±0.005).
Attempting to save with shares not summing to 100% shows a validation error.
result: [pending]

### 10. Settings: Display Currency

expected: |
Open user settings. Find the "Display currency" picker.
Select a different currency from the 8 fiat options.
Setting is saved. The preference persists on page reload.
result: [pending]

### 11. Settings: Language (Locale)

expected: |
Open user settings. Find the language/locale selector.
Switch between EN, PL, and UK.
UI text updates to the selected language.
Setting persists on page reload.
result: [pending]

### 12. Tenant Leak CI Gate

expected: |
Run `bun run test:ci-gate` from the repo root (requires a local postgres).
All 6 tenant-leak tests pass: - no-guc-zero-rows - job-without-tenant-errors - pg-roles-no-bypassrls - force-rls-on-all-tables - in-process-bus-tenant-scope - (cross-tenant-cache runs in CI/Playwright only — skip if no full compose)
Exit code 0.
result: [pending]

## Summary

total: 12
passed: 2
issues: 0
skipped: 0
blocked: 0
pending: 10

## Gaps

[none yet]
