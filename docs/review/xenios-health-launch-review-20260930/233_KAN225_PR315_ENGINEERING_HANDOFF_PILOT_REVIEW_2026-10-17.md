# KAN-225 PR #315: disabled bounded Codex and Claude engineering handoff pilot

**CHANGES REQUIRED, one material defect, at exact head `13f022f0a2ab91a994c37562472301200c0ccc30`** (tree `27f1c7c1`,
base `main` `fa4292e4`, which is PR #314 merged).

- **The rest is sound.** It is narrowly scoped and fail-closed, and it is off by default.
- **Not activation authority.** Credentials, spending and enablement remain Samuel's decisions.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## What I checked

- **Scope.** Six new files: the workflow, `AGENTS.md`, `CLAUDE.md`, a setup doc, the controller and its tests. No
  Quick Order source changes.
- **Pinned actions are verified against their real `action.yml`.** Following my own rule, I checked what the workflow
  talks to, not just what it says.
  - `openai/codex-action@a8d8be6e` is the current `main` (identical; no releases exist). Inputs `prompt-file`,
    `output-schema-file`, `permission-profile` (`:read-only` is a documented value), `safety-strategy` (`drop-sudo`),
    `codex-version` and `allow-bots` all exist. The output `final-message` exists.
  - `anthropics/claude-code-action@f27be6b6` is tag `v1.0.252`, committed 2026-10-16. Inputs `prompt`, `claude_args`,
    `settings`, `allowed_bots`, `allowed_non_write_users`, `classify_inline_comments`, `include_fix_links`,
    `show_full_output` and `display_report` exist. The output `structured_output` exists.
- **Trigger and permissions.**
  - `workflow_dispatch` only. Top-level `permissions: {}`. The controller requires `ref == refs/heads/main`, attempt 1,
    a human actor with write access, and the repository variable `XENIOS_AGENT_AUTOMATION == approved-v1`.
  - A hash-bound approval record names the issue, PR, exact paths, stages, `maxCycles` 2, expiry and a cost-decision
    hash.
  - The existing environment must require reviewers with `prevent_self_review`, plus a `main` branch policy.
  - The PR must be same-repository, at the exact head, with its changed paths inside custody.
  - For review, the configured required checks must be green on the exact head.
- **Provider jobs cannot publish.** Contents and PR access are read-only, and `persist-credentials: false`. The Codex
  job uses `:read-only` with `drop-sudo`. The Claude job allows only `Read,Glob,Grep` and denies
  Bash/Write/Edit/Agent/Web. Model output reaches the receipt job only through an environment variable (no script
  interpolation) and is schema-validated: exact head, sanitized finding codes, review patch must be empty, proposal
  patch confined to custody paths, no binary/mode/rename/symlink changes. The output is never applied.
- **Loop safety.**
  - One-use reservations sit in a `github-actions[bot]` comment ledger, at most two per stage.
  - Reruns are refused, and there are no comment or bot triggers.
  - The `GITHUB_TOKEN` re-trigger limit is documented, so it cannot chain automatically.
- **Tests.** 27/27 pass locally on Node 24.14.1; Core reports 27/27 on 20.19. Note that the workflow-shape test reads
  the YAML from disk. The synthetic `demo` reaches ACCEPTED after one CHANGES_REQUIRED cycle, with a Jira intent and
  no write.
- **CI:** build, typecheck and test pass on `13f022f0` (run `39008588772`).

## Material defect (must fix)

**A reviewed PR can inject instructions into the hosted Claude reviewer.** The `claude` job checks out the untrusted
candidate head inside the workspace (`path: candidate`), and Claude Code runs with the trusted root as its working
directory.

Claude Code automatically loads `CLAUDE.md` files from subdirectories as memory when it reads files there. A PR that
adds or edits `candidate/**/CLAUDE.md` (for example `docs/x/CLAUDE.md`) therefore puts author-controlled text into the
reviewer's instructions. That is exactly the channel the prompt calls "untrusted data".

- **What it could do.** The tools are read-only and the output schema is strict, so it cannot write or exfiltrate. It
  can, however, steer the verdict to `ACCEPTED` on the very PR being reviewed, which defeats the reviewer's purpose.
- **Why the path check doesn't catch it.** The custody regex allows `docs/**/CLAUDE.md`, and nothing in
  `validateInput` excludes it.

**Correction (any one is enough; the first is preferred):**
1. **Do not put the candidate tree in Claude's workspace.** Review the diff only; it is already in
   `agent-task-data.json`, limited to custody paths. If file context is needed, check the candidate out under
   `$RUNNER_TEMP` outside the working directory, and pass only the specific changed files' contents into the JSON data
   file.
2. **Otherwise strip instruction files and refuse PRs that touch them.** Before the action, delete every `CLAUDE.md`,
   `CLAUDE.local.md`, `AGENTS.md` and `.claude/` under `candidate/`. Also make `validateInput` refuse paths whose
   basename is `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md`, or that contain `/.claude/`. Those need separate
   custody.

Either way, add a test for it: a fixture with `candidate/docs/CLAUDE.md` must not reach Claude's context, or
admission must refuse that path.

## Notes (not blocking)

- **Fresh action pin.** `claude-code-action` `v1.0.252` is about a day old. Before activation, re-confirm the pin
  against a release at least 14 days old, or record why the newest one is needed.
- **Unneeded secret exposure.** The prompt-preparation steps expose the provider key to the Node controller just for a
  `test -n` check. Do the presence check in a separate step with no other code, or drop it, because the action fails
  without a key anyway.
- **Instruction-file divergence.** Main currently has no root `AGENTS.md`/`CLAUDE.md`. The integration branch's
  versions differ, so reconcile them when those lines meet.
- **Advisory status, as the PR itself states.** A hosted Claude Action verdict is advisory. The original reviewer stays
  reviewer of record for Quick Order.

## Next

- **Core:** fix the defect within the existing two-cycle limit.
- **Me:** re-review the exact new head.
- **Keep the PR unmerged and the automation off** until Samuel decides on credentials, cost and enablement.

NOT LIVE. No SQL. No production.
