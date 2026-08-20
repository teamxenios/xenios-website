Read `.xenios/MASTER_CORPUS.md` first.

## Mandatory session reading (permanent, any model or human)

Every Claude Code, Fable, Codex, ChatGPT, or human session must read, in order,
before any edit:

1. `.xenios/MASTER_CORPUS.md`
2. `.xenios/FULL_VISION.md` (the canonical full Xenios Research vision)
3. The latest full build status (currently
   `docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md`)
4. The latest exact-SHA handoff in `.xenios/handoffs/`
5. Current task/session/path ownership: `.xenios/ACTIVE_TASKS.json`,
   `.xenios/SESSION_REGISTRY.json`, `.xenios/CODE_OWNERSHIP.json`, and
   `.xenios/LAUNCH_LANE_OWNERSHIP_2026-08-19.md`

Then follow `.xenios/prompts/UNIVERSAL_MODEL_AGNOSTIC_CONTINUITY_OS.md` to
determine your role (same session, clean takeover, recovery, lead, worker, or
solo) and continue the fleet that already exists. Current Git and production
state outrank every prompt and every old handoff.

# Xenios Research agent operating contract

Every Claude Code, Codex, ChatGPT, or human engineering session must begin here.

1. Read `.xenios/PROJECT_STATE.json`, `RELEASE_STATE.json`, `ROADMAP.json`, `ACTIVE_TASKS.json`, `CODE_OWNERSHIP.json`, `DECISIONS.md`, `BLOCKED_EXTERNAL.md`, and `FOUNDER_ACTIONS.md`.
2. Recover current Git/Render/Supabase truth. Update stale state; never overwrite truth with an old handoff.
3. Register the session and claim one task/path lease before editing.
4. One writer per file set. Do not silently edit another active lease.
5. Preserve canonical Auth, account identity, Product Control, catalog, pricing, commerce, affiliate, supplier, notification, Care, and audit systems. Extend them rather than creating parallel authorities.
6. Never store secrets, passwords, tokens, patient data, or raw payment evidence in the corpus.
7. Use focused tests while building. Run full release gates only at integration boundaries.
8. Finish with a coherent commit and handoff. A new account must resume from repository state alone.
9. One production writer. Production mutations require explicit authority, exact SHA, prechecks, postchecks, rollback, and smoke.
10. Do not stop at planning while an unblocked implementation exists.

## Multi-account continuity (permanent)

This repository is developed through multiple interchangeable Claude Max,
Claude Code, Codex, ChatGPT, and human sessions. Git and `.xenios/` are the
shared memory; accounts are temporary workers.

Every session MUST:

1. Read the repository continuity corpus before editing.
2. Register itself (`node scripts/agentic/xenios-os.mjs register ...`).
3. Claim an exact task/path lease before writing.
4. Use an isolated branch/worktree.
5. Commit and push every coherent slice.
6. Maintain a heartbeat while active.
7. Write exact-SHA handoffs (the handoff references a PUSHED commit).
8. Preserve stale dirty work before any takeover, never reset it away.
9. Run `.xenios/prompts/PRE_SWITCH_CHECKPOINT_PROMPT.md` before usage or
   context exhaustion.
10. Never rely on chat history as the source of truth, and never ask Samuel
    to repeat history the repository already records.

Production mutations (deploy, migration apply, Render or Supabase writes)
require Samuel's current, explicit approval every time. A session that cannot
comply with this contract must remain read-only.

Permanent prompts: `.xenios/prompts/UNIVERSAL_TAKEOVER_PROMPT.md` (fresh
account start), `.xenios/prompts/PRE_SWITCH_CHECKPOINT_PROMPT.md` (before a
usage limit), `.xenios/prompts/EMERGENCY_RECOVERY_PROMPT.md` (after an
unexpected death). Locate the repository with
`scripts/agentic/Find-XeniosWebsiteRepo.ps1`; inspect full continuation state
with `scripts/agentic/Show-XeniosContinuationState.ps1`.
