# Swap THIS shell onto the repo-scoped fine-grained PAT. Must be sourced —
# a child process cannot touch the terminal's environment:
#
#   source scripts/agent-env.sh
#
# Expects the scoped token in GITHUB_TOKEN_WARLOCK (export it in ~/.bashrc).
# Other terminals are untouched and keep the wide-access credential.
if [ -z "${GITHUB_TOKEN_WARLOCK:-}" ]; then
  echo "GITHUB_TOKEN_WARLOCK is not set. Add to ~/.bashrc and open a new shell:" >&2
  echo '  export GITHUB_TOKEN_WARLOCK="github_pat_..."' >&2
  return 1 2>/dev/null || exit 1
fi

# The wide token, whichever of the two names it lives under. GH_TOKEN also
# outranks any `gh auth login` keyring entry, so gh in this shell can only
# ever see the scoped token after this.
unset GITHUB_TOKEN
export GH_TOKEN="$GITHUB_TOKEN_WARLOCK"

# git push does NOT read GH_TOKEN — this machine's credential.helper is
# `store`, which would hand git the wide credential from ~/.git-credentials.
# Override the helper for this shell only (env-level git config, no files
# touched): blank entry clears the helper list, then gh — which does honor
# GH_TOKEN — takes over.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=""
export GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1="!gh auth git-credential"

case "$GH_TOKEN" in
  github_pat_*) echo "agent shell: gh now uses the scoped fine-grained PAT" ;;
  *) echo "warning: GITHUB_TOKEN_WARLOCK does not look fine-grained (github_pat_*)" >&2 ;;
esac
