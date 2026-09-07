# Resource Hub recovery procedure — execution requires exact release authority

This document prepares recovery; it authorizes no production operation. The old
account/partner approval does not cover this new migration or feature flag.

## Before applying

- Freeze the application SHA/tree and LF hashes of the candidate and checks.
- Independently qualify the frozen application and corrected migration. Verify
  the authenticated project binding, service, serving SHA, single writer,
  auto-deploy off, fresh read-only precheck, and existing Storage policies.
- Run only the exact named migration in one database transaction using a
  stop-on-error executor. Do not use a blanket database push or repair history.
- Keep `RESEARCH_RESOURCE_HUB_ENABLED` absent or `false` until the exact
  postcheck passes. This candidate has no seed resources, partners or users.

## Failed or uncertain migration

Stop. Re-read remote migration history, tables/functions/permissions and bucket
metadata before any retry. A connector timeout is neither success nor failure.
An existing object deliberately makes the first-install precheck fail. If the
transaction rolled back, verify absence; if it committed, verify the exact
postconditions. Never drop/recreate objects or rename/repair migration history
to force a green check. Additional database repairs require separate approval.

## Application or feature failure after apply

1. With applicable recovery authority, set `RESEARCH_RESOURCE_HUB_ENABLED=false`
   and verify the effective environment after the required restart/deploy.
2. Keep `RESEARCH_MEMBERSHIP_BILLING_ENABLED` absent/false. If reverting to the
   prior account/partner application, explicitly set
   `RESEARCH_FOUNDING_ACTIVATION_ENABLED=false` first, as in its rollback plan.
3. Redeploy the recorded compatible application rollback SHA. The current
   previously released reference is `ff3c496245739233b71e46f9e5d6e26af9d57017`;
   recheck compatibility and the actual live state when requesting release GO.
   The migration is additive and ff3c496 does not reference its new objects.
4. Verify actual serving SHA, public/read-only smoke, expected unauthenticated
   denials, critical endpoint comparison, logs and the full observation window
   named in the new release packet. Do not shorten that window to meet a time target.

The flag is read when services are composed; changing its stored value is not
evidence that an already running process stopped serving resources. Confirm
the restart/serving instance and perform authorized read-only checks.

## Preservation and limits

Do not delete resources, versions, storage objects, deliveries or any customer,
approval, partner, agreement, audit, billing or outbox history. Preserve the
private bucket and ACLs; never make it public to diagnose delivery. Do not
truncate data or roll back this additive migration by dropping tables/functions.
Never trigger notification jobs or real customer actions for a recovery smoke.

Application rollback cannot retract PDF bytes already downloaded. Record any
actual disclosure and affected immutable version identifiers through the
authorized incident process without placing personal data in this repository.
Restoring backups, altering policies, repairing pointers, changing evidence or
deleting orphaned uploads is a separate database recovery decision.
