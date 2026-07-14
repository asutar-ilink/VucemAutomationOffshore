#!/usr/bin/env bash
# PreToolUse hook — blocks `git commit` / `git push` when the staged or
# not-yet-pushed content contains a secret. Reads the hook JSON on stdin.
#
# Wired in .claude/settings.json under hooks.PreToolUse (matcher "Bash").
# Blocks by exiting 2 and printing the reason to stderr (no jq dependency).
set -uo pipefail

input=$(cat)

# Only act on commit/push — let every other command through untouched.
# (Detect from the raw payload so we don't depend on jq being installed.)
if ! printf '%s' "$input" | grep -Eq 'git[[:space:]]+(commit|push)'; then
  exit 0
fi

# File paths that must never be committed (matched against changed file names).
badfile_regex='\.key$|\.cer$|\.pfx$|\.p12$|(^|/)auth/state\.json$|test-data/envs/(qa|staging)\.json$'
# Secret content patterns (matched against added/changed lines).
secret_regex='delfin40|-----BEGIN [A-Z ]*PRIVATE KEY-----'

# Look at both staged changes (commit) and commits not yet on the upstream (push).
names=$( { git diff --cached --name-only; git diff @{upstream}..HEAD --name-only 2>/dev/null; } | sort -u )
content=$( { git diff --cached; git diff @{upstream}..HEAD 2>/dev/null; } )

violations=""
bad_names=$(printf '%s\n' "$names" | grep -Ei "$badfile_regex" || true)
[ -n "$bad_names" ] && violations="${violations}Sensitive file(s) in the change:
${bad_names}
"
if printf '%s' "$content" | grep -Eq "$secret_regex"; then
  violations="${violations}Secret pattern found in changed content (e.g. 'delfin40' or a PRIVATE KEY block).
"
fi

if [ -n "$violations" ]; then
  {
    echo "BLOCKED to prevent a secret leak:"
    printf '%s\n' "$violations"
    echo "Unstage/scrub the secret (keep it only in the gitignored test-data/envs/qa.json) and retry."
  } >&2
  exit 2
fi

exit 0
