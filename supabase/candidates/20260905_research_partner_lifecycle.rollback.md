# Partner lifecycle rollback

Candidate only. No production application or operation is authorized by this file.
The final release proposal must name the exact runtime SHA, SQL hash, production
project and approved configuration changes, with reviewed precheck output.

Prefer a forward correction that preserves existing partner rows, evidence and
audit. If an incident requires disabling these new writes, use a separately
approved service-role EXECUTE revocation for the operation and authority functions
or deploy the previously verified runtime. The current runtime fails closed when
the marker cannot be confirmed. Do not delete audit, signature/training history,
Auth identities, partners or idempotency results. Do not remove added evidence
columns while any deployed runtime uses them.

Before reverting the runtime, confirm historical paid membership writers and
renewal flags remain disabled; older code must not resume retired charges or
payment demands. Preserve the membership removal policy in the rollback choice.

Run the read-only postcheck and record function ACLs, schema and unchanged row
counts. Verify unauthorized operation requests fail and normal approved customer
sign-in remains functional. Any actual partner state correction needs an explicit
reviewed operation with its own reason, snapshot and idempotency key. Never restore
active status by bypassing required evidence or certification.
