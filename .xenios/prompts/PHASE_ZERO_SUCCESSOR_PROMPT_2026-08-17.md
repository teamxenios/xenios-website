XENIOS PHASE ZERO PRODUCTION SUCCESSOR

Adopt the existing Phase Zero production-executor identity.

Do NOT register a second production writer.

Read:

AGENTS.md
CLAUDE.md
.xenios/MASTER_CORPUS.md
.xenios/PHASE_ZERO_PRODUCTION_PACKET.md
.xenios/PHASE_ZERO_EXECUTOR_DESIGNATION.md
.xenios/handoffs/2026-08-17T19-58-00-000Z-PHASE-ZERO-SUCCESSOR-READY-claude-fable-desktop.md

The handoff checkpoint is:

13d2e508c8667931650d0ed9edfe0b625552301e

Use the existing identity:

claude-fable-desktop

Reverify:

productionWriter = claude-fable-desktop

No other session may execute M71, write Render environment variables, deploy, or enable Phase Zero.

==================================================
LOCAL SECRET CHECK
==================================================

Check only whether this process received:

SUPABASE_ACCESS_TOKEN

Do not print it.
Do not inspect its value.
Do not print its length, prefix, suffix, or hash.

Return internally:

SET / UNSET

If UNSET:

STOP and tell Samuel that the new Local session still did not inherit the environment variable.

If SET:

continue.

==================================================
SCOPED MCP
==================================================

Read the local untracked:

.mcp.json

Use ONLY:

supabase-xenios-prod

Do not use any account-level Supabase connector.

The MCP must be configured for:

project_ref=yvzeduaxbwgcwllhywff

features=database

and manual bearer authentication through:

SUPABASE_ACCESS_TOKEN

Verify that the scoped server exposes its database tools.

Do not call apply_migration yet.

==================================================
FINAL READ-ONLY PHASE ZERO PREFLIGHT
==================================================

Using ONLY supabase-xenios-prod, verify:

1. Project is exactly:
   yvzeduaxbwgcwllhywff

2. M71 is still unapplied.

3. Assisted-order tables are absent.

4. Assisted-order routines are absent.

5. Migration file:

supabase/migrations/20260815150000_research_assisted_order_bridge.sql

6. Exact expected SHA256:

da60e8b0f0d66625ff72f687f3386c45edaf27f5fc5f020e9137f7e6d486091a

7. Frozen release:

32bbd7998e806d881590c9e9a32123c2b8ba8168

8. Current reconciled production predecessor:

458e7284c12cfbd95bd91371afb88cb8a6201454

9. Current Render deploy ID and production SHA.

10. Render tracked branch and remote HEAD.

11. Render autoDeploy and trigger behavior.

12. productionWriter remains:
    claude-fable-desktop

13. No other session is authorized to execute Phase Zero.

14. The founder packet has not been superseded.

==================================================
RETURN ONLY
==================================================

[PHASE ZERO FINAL DB PREFLIGHT]

LOCAL ENV TOKEN:
SET / UNSET

PROJECT MCP:
CONNECTED / FAILED

MCP SERVER:
supabase-xenios-prod

PROJECT:

FEATURE SCOPE:

ACCOUNT-LEVEL SUPABASE USED:
NO

M71:
UNAPPLIED / APPLIED / UNKNOWN

ASSISTED ORDER TABLES:

ASSISTED ORDER ROUTINES:

M71 SHA256:

FROZEN RELEASE:

CURRENT PRODUCTION SHA:

CURRENT DEPLOY ID:

RENDER TRACKED BRANCH:

TRACKED BRANCH HEAD:

RENDER AUTODEPLOY:

SOLE PRODUCTION EXECUTOR:

READY FOR FOUNDER GO:
YES / NO

Do not apply M71.
Do not alter Render.
Do not deploy.
Do not enable the bridge.

STOP after the report.
