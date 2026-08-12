#!/usr/bin/env bash
# Prepare a fresh clone to run the issue-agent session (docs/VERSIONING.md).
#
# Everything here is idempotent — run it again any time. It does NOT touch
# credentials: the scoped GitHub token is the one thing that cannot live in the
# repo, and the last section tells you what is still missing.
#
#   bash scripts/setup-agent.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ok=0

step() { printf '\n== %s\n' "$1"; }
warn() { printf '   !! %s\n' "$1"; ok=1; }

step "node"
if ! command -v node >/dev/null; then
  warn "node is not installed (need 20+; this repo is Node ESM, no build step)"
else
  major="$(node -p 'process.versions.node.split(".")[0]')"
  printf '   node %s, npm %s\n' "$(node -v)" "$(npm -v 2>/dev/null || echo '?')"
  [ "$major" -ge 20 ] || warn "node $major is too old — 20+ (tests use modern ESM)"
fi

step "dependencies"
# `ws` is the only runtime dep; vitest and playwright are the dev ones. A clone
# with no node_modules fails with a confusing "Cannot find package 'vitest'".
if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi

step "browsers"
# test/client-robustness.js runs BOTH engines, so both have to be present.
npx playwright install chromium webkit || warn "playwright browsers failed to install"

step "git hooks"
# ⚠ The pre-commit hook stamps shared/version.js (rN + date), which the client
# corner, /health and the welcome handshake all read. A clone without it commits
# a stale stamp and every "which build is this?" answer silently rots.
bash scripts/install-hooks.sh

step "repository"
git remote -v | sed 's/^/   /'
git fetch origin --quiet && printf '   fetched origin\n' || warn "could not fetch origin"
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "main" ]; then
  git pull --ff-only --quiet && printf '   main is up to date\n' || warn "main is not fast-forwardable"
else
  printf '   on branch %s (not main — resume it, or switch before taking new work)\n' "$branch"
fi

step "github credential"
# Scope required by the runbook: THIS repo only, Contents + Issues write,
# Actions read. No Workflows, no Admin, no org access.
if ! command -v gh >/dev/null; then
  warn "gh is not installed — the agent needs it to read and close issues"
elif gh auth status >/dev/null 2>&1; then
  gh auth status 2>&1 | sed 's/^/   /'
  if gh issue list --repo RemiFabre/OpenWarlock --state open --limit 1 >/dev/null 2>&1; then
    printf '   issue access: OK\n'
  else
    warn "authenticated, but cannot list issues on RemiFabre/OpenWarlock"
  fi
else
  warn "gh is not authenticated — export GH_TOKEN with the scoped fine-grained PAT"
fi

step "self-check"
# The cheapest proof that the clone actually works. Tests never need a token.
env -u GH_TOKEN -u GITHUB_TOKEN npx vitest run 2>&1 \
  | grep -E "Test Files|Tests " | sed 's/^/   /' \
  || warn "the test suite did not run"


printf '\n'
if [ "$ok" -eq 0 ]; then
  printf 'Ready. Next: docs/VERSIONING.md#issue-agent-runbook\n'
else
  printf 'Finish the !! items above, then re-run this script.\n'
fi
exit 0
