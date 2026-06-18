---
name: GitHub sync policy
description: Durable rules for mirroring this repl to GitHub and git limits on the main agent
---

# GitHub sync

GitHub mirroring for this repl is **one-way and best-effort**: push `main` only,
never force, and **never block a commit or merge** on a push failure (a hiccup
must degrade to "retry next change", not an error).

**Credential rule:** the GitHub token comes from the Replit connector at runtime
and must never land in a tracked file, in command-line args, or in logs. Passing it
in a `https://user:token@host` URL leaks it via `/proc/<pid>/cmdline` — use an env
var + GIT_ASKPASS helper (env is owner-only) instead.

**Why:** keeps the private repo current without storing secrets in the repo and
without coupling the app to GitHub.

## Main-agent git constraints (important)
The main agent is **blocked from destructive git operations**: `git commit`,
`git config`, `git reset/rebase/checkout`, and force push all fail with
"Destructive git operations are not allowed".
- So `core.hooksPath` can't be set; the post-commit hook is re-copied into
  `.git/hooks/` by the post-merge script to stay durable.
- A **force push** (e.g. overwriting an unrelated initial commit when first
  connecting a repo) must be delegated to a background Project Task.
