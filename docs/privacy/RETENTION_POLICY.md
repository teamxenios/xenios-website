# xenios research data retention policy

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: counsel feedback, any new table, any retention automation
shipping, or any deletion request that this procedure cannot cleanly satisfy.
Must stay consistent with docs/security/CURRENT_STATE_FACTS.md.

## 1. Current reality (honest baseline)

- All research data lives in Supabase Postgres. Storage and backups follow
  Supabase defaults; we run no custom backup schedule.
- No automated deletion, expiry, or archival job exists anywhere in the stack.
  Nothing is deleted unless a human deletes it.
- The only time-limited artifacts are cryptographic, not stored: research
  session cookies expire at 12 hours and signed status tokens at 90 days.
  Expiry stops the credential working; it deletes no data.
- Resend and Render retain their own delivery and infrastructure logs under
  their terms; we do not control those retention windows.

## 2. Draft retention targets (counsel must confirm every line)

These are proposed targets, not implemented behavior and not legal advice.
Clocks run from the triggering event stated.

| Data class | Example tables/fields | Proposed target |
| --- | --- | --- |
| Rejected/expired applications | research_applications, events | 12 months after final status, then delete |
| Approved but never claimed | same, approval_expires_at passed | 12 months after expiry, then delete |
| Active member data | members, application of record | life of membership |
| Departed member data | same, after termination | 24 months, then delete |
| Application event audit | research_application_events | as parent application, see section 5 |
| Outbox rows and attempts | notification outbox tables | 12 months after final state |
| Consent records | consent booleans; research_consent_events when live | as long as the consent could need proving; counsel must confirm |
| Marketing consent (withdrawn) | marketing_consent=false | keep the withdrawal record; stop sending immediately |
| Operational IP/user_agent | ip, user_agent columns | 12 months, then null out |

No target is enforced by code today. Implementing automation is future work
and must not ship before counsel confirms the numbers.

## 3. Deletion request procedure (manual, today)

1. Receive the request at the team email; log date and requester.
2. Verify the requester controls the email on file (see PRIVACY_PROGRAM.md
   section 4). Unverified requests are declined with an explanation.
3. Check holds: an active dispute, suspected fraud, or a legal preservation
   need pauses deletion; counsel must confirm any hold.
4. Execute deletion per section 4 within 30 days of verification (internal
   ceiling; counsel must confirm the required statutory window).
5. Confirm completion to the requester and record the completion date.

## 4. What deletion must touch

A complete deletion for one person covers, in order:

1. research_applications row (deleting it cascades
   research_application_events).
2. Notification outbox rows and attempt records keyed to that applicant.
3. Member row and the Supabase Auth user, if the application was claimed.
4. Consent records: application booleans go with the application row; when the
   consent registry (research_consent_events, research_covenant_acceptances)
   goes live, apply the section 5 preservation rule before deleting.
5. external_exports rows and any future Drive/Sheets copies once that flow
   exists (disabled today, so nothing external to purge yet).
6. Referral rows referencing the person, once referrals are enabled.
7. A written note that Supabase default backups may hold the data until those
   backups age out; we cannot purge vendor backups on demand. State this
   honestly in the confirmation to the requester.

Out of reach and disclosed as such: Resend delivery logs and Render
infrastructure logs, retained under those vendors' terms.

## 5. Audit preservation rule

Deletion removes personal data; it must not silently erase that governance
happened. Before deleting, record a minimal tombstone in the admin log: an
internal reference id, the fact a deletion was verified and executed, and the
dates. The tombstone contains no name, email, or application content. Where an
append-only record (consent events, covenant acceptances) must be kept for
legal defense, prefer redacting identity while keeping the event skeleton;
counsel must confirm what must be preserved versus deleted per statute.

## 6. Future automation

When retention automation ships it will be a scheduled job enforcing section 2,
with a dry-run mode, per-run audit output, and a feature flag default off.
Until then this document plus the manual procedure is the policy.
