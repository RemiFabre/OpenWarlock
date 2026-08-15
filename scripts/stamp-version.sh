#!/usr/bin/env bash
# Stamp shared/version.js with the commit number about to be created.
# Installed as the pre-commit hook (scripts/install-hooks.sh); every commit,
# including subagent worktree commits, which share the hooks dir, bumps it.
# Merge commits skip pre-commit, but their branch commits already stamped.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
N=$(($(git rev-list --count HEAD 2>/dev/null || echo 0) + 1))
STAMP="$(date -u +"%Y-%m-%d %H:%M") UTC"
cat > shared/version.js <<EOF
// Stamped by scripts/stamp-version.sh (pre-commit hook); never edit by hand.
// rN = repo commit count. Shown in the client corner, in /health and in the
// welcome handshake, so a stale tab, a stale Pages CDN copy or a mixed
// client/server pair announces itself instead of being a mystery.
export const VERSION = 'r$N · $STAMP';
EOF
git add shared/version.js
