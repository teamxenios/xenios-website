# CRM/organization staging preflight — 2026-09-08

The package's read-only preflight was executed through the supported Supabase connection against staging project `tetynodzrtmdbuzgboro`. The query ran inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`; no schema, row, permission or flag mutation occurred.

The inspected staging schema exposes the existing canonical `research_applications`, `research_members`, `research_partners`, and `research_organizations` authorities and their current columns. The requested extension tables (`research_crm_*`, `research_organization_users`, `research_organization_invitations`, `research_account_binding_events`, and `research_organization_management_commands`) and matching `research_crm_*` / `research_organization_*` functions were not returned by the preflight result.

Disposition: **BLOCKED FOR MIGRATION REHEARSAL**. Do not apply either candidate SQL file yet. The next owner must verify the designated Pack02 organization foundation and migration history on the correct authorized staging project, then rerun the exact preflight and rehearse each candidate in order with RLS, privilege, concurrency and audit checks. Production remains unchanged.
