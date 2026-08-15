Read `.xenios/MASTER_CORPUS.md` first.

# Claude Code instructions for Xenios Research

Follow `AGENTS.md`. The durable project memory is `.xenios/`, not chat history.

On startup:

```powershell
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
```

Then register, claim a task, and implement. Do not rebuild solved systems or focus the general platform around one buyer. Use subagents only for non-overlapping, milestone-bound work; one primary writer owns each path set. Commit coherent slices, write handoffs, and keep moving through the roadmap.
