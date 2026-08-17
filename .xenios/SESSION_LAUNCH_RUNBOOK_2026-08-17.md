# Three-session launch runbook (2026-08-17)

The founder's operating structure for shipping Phase Zero while two build
lanes run in parallel. Everything an agent could prepare is prepared; the
steps below marked FOUNDER-ONLY cannot be performed by any agent (the
platform refuses agent control of Claude Desktop's own application, agents
cannot create Desktop sessions, and agents must never handle the Supabase
PAT).

## Credential-safety sequencing (founder adjustment, 2026-08-17)

The Claude Desktop Local environment may be visible to EVERY new Local
session, so the production Supabase PAT must never coexist with the build
lanes. The sessions below therefore run SEQUENTIALLY, not together:

1. Session 1 (Phase Zero) runs FIRST, while the PAT is installed.
2. After the survey is confirmed live: delete `SUPABASE_ACCESS_TOKEN` from
   the Local environment, revoke the PAT in Supabase, remove or disable the
   local `.mcp.json` production connection, and fully restart Claude
   Desktop a second time.
3. Only then launch Sessions 2 and 3 — they must never inherit a
   production database credential.

## FOUNDER-ONLY preliminaries

1. Claude Desktop → Code → Local environment → gear: confirm
   `SUPABASE_ACCESS_TOKEN` exists by name; add the temporary Supabase PAT as
   its value if missing; Save. The token never goes into a prompt, file,
   screenshot, or `.mcp.json`.
2. Fully quit Claude Desktop and reopen it (the whole application, not just
   the session) so new sessions inherit the variable.

## Session 1 — Phase Zero production release (sole executor)

- Folder: `C:\xenios-wt\general-platform` — MUST be this exact worktree; the
  untracked scoped-MCP config `.mcp.json` exists only here.
- Paste: `Execute .xenios/prompts/PHASE_ZERO_SUCCESSOR_PROMPT_2026-08-17.md`
- The session adopts the `claude-fable-desktop` executor identity, runs the
  read-only DB preflight through `supabase-xenios-prod` only, reports
  `[PHASE ZERO FINAL DB PREFLIGHT]`, and STOPS. Production mutation happens
  only after Samuel's narrow in-session GO (packet order: apply M71 +
  postcheck, admin email, dark deploy of the frozen SHA, enable flag,
  controlled smoke, record truth, release the seat).

## Session 2 — Cashflow conversion engine (separate account, AFTER PAT removal)

- Folder: `C:\xenios-wt\cashflow-conversion` (pre-created worktree, branch
  `lane/cashflow-conversion` @ 82cf037, pushed to origin).
- Paste: `Execute .xenios/prompts/CASHFLOW_EXPANSION_LANE_PROMPT_2026-08-17.md`
- First job: independent QA acceptance of ASSISTED-ORDER-MOUNT at exact SHA
  32bbd7998e806d881590c9e9a32123c2b8ba8168, then claim
  ASSISTED-ORDER-CONVERSION. Never edits `C:\xenios-wt\general-platform`,
  the Phase Zero lease, or production.

## Session 3 — Full-vision demo (separate account, AFTER PAT removal)

- Folder: `C:\xenios-wt\full-vision-demo` (pre-created worktree, branch
  `lane/full-vision-demo` @ 82cf037, pushed to origin).
- Paste: `Execute .xenios/prompts/FULL_VISION_DEMO_LANE_PROMPT_2026-08-17.md`
- Claims FULL-VISION-DEMO; builds the production-isolated `/research/demo`
  on its disjoint path set. Never edits the executor worktree or production.

## After Session 1 reports READY FOR FOUNDER GO: YES

Send the complete report block to Samuel; he returns the narrow execution
GO. The GO authorizes ONLY: apply M71 + verify the production postcheck,
set the admin notification email, dark-deploy the frozen SHA and verify the
exact deployed SHA, enable the assisted-order survey (redeploy/restart the
SAME SHA), run the controlled founder smoke, record production truth. It
does NOT authorize M69, M70, payments, general commerce, account-claim
activation, supplier automation, any other migration, or any other runtime
SHA.

After Phase Zero completes and is recorded: the executor releases the
productionWriter seat, then Samuel performs the credential-removal sequence
at the top of this runbook (delete env var, revoke PAT, disable
`.mcp.json`, full restart) BEFORE launching Sessions 2 and 3.
