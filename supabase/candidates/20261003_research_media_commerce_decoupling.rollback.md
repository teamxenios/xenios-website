# Media/commerce decoupling rollback policy

This is an unapplied source candidate. Its safest rollback is to leave it
unregistered and unapplied.

It was reconciled on Core `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59` from
historical MC-01 `f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5`. Its six target
predecessor bodies still match current Core exactly. The companion verifier
pins ten prerequisite files and the complete current persistent-cart migration
DAG closure, without changing the migration DAG or managed ledger. Those source
records list persistent cart as PENDING; this is not a fresh managed read.

If an authorized apply starts but has not committed, roll back that transaction.
The candidate is transactional and its precheck requires all four persistent-cart
tables to contain zero rows.

Before an authorized apply, every existing launch-control domain whose old
manifest included the reserved primary-image key must be paused, including
`product_content`. The candidate invalidates and audits those old approvals.
It never enables a domain. Canonical non-image manifest approval and a separate
canonical launch transition remain required after installation. Malformed image
domains without an existing control do not cause new controls to be created.

The candidate intentionally refuses a second unregistered replay because its
exact predecessor function fingerprints no longer match. A refused replay is
not an apply-twice success. Nonzero persistent-cart history also refuses; no
legacy row, snapshot, command hash, or audit history is rewritten or deleted.

After commit, rollback is unsupported. This artifact does not durably capture the
exact pre-apply product-control row, required-input metadata, ACL state, approval
provenance, or timestamps needed for an exact restoration. Restoring historical
function bodies would also make presentation metadata authoritative again and can
change command identity. Disable the calling commerce feature, preserve every
cart and governance-audit row, and ship a separately reviewed roll-forward repair.

No rollback or roll-forward authorizes a managed migration, deployment, feature
activation, price change, or production mutation.

Later managed promotion must separately qualify the target's exact readiness
and Product Control functions, install the reviewed persistent-cart predecessor
through its current dependency order where absent, confirm zero cart history,
and register a reviewed additive successor through the designated integrator.
Fresh managed prechecks, postchecks, exact-SHA approval, and runtime compatibility
are required. A disposable local PostgreSQL pass does not supply those facts.
