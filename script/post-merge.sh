#!/bin/bash
set -e

# Post-merge setup (runs automatically after a task is merged into this repl).
# Add dependency installs / migrations here as the project grows.

# Re-install the auto-sync post-commit hook so it survives environment churn /
# fresh clones (core.hooksPath can't be set from the main agent). Idempotent.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
if [ -f "$ROOT/.githooks/post-commit" ]; then
  cp "$ROOT/.githooks/post-commit" "$ROOT/.git/hooks/post-commit" 2>/dev/null || true
  chmod +x "$ROOT/.git/hooks/post-commit" 2>/dev/null || true
fi

# Best-effort: keep GitHub in sync with the freshly merged code. A push hiccup
# must never fail the merge, so this is non-fatal.
node script/sync-github.mjs || echo "[post-merge] GitHub sync skipped (will retry on next change)."
