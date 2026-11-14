# Early Access contact and private quote rollback

These instructions apply only after an approved production migration or release. The two migrations are pending. The current rollback release is ad52179f31e9339eb50e2b9f3f0a965eef0d80d1.

1. Disable quote issuance and notice release. Preserve the outbox and evidence for any notice already queued or accepted. Roll back the app to the approved predecessor and smoke the existing Early Access request and policy path.
2. Confirm the predecessor does not reference the new quote tables or contact RPCs and the deployment flags match the predecessor. Leave the private additive schema and tables in place. Preserve request, quote, audit, and delivery records.
3. Keep the scheduled purge active while temporary contact admissions remain. If intake is closed and the privacy owner has confirmed that no temporary records still need this job, unschedule only ea_contact_admission_purge using cron.unschedule. Keep unrelated cron jobs and the extension.
4. Verify the production origin serves the rollback SHA and the old request path is healthy. Verify quote issuance and dispatch are closed and record the purge and retention result.

Before applying, confirm the existing request-intent private schema, service-role usage, canonical notification outbox, and migration-owner ability to install and run Supabase Cron. After applying, confirm both migration versions in the managed ledger, all eight quote tables with forced RLS, no browser access, and one successful execution of the five-minute contact purge. Production quote runtime authorization remains a separate release dependency.
