# Xenios continuity corpus

This directory is the persistent operating memory for Claude Code, Codex, ChatGPT, and human engineers.

## Required first reads

1. `PROJECT_STATE.json`
2. `RELEASE_STATE.json`
3. `ROADMAP.json`
4. `ACTIVE_TASKS.json`
5. `CODE_OWNERSHIP.json`
6. `DECISIONS.md`
7. `BLOCKED_EXTERNAL.md`
8. `FOUNDER_ACTIONS.md`

## Conflict-resistant design

- One session file per agent under `sessions/`
- One task file or central task record with explicit path leases
- One immutable handoff file per completed slice
- One message file per message
- Release state changes only from the designated release owner
- Secrets and credentials are never stored here

## Commands

```powershell
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs register --id claude-main --tool claude --lane platform --branch feature/platform
node scripts/agentic/xenios-os.mjs claim --session claude-main --task SUPPLIER-WORKSPACE
node scripts/agentic/xenios-os.mjs heartbeat --session claude-main --note "building assigned-order list"
node scripts/agentic/xenios-os.mjs handoff --session claude-main --task SUPPLIER-WORKSPACE --sha <FULL_SHA> --summary <FILE>
```

`MASTER_CORPUS.md` is the primary human-readable continuity entry point. The JSON files are the machine-readable current state.
