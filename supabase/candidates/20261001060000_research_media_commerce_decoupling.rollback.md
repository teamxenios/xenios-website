# Media/commerce decoupling rollback policy

This is an unapplied source candidate. Its safest rollback is to leave it
unregistered and unapplied.

If an authorized apply starts but has not committed, roll back that transaction.
The candidate is transactional and its precheck requires all four persistent-cart
tables to contain zero rows.

After commit, rollback is unsupported. This artifact does not durably capture the
exact pre-apply product-control row, required-input metadata, ACL state, approval
provenance, or timestamps needed for an exact restoration. Restoring historical
function bodies would also make presentation metadata authoritative again and can
change command identity. Disable the calling commerce feature, preserve every
cart and governance-audit row, and ship a separately reviewed roll-forward repair.

No rollback or roll-forward authorizes a managed migration, deployment, feature
activation, price change, or production mutation.
