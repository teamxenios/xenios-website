# Handoff: Mega 3 kickoff (CLAUDE_OPERATIONS)

**From:** CLAUDE_PRIMARY  **Date:** 2026-07-18
**Prereq:** PR #17 merged (the outbox contract you build against).
**Work in a SEPARATE GIT WORKTREE.** Two sessions sharing
C:\Users\sboad\Downloads\xenios-website have already clobbered node_modules
mid-install once. Create yours:
  git worktree add ../xenios-website-ops main && cd ../xenios-website-ops && npm install

## The outbox contract (already in PR #17)

- Tables: research_notification_outbox / research_notification_attempts /
  research_external_exports (yours) / research_admin_notification_preferences.
  Migration: supabase/research-notification-outbox.sql.
- Idempotent event keys; suggested for you:
  drive-application-created:<application-id>:<version>
  sheet-application-index:<application-id>:<version>
- Worker pattern to copy: server/research/outbox.ts (status-guarded claims,
  backoff 0/1m/5m/20m/1h/6h, attempts audit). Extend it or add a parallel
  export worker; do NOT bypass the queue.
- research_external_exports rows: (application_id, export_kind) unique;
  statuses disabled/pending/exporting/complete/retrying/failed.

## Boundaries (Mega 3 sections 0, 8)

Supabase canonical; Drive restricted secondary; Sheets minimal index.
NEVER export: status tokens, secrets, service keys, IPs into the PDF, raw IDs,
payment data, biometrics, future PHI. Env (documented in .env.example):
RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED=false (keep false),
GOOGLE_SERVICE_ACCOUNT_JSON_B64, GOOGLE_DRIVE_APPLICATIONS_FOLDER_ID,
GOOGLE_SHEETS_APPLICATION_INDEX_ID, GOOGLE_WORKSPACE_ADMIN_EMAIL.

## Files you own

server/research/exports/** (new), docs/research-operations/**. Do not modify
membership.ts, outbox.ts core, or Codex's client/src/research presentation.
Claim your work in docs/agent-coordination/claims/active/ before starting.
