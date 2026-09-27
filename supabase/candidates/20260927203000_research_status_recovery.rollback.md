# P-17 secure status recovery rollback

This source-only candidate has not been applied to staging or production.

Rollback is code-first and preserve-first:

1. Disable/remove the P-17 request, exchange, status, and end route registrations and the `research.status_recovery.link` outbox dispatch.
2. Revoke `EXECUTE` on all five `research_status_recovery_*` functions from `service_role`.
3. Revoke any still-live status sessions and unconsumed recovery tokens by setting `revoked_at` through a reviewed owner-only maintenance transaction.
4. Retain both additive tables for audit until retention and legal review permit deletion.
5. Only after proving zero live credentials and preserving required audit evidence, drop the five routines, then the session table, then the token table.

No rollback may restore direct reference-plus-email disclosure, weaken the existing assisted-order owner/session/token authorities, or delete assisted-order rows. Production execution requires a separate founder-authorized runbook, exact migration SHA, prechecks, backup/retention decision, postchecks, and smoke verification.
