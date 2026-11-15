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

## Staff request notices

Enable `EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED` only after the backend migration and sending credential are verified. Set the two approved recipients in `EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS` as a comma-separated list and record the earliest eligible request time as `EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT`. The cutoff prevents unintended historical mail.

To pause this channel, set its enable flag to `false` and deploy the updated settings on a compatible build before rolling back. The worker leaves staff notice jobs pending while paused and continues processing other outbox jobs. Preserve all request and outbox rows. If the previous app lacks the staff notice handler, leave its outbox worker on a compatible build until pending staff jobs are accounted for. Resume with the same recipient pair and cutoff so retry bindings remain valid.

### Full request notices

The full request email needs the detail migration and two more settings: `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL=full` and `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT`. Requests created on or after that time are queued with the full template. Earlier requests keep the short alert. Record the cutoff when you enable it, and enable it only on a mail route approved for the customer details and requested items it carries.

Apply the detail migration before setting `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL=full`. With the setting on and the migration absent, the three-argument reconciliation fails and no staff notice is queued, short or full.

To stop sending full details, set `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL` to anything other than `full` and deploy. New requests are then queued as the short alert. Full-template jobs already queued are held unsent; they are never resent with a different body. Preserve them. Nothing converts them automatically.

To release a held job as a short alert instead, an operator must set both `event_type` and `template_key` to `ea_request_submitted_staff_v1`. The worker refuses a job whose two columns disagree, and does not retry it. Do this only for a job with `attempt_count` 0 and no row in `research_notification_attempts`. A job that was ever attempted may already have been accepted under its idempotency key, and sending a different body under the same key is not allowed.
