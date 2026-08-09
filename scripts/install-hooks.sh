#!/usr/bin/env bash
# Install the repo's git hooks (currently: version stamping on every commit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"
cat > "$HOOK" <<'EOF'
#!/usr/bin/env bash
exec bash "$(git rev-parse --show-toplevel)/scripts/stamp-version.sh"
EOF
chmod +x "$HOOK"
echo "pre-commit hook installed -> scripts/stamp-version.sh"
