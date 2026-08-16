Read `.xenios/MASTER_CORPUS.md` first.

# Claude Code instructions for Xenios Research

Follow `AGENTS.md`. The durable project memory is `.xenios/`, not chat history.

On startup:

```powershell
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
```

Then register, claim a task, and implement. Do not rebuild solved systems or focus the general platform around one buyer. Use subagents only for non-overlapping, milestone-bound work; one primary writer owns each path set. Commit coherent slices, write handoffs, and keep moving through the roadmap.

## Multi-account continuity (permanent)

Accounts are interchangeable temporary workers; Git and `.xenios/` are the
shared memory. Follow the continuity contract in AGENTS.md (register, lease,
isolated branch, push coherent slices, heartbeat, exact-SHA handoffs,
preserve stale work, checkpoint before exhaustion via
`.xenios/prompts/PRE_SWITCH_CHECKPOINT_PROMPT.md`). Production mutations
require Samuel's current explicit approval every time.
