# Deferred items — quick 260611-vuo

Out-of-scope discoveries logged during execution. NOT fixed in this task.

## 1. `make ci-gate` exits 1 on coverage threshold despite 51/51 tests passing

- **Found during:** post-task verification (grants change → ran tenant-leak gate)
- **Symptom:** `bun test tests/tenant-leak` → `51 pass / 0 fail`, but bun exits 1
  because repo-root `bunfig.toml` `coverageThreshold = 0.80` is applied to the
  tenant-leak fixture files (`tests/tenant-leak/fixtures/raw-pg-client.ts` 66.67%,
  `seed-two-tenants.ts` 82.35%).
- **Root cause:** `coveragePathIgnorePatterns` contains `"test/"` which does NOT
  match the repo-root `tests/` directory, so fixtures count against the domain-only
  threshold (PC-23 intent was domain code only).
- **Pre-existing:** last change to tenant-leak files was 08-01 (aea8dc2); coverage
  of those fixtures is unaffected by this quick task.
- **Suggested fix:** add `"tests/"` to `coveragePathIgnorePatterns` in `bunfig.toml`.

## 2. `list()` SELECT returns `archived_from` un-cast (Date object), findById now casts `::text`

- `DrizzleCategoryRepo.list()` selects `archived_from` without `::text` while
  `findById` now casts. Consumers of `list()` apparently tolerate the Date object,
  but the two paths return different JS types for the same logical field.
  Consider unifying with `archived_from::text` in `list()` too.
