#!/usr/bin/env bash
# scripts/setup/branch-protection.sh
# Idempotently configure branch protection on `main` for madonzy13-claude/budget.
# Requires: gh CLI authenticated with admin:repo_hook + repo scopes.

set -euo pipefail

REPO="${REPO:-madonzy13-claude/budget}"
BRANCH="${BRANCH:-main}"

echo "Configuring branch protection on ${REPO}@${BRANCH}..."

# Required status checks must match the job NAMES in ci.yml exactly.
read -r -d '' BODY <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Lint (ESLint + Prettier)" },
      { "context": "Typecheck (workspaces)" },
      { "context": "dependency-cruiser" },
      { "context": "Grep gates (PC-03, PC-04)" },
      { "context": "Unit tests (bun:test)" },
      { "context": "Web tests (Vitest)" },
      { "context": "Tenant leak gate (T-1, T-2, T-3, PC-08, PC-12)" },
      { "context": "Compose smoke (prod-only)" },
      { "context": "E2E (Playwright BDD)" },
      { "context": "Gitleaks (secret scan)" },
      { "context": "Bun audit (HIGH+)" }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo "$BODY" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input -

echo "Branch protection applied to ${REPO}@${BRANCH}."

# Enable repo-level auto-merge (required for the auto-merge.yml workflow)
gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}" \
  -f allow_auto_merge=true \
  -f allow_squash_merge=true \
  -f allow_merge_commit=false \
  -f allow_rebase_merge=false \
  -f delete_branch_on_merge=true >/dev/null

echo "Repo-level merge settings updated (auto-merge on, squash-only, branch deletion on merge)."
