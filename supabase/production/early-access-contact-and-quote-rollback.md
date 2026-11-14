# Early Access contact and private quote rollback

Use this runbook for an approved production migration or release. All four migrations are pending. The current rollback release is `ad52179f31e9339eb50e2b9f3f0a965eef0d80d1`.

| Managed version | Change |
| --- | --- |
| `20261114025655` | Contact admission and the private quote schema |
| `20261114025700` | Five-minute temporary contact purge |
| `20261114033000` | Backend-only request ownership lookup |
| `20261114043300` | Backend-only quote request reads with accurate customer and worker audit purpose |

Before applying, reconcile all four versions against the managed migration ledger and the pinned source checksums. Confirm the canonical request table, append-only access events and outbox, service-role schema usage, the request-store definer's RLS bypass, and the migration owner's ability to install and run Supabase Cron. Confirm approved production retention and the customer notice before opening intake.

After applying, verify the ledger contains all four exact versions, all eight quote tables force RLS, and public roles cannot execute the contact or quote RPCs. Verify exact-owner UUIDs, customer and worker audit purpose without staff attribution, and preservation of prior events. Verify one successful scheduled purge and record its owner, cadence, and result. Production quote runtime authorization remains a separate release dependency.

## Application rollback

1. Disable quote issuance and notice release. Preserve the outbox and evidence for any notice already queued or accepted. Roll back the app to the approved predecessor and smoke the existing Early Access request and policy path.
2. Leave the additive tables, contact and quote RPCs, and expanded audit event contract in place. Verify the quote wrappers remain backend-only. The predecessor must serve the existing request path with quote read, issuance and dispatch closed. Preserve request, quote, audit and delivery records.
3. Keep the scheduled purge active while temporary contact admissions remain. If intake is closed and the privacy owner has confirmed that no temporary records still need this job, unschedule only `ea_contact_admission_purge` using `cron.unschedule`. Keep unrelated cron jobs and the extension.
4. Verify the production origin serves the rollback SHA. Record the request-path smoke result, the managed migration ledger and the purge and retention state.
