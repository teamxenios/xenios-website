# Executor access requirements — Milestone 1 (deploy) and Milestone 2 (activate)

What the named production executor must be able to do, how the last release
actually did it, and what this Claude session can and cannot do today. No
credential is written here or anywhere in Git.

## How `ff3c496` was executed on 2026-09-07 (the pattern to repeat)

- **Render** service `srv-d8s9vej7uimc7384dfcg`, auto-deploy **off**. The
  deploy was **commit-pinned through the Render deploy API**; the serving
  commit was re-read through the API after completion and matched. Deploy ID
  `dep-dafcm567bikc7382rhng`.
- **Supabase** project `yvzeduaxbwgcwllhywff`. Migrations were rehashed with
  LF normalization, applied in authorized order, and recorded in the managed
  migration history (`20260907143147`, `20260907143204`) with postchecks.
- Serving identity was verified by the API's commit field, not by
  `/api/health`, which carries no SHA (`RENDER_GIT_COMMIT` is only surfaced
  through the founder command centre card).

## Access the executor needs

| Action | Required capability | Milestone |
| --- | --- | --- |
| Trigger a deploy pinned to the exact SHA and read back the serving commit and deploy ID | Render API key (or dashboard) with deploy rights on `srv-d8s9vej7uimc7384dfcg` | 1 |
| Run the read-only precheck, apply `20260906120000_research_resource_library.sql` atomically with stop-on-error, run the postcheck, confirm the migration-history row | SQL execution on project `yvzeduaxbwgcwllhywff` as a role able to create tables, functions, a storage bucket and grants — Supabase dashboard SQL editor, CLI with the DB connection, or the Management/MCP API with a valid personal access token | 1 |
| Set `RESEARCH_RESOURCE_HUB_ENABLED=true` on the service and restart | Render env-var edit rights on the service | 2 |
| Read logs for 30 minutes after each step | Render log access | 1, 2 |
| Authorized read-only smoke as an active affiliate and as a non-partner member | Two real, approved accounts designated by Samuel; no synthetic account may be created in production | 2 |

## What this Claude session has right now

| Connector | State | What unblocks it |
| --- | --- | --- |
| Render (claude.ai connector) | **Unauthenticated** — the server requires OAuth, which cannot be completed inside this non-interactive session | Samuel authorizes the Render connector in claude.ai connector settings for this account, scoped to the service above |
| Supabase MCP `supabase-xenios-prod` (`.mcp.json`, HTTP, `Authorization` header) | **Rejected** — the endpoint answered 401 "JWT could not be decoded"; the configured header value is not a token the MCP accepts | Samuel replaces the header value with a valid Supabase personal access token for the project (Claude never reads or echoes it), or performs the SQL steps himself from the dashboard while Claude supplies the exact files and hashes |
| Public HTTP (read-only GET) | Working — both origins answer 200 on `/api/health` | — |

Until both rows are green in the environment that will execute, **Claude
cannot be the executor** and should not be named as one. The alternative
named executor is Codex A on return, using the same Render API and Supabase
path it used for `ff3c496`.

## Current answer — who can actually authenticate (2026-09-08T02:55Z)

| Executor | Render (deploy + read serving commit) | Supabase (apply migration + postcheck) | Verdict |
| --- | --- | --- | --- |
| **Codex A** | Demonstrated 2026-09-07: commit-pinned deploy `dep-dafcm567bikc7382rhng`, serving commit re-read | Demonstrated 2026-09-07: two migrations applied and recorded in managed history with postchecks | **The only executor with demonstrated access.** |
| **Claude (this session)** | Cannot — connector unauthenticated, OAuth impossible in a non-interactive session | Cannot — configured token rejected (401) | **Not an executor** until Samuel grants both in the executing environment |
| Codex B | Not demonstrated | Not demonstrated | Not proposed |

Production ownership stays singular: the approval request should name Codex
A unless Samuel deliberately re-points it and the access above is proven
first. Claude will not attempt production actions.

## What the executor must be handed

Exact SHA and tree; the three SQL files with their canonical hashes
(`e55f965f…`, `742bce57…`, `7c7ef33b…`); the rollback file hash
(`1c8261fb…`); the flag decision (absent for Milestone 1); the smoke list
from `DEPLOYMENT_VS_ACTIVATION.md`; and Samuel's exact-SHA authorization
naming that executor. Nothing older transfers.
