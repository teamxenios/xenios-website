# Clarity program — lane claim

Any session (Claude, Codex, human) that opens the six clarity-program prompts must read this first.

| Step | Owner | Branch | State |
| --- | --- | --- | --- |
| 1. Discovery, strategy, IA, copy, practice model, spec (`CLAUDE_01`) | `claude-clarity-spec-20260926` (Claude Code) | `claude/xenios-clarity-spec-20260926` | COMPLETE + RECONCILED to `3298f279` + FINALIZED (CLAUDE_05, 2026-09-26) — awaiting Samuel's one-line approval |
| 2. Samuel states "APPROVE THE REVIEWED XENIOS CLARITY DECISION SET"; CLAUDE_06 records it | Samuel + Claude | this branch | NOT STARTED |
| 3. Implementation (`CODEX_06`, per `18` and the CLAUDE_06 ready handoff) | Codex | `codex/xenios-clarity-implementation-20260926` | BLOCKED on steps 1–2 |
| 4. Independent review (`CLAUDE_04`) | Claude | `claude/xenios-clarity-review-20260926` | BLOCKED on step 3 |
| 5. Fix + release closeout (`CODEX_02`) | Codex | `codex/xenios-clarity-fix-20260926` | BLOCKED on step 4 |

Rules:

- Step 1 writes only `docs/ux/xenios-clarity-program/**` (plus its own `.xenios` session/lease records). No runtime source.
- Do not start `CODEX_01` from these prompts until `02_DECISIONS.md` carries Samuel's recorded approval.
- The adversarial-audit / release-control lane (`codex/xenios-adversarial-audit-20260924`) is separate and continues independently; this lane does not touch its paths.

Source identity used by this lane:

- Audit evidence / documentation tip: `049dfd9d387893623771b8a76b90df6a8bc444d7` (worktree base)
- Runtime under analysis: `c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa`; reconciled to frozen candidate `3298f279ad760a861e26e3e08514bb49694fae38` (identical application bytes; local gates PASS; deployment not authorized)
- Observed production: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`
