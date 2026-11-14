---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 11
status: complete
---

# 15-11 Summary: Settings → Connected apps UI

- `apps/web/src/components/settings/connected-apps-section.tsx` — React Query list (`clientApiFetch("/settings/connected-apps")`), rows with client name, connected / last-used dates (`Intl.DateTimeFormat(locale, { dateStyle, timeStyle, hourCycle: "h23" })`), Disconnect (`data-testid="disconnect-<id>"`) → AlertDialog (`confirm-action`) → `clientApiWrite(DELETE)` → row removed from cache + toast; failure keeps row + error toast. Empty state shows `${origin}/mcp` to add as a custom connector. Colours via inline style / `--*` tokens.
- `user-settings-shell.tsx` — `AccordionItem value="connected-apps"` between Security and Danger Zone.
- Copy: `settings.user.sections.connectedApps` + `settings.connectedApps` (13 keys) in en/pl/uk. No "via"/"undo"/"draft" anywhere.

## Verification

connected-apps.test.tsx 5/5 (the plan's 6 behaviours; shell placement covered by grep), full web Vitest 3097 pass / 0 fail, web tsc + eslint clean. Live check with the rebuilt web image happens in 15-12.
