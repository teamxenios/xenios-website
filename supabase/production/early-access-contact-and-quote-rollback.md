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

### Customer notices

The request workflow records one customer notice for each of its events, in the event's own transaction, by calling `request_intent_private.enqueue_workflow_notice`. Apply the customer notice migration after the request workflow migration, whose events it reads, and before the workflow is enabled. With the workflow enabled and this migration absent, the workflow's writes are refused, because it will not record an event whose notice it could not record.

Recording a notice sends nothing. The outbox worker sends recorded notices only when `EA_REQUEST_CUSTOMER_NOTICE_ENABLED` is `true`, `EA_REQUEST_CUSTOMER_NOTICE_START_AT` is a timestamp and `RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT` names this deployment. Set the start time to the moment you switch it on. Notices recorded before that time are cancelled, not sent. Enable it only after the sender address and a monitored reply route are verified; the message carries no reply invitation and no Reply-To header.

A notice job stores the request reference and the event's time, kind, revision and environment. The time is the one the workflow recorded for the event, so the message and the request's timeline agree. It does not store the customer's address. The worker reads the address from the saved request when it sends, so a failure alert names a reference and never a customer.

To pause, set `EA_REQUEST_CUSTOMER_NOTICE_ENABLED` to anything other than `true` and deploy. Recorded notices then wait unsent and other mail is unaffected. Preserve the notice rows and the outbox rows. On resume, move the start time to the moment of resuming unless the waiting notices should still go out. Nothing is sent more than 23 hours after it was recorded, whatever the settings.

Four outcomes need no action: `sent`, and `cancelled` with one of two reasons, recorded before the start time or replaced by a later update. A `failed_permanent` customer notice raises the usual failure alert. If its attempts include `Customer notice send had no confirmed result.`, the message may have been delivered: check the provider's log for that key before telling anyone it was not. A requeue from the admin outbox page does not override the 23-hour limit or resend a replaced notice.

Before its first send the worker stores a digest of the exact message: the sender, the recipient, the subject, both bodies and the provider key. It stores the digest only. If a later deployment changes the wording or the sender address, a job that was already attempted is held with `Not resent: this message differs from the one first attempted.` instead of being sent with a different body under the same key. Check the provider's log for that key. A requeue does not release it. Notices that were never attempted are sent with the new wording.

A notice record refers to its request, and nothing deletes it when the request is deleted. Any future retention or erasure procedure must delete a request's notice records and their outbox jobs before the request itself. Until such a procedure is written and reviewed, do not delete requests that have notices.
