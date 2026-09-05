# Approved customer access rollback preparation

Candidate only. No apply, deployment, grant or notification has been authorized.
The exact release SHA, candidate bytes, project and service identifiers must be
bound in the final GO packet after current object parity is reviewed. The
separate precheck/postcheck files are read-only and disclose no identity rows.

Before apply, record current function definitions/ACLs, constraints, indexes,
triggers, RLS and aggregate row counts from the precheck. Review unexpected
objects and constraints; do not assume migration-version history proves SQL
byte or schema parity. This candidate must be applied alone in its transaction,
never as a blanket migration push. A failure rolls the transaction back.

The postcheck must verify exact selected function bodies and service-only ACLs,
new constraints/index definitions, and unchanged counts. The candidate creates
no user, application, member, audit event or email job during schema application.
An explicit later admin approval is a separate operational action.

Before any application rollback, disable both historical membership activation
and membership billing flags in the authorized production operation. The new
runtime retires the paid mount regardless of flags, but the old deployed runtime
does not. Do not reopen the old paid approval or renewal process as a rollback.

If no approved-customer operations have occurred, prefer leaving the additive
schema in place and rolling application code forward to a corrected version.
If writer disablement is required, revoke service_role EXECUTE on the two
approval/claim mutation functions as an explicitly authorized step and record
it; update the capability marker to unavailable in the same reviewed corrective
change. Never change a marker while allowing an unintended writer to continue.

After an approval or claim, do not remove the approved_customer status/basis,
drop the provenance/idempotency columns or delete canonical Auth/member/audit/
outbox rows. They are durable operational history. Do not rewrite unpaid billing
as paid or silently return an active account to pending. Reconcile delivery
uncertainty through the outbox and explicit account state review. Repair forward
with a fresh exact-SHA packet. The user enters credentials for real acceptance;
no synthetic production identity or test email is part of rollback/smoke.
