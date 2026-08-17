# Handoff

TASK: MANUAL-BEARER-MCP-SWITCH + PRE-RESTART CONTINUITY CHECKPOINT

SESSION: claude-fable-desktop (this identity continues; successor session must
ADOPT it, never register a second writer)

BRANCH: claude/assisted-order-bridge (in sync with origin; only untracked file
is the deliberately local `.mcp.json`)

COMMIT SHA AT HANDOFF: 3100678 (plus this checkpoint commit — the checkpoint
itself is the final pushed SHA; confirm with `git log -1` after pulling)

WHAT THIS SESSION DID (configuration only, per founder instruction):

1. Confirmed `.mcp.json` already carried the renamed project-scoped server
   `supabase-xenios-prod` (project_ref=yvzeduaxbwgcwllhywff, features=database).
2. Created `.claude/settings.local.json` with
   `ENABLE_CLAUDEAI_MCP_SERVERS=false` and
   `enabledMcpjsonServers=["supabase-xenios-prod"]` to disable broad account
   connectors and pre-approve the project server. File is gitignored
   (`.gitignore` line 13, `*.local.*`) and must stay uncommitted.
3. Because browser OAuth repeatedly failed to carry into the execution
   session, switched `supabase-xenios-prod` to MANUAL BEARER AUTH: `.mcp.json`
   now sends header `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}`. The
   token is NOT in the file — it lives only in the Claude Desktop Local
   environment as `SUPABASE_ACCESS_TOKEN` (stored by Samuel). It was never
   read, printed, logged, or committed by this session.
4. Verified the `.xenios` diffs from the prior Desktop preflight run were
   pure continuity bookkeeping (heartbeat + note, same identity, READY FOR
   FOUNDER GO: NO recorded) and committed them together with this handoff as
   a narrow continuity checkpoint, then pushed.

`.mcp.json` REMAINS UNTRACKED ON PURPOSE. `.claude/settings.local.json`
remains uncommitted (gitignored).

PRODUCTION MUTATED: no. M71 not applied; Render untouched; nothing deployed;
assisted-order feature not enabled; neither Supabase MCP surface was invoked.

FRESH CLAUDE DESKTOP LOCAL CODE SESSION REQUIRED: yes. `.mcp.json` headers and
`settings.local.json` are read at session startup, and `SUPABASE_ACCESS_TOKEN`
must be present in the environment that launches the session.

NEXT EXACT TASK: fresh Claude Desktop Local Code session in
C:\xenios-wt\general-platform → confirm /mcp shows ONLY supabase-xenios-prod
and that it is CONNECTED via the bearer header (no OAuth prompt) → adopt the
claude-fable-desktop identity (heartbeat it) → run the founder's
"XENIOS PHASE ZERO — FINAL PROJECT-SCOPED DESKTOP PREFLIGHT" prompt →
return the preflight report and STOP. Founder GO comes only after
READY FOR FOUNDER GO: YES.
