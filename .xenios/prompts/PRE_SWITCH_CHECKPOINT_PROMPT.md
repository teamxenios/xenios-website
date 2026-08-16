# XENIOS RESEARCH — PRE-SWITCH CHECKPOINT PROMPT

The current Max/Claude/Codex account is approaching its usage or context limit.

Do not start another feature.
Do not leave the current work in chat only.
Do not leave shared files half-edited.

Execute this checkpoint now.

## 1. Freeze current activity

- Finish the current atomic edit if it can be completed safely in minutes.
- Otherwise restore the file to the last coherent state or clearly isolate the unfinished diff.
- Stop spawning agents.
- Stop starting new tests unrelated to the current slice.

## 2. Inspect state

Run:

```powershell
git status --short --branch
git diff --stat
git diff --cached --stat
git log -10 --decorate --oneline
git worktree list --porcelain
node scripts/agentic/xenios-os.mjs status
```

Record:

- branch
- worktree
- base SHA
- current HEAD
- dirty files
- untracked files
- leased paths
- task
- blockers
- background agents/processes

## 3. Protect work

For coherent work:

- run focused tests
- commit
- push

For incomplete but valuable work:

- create a backup outside the repo
- create a patch
- describe exact incomplete files
- do not force a misleading commit if it does not compile

Never reset or clean valuable work.

## 4. Update the corpus

Update:

- `.xenios/PROJECT_STATE.json`
- `.xenios/RELEASE_STATE.json` if relevant
- `.xenios/ACTIVE_TASKS.json`
- `.xenios/SESSION_REGISTRY.json`
- `.xenios/CODE_OWNERSHIP.json`
- `.xenios/DECISIONS.md` if a decision changed
- `.xenios/BLOCKED_EXTERNAL.md` if blocked
- `.xenios/FOUNDER_ACTIONS.md` if human action is required
- `.xenios/handoffs/<session-id>.md`

Set the session state to one of:

- `handoff_ready`
- `paused_usage_limit`
- `blocked_external`
- `stopped`

Release exact path leases if this account will not continue.

## 5. Exact handoff

Write:

```text
[ACCOUNT SWITCH HANDOFF]

SESSION ID:
ACCOUNT:
MODEL:
TASK:
BRANCH:
WORKTREE:
BASE SHA:
FINAL PUSHED SHA:
DIRTY STATE:
LEASED PATHS:
COMPLETED:
VERIFIED:
TESTS:
TYPECHECK:
BUILD:
MIGRATION:
PRODUCTION MUTATED:
BLOCKERS:
NEXT EXACT TASK:
NEXT FIRST COMMAND:
FILES NOT TO DUPLICATE:
FOUNDER ACTION:
```

## 6. Push continuity changes

Commit and push the corpus/handoff update separately if appropriate.

Verify origin contains the handoff and final feature SHA.

## 7. Final response to Samuel

Return only:

```text
[XENIOS ACCOUNT SWITCH READY]

FINAL PUSHED SHA:
HANDOFF PATH:
SESSION STATE:
DIRTY WORK:
NEXT TASK:
NEW ACCOUNT START PROMPT:
Read AGENTS.md, CLAUDE.md, .xenios/MASTER_CORPUS.md and the latest handoff. Run xenios-os validate/status/stale/next, register the new session, claim the released lease, and continue from the exact pushed SHA.
```

Do not keep coding after declaring switch-ready.
