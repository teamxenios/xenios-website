# Handoff

TASK: SCOPED-MCP-ISOLATION-VERIFICATION + DESKTOP SESSION RESTART

SESSION: claude-fable-desktop (this identity continues; successor session must
ADOPT it, never register a second writer)

BRANCH: claude/assisted-order-bridge (in sync with origin; only untracked file
is the deliberately local `.mcp.json`)

COMMIT SHA AT HANDOFF: 1aea492 (plus this checkpoint)

WHAT THIS SESSION DID: verified the option-2 MCP isolation from inside a live
Desktop Code session rooted in C:\xenios-wt\general-platform. The session's MCP
registration shows `supabase-xenios-prod` (project_ref=yvzeduaxbwgcwllhywff,
features=database) as the ONLY Supabase server, in unauthenticated state. No
broad account-level Supabase connector is present. Samuel relayed this to the
orchestrator, which confirmed: "The isolation is configured correctly" and that
unrelated connectors (Carta, Adobe, etc.) are not production blockers.

OAuth could NOT be completed in this session (non-interactive; the interactive
/mcp authenticate flow needs a fresh session). Note for the successor: the CLI
form `/mcp supabase-xenios-prod` is rejected — valid /mcp actions are
reconnect / enable / disable; authentication happens through the interactive
/mcp picker in the fresh session.

LOCAL PRE-CHECKS RE-VERIFIED AT 2026-08-17T18:06Z (all read-only, all green):

- origin = https://github.com/teamxenios/xenios-website.git
- worktree root = C:/xenios-wt/general-platform
- branch clean vs origin/claude/assisted-order-bridge; only `?? .mcp.json`
- M71 file SHA256 from disk = da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a (exact match)
- frozen release SHA 32bbd7998e806d881590c9e9a32123c2b8ba8168 resolves to
  "Record the M71 re-certification evidence for the Phase Zero freeze"

`.mcp.json` REMAINS UNTRACKED ON PURPOSE for now: the successor session opens
the SAME folder, so it inherits the file from disk regardless of git. Whether
to commit it (propagating the prod-scoped server to every future clone) is a
founder decision, not taken here.

PRODUCTION MUTATED: no. Nothing was applied, deployed, or enabled. All
database-side preflight items (M71 unapplied, zero assisted-order
tables/routines, prod SHA/deploy ID, Render state) remain to be re-verified by
the successor through the authenticated scoped MCP.

NEXT EXACT TASK: fresh Claude Desktop Code session in the same folder →
confirm /mcp shows only supabase-xenios-prod → authenticate via browser OAuth →
adopt the claude-fable-desktop identity (heartbeat it) → run the founder's
"XENIOS PHASE ZERO — FINAL PROJECT-SCOPED DESKTOP PREFLIGHT" prompt →
return the preflight report and STOP. Founder GO comes only after
READY FOR FOUNDER GO: YES.
