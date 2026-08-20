# Founder actions

Use this file only for irreducible founder decisions or actions. Engineering should continue around each item.

## Open

- After Phase Zero completes and the seat is released, and BEFORE launching the cashflow/demo lane sessions: delete `SUPABASE_ACCESS_TOKEN` from the Claude Desktop Local environment, REVOKE the temporary PAT in the Supabase dashboard, remove or disable the local `.mcp.json` production connection, and fully restart Claude Desktop. Lane sessions must never inherit a production database credential (see SESSION_LAUNCH_RUNBOOK_2026-08-17.md).
- Unblock the Phase Zero DB preflight: add `SUPABASE_ACCESS_TOKEN` to the Claude Desktop Local environment (environment selector → Local → gear), fully quit and reopen Claude Desktop, then launch the successor Local Code session at the worktree with the recovery prompt. The scoped `supabase-xenios-prod` MCP cannot authenticate in any session started without that variable; every other Phase Zero preflight item is already green (see PHASE_ZERO_PRODUCTION_PACKET.md, baseline reconciled 2026-08-17). Identify or confirm the actor of manual Render deploy dep-da1lmgu417fc73elr8f0 while doing so.
- Approve the exact legal versions required for the public membership application once counsel/version authority is ready.
- Approve production application of the renamed and certified Pack 02 account schema.
- Supply base prices for BAM15 500 mcg and Syringes and Alcohol Swabs when available.
- Approve external supplier onboarding, Care/provider relationships, payment credentials, and Google Workspace scopes as they become ready.

## Never store here

Passwords, tokens, API keys, payment credentials, service-role keys, patient data, or recovery links.
