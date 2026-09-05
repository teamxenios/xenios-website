# Universal partner lifecycle — candidate implementation

The protected `POST /api/admin/research/partners/operations` uses the canonical
admin guard and verified JWT subject, strict discriminated input, exact partner
ID/update timestamp and a durable idempotency key. The source must expose the
`partner_lifecycle_20260905` marker with the exact current requirements owned by
the existing partner domain. Missing or different authority disables operations.
The read-only account diagnosis exposes that availability, current requirements
and partner timestamps without document contents, provider metadata or secrets.

Prepare creates one canonical UUID partner for an active, verified Auth-bound
customer. It grants no certification or activation. Review records an actual
externally reviewed clearance, agreement acceptance or training completion with
an opaque evidence reference and authenticated reviewer. Agreement records require
the exact version, content hash and acceptance timestamp; training requires the
version and completion timestamp. A checkbox alone is not evidence. This release
does not invent contracts, course completion, signatures or identity/tax proof.
Historical evidence is preserved; duplicate version records cannot be overwritten.

Certification checks all existing requirements: identity, tax, payout readiness,
four agreements and fourteen training modules. Activation is a distinct explicit
operation after certification. Rejected clearance removes certification and moves
an active partner into quality review. Suspend/terminate remain available for a
closed customer's partner; activation never does. Reinstatement rechecks all gates.
The historical `xenios_membership` training key is preserved for compatibility;
visible training content must reflect customer access without a membership fee.

Every operation locks the member and partner, rechecks the snapshot, appends audit
and commits its result atomically. Replaying the same actor/key/payload returns the
stored result; a changed payload conflicts. An uncertain client response must keep
the original request and key. A confirmed result requires a fresh diagnosis before
the next operation. No emails, referral qualifications, commission terms, payouts,
payments, catalog permissions or Care grants are created by these operations.

Validation at preparation: 58 service/HTTP/production/inspection tests passed in
four files. The offline PGlite rehearsal passed 57 checks including read-only
pre/post verification, double application, exact requirements, privileged
execution, stale snapshots, missing evidence, idempotent replay, cross-partner
separation and atomic rollback on audit failure. Final rehearsal result is recorded
in the exact-SHA handoff. SQL LF SHA-256 is
`4f10c3e996cbe60e660981dc654e89af2d23e209f8252db067cb9a367b4f5bbb`.
SQL, precheck, postcheck and rollback are candidates only.
This does not prove production object parity, real concurrent sessions or a real
partner's evidence. No production mutation or user operation has occurred.
