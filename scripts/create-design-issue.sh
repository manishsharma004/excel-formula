#!/usr/bin/env bash
# Creates the main design discussion issue from spec/DISCUSSION_ISSUE.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TITLE="Design discussion: language-neutral spec for formula evaluation on a dict context"
if command -v gh >/dev/null 2>&1; then
  gh issue create --repo manishsharma004/excel-formula --title "$TITLE" --body-file "$ROOT/spec/DISCUSSION_ISSUE.md"
else
  echo "Install GitHub CLI (gh) and authenticate, then re-run this script." >&2
  exit 1
fi
