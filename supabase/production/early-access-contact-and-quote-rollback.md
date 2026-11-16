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

Apply the detail migration before setting `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL=full`. With the setting on and the migration absent, the three-argument function is missing. The worker then logs `full staff notices need the detail migration` and queues the short alert. Requests queued in that time keep the short alert after the migration is applied. Any other reconciliation error queues nothing until the next pass.

Resend recognises a repeated idempotency key for 24 hours. A staff notice job that was attempted before is therefore not resent once it is more than 23 hours old, measured from when the job was queued. It fails permanently with `Not resent: an earlier attempt is past the provider's 24-hour duplicate check` and raises the usual failure alert. A requeue from the admin outbox page does not override this. Check the provider's log for that request before telling anyone the alert was not delivered. The automatic retries finish within about ten hours, so this applies only after a long pause, an outage or a manual requeue. A job that was never attempted is sent once, whatever its age. A job counts as attempted from the moment a worker claims it, before the send, so a worker that stopped mid-send still counts. A stuck job requeued from the admin page keeps that record.

To stop sending full details, set `EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL` to anything other than `full` and deploy. New requests are then queued as the short alert. Full-template jobs already queued are held unsent; they are never resent with a different body. Preserve them. Nothing converts them automatically.

Keep full delivery off during any approved conversion of a held job to a short alert. Verify durable evidence that the job was never claimed. The row must be pending, have `attempt_count` 0 and `last_attempt_at` null, and have no row in `research_notification_attempts`. A legacy row can satisfy those checks after an earlier claim, so use the claim history to establish that the job was never claimed. Preserve the original template if claim history is inconclusive or any check fails. For a verified unclaimed job, set `event_type` and `template_key` together to `ea_request_submitted_staff_v1` in one guarded update that rechecks state and attempt evidence. The worker treats mismatched template columns as a permanent failure. An accepted idempotency key is bound to the body previously sent.
