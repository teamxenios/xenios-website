# EA quantity-50 release authority recovery

This note is part of the candidate packet. It authorizes nothing and performs
no database action.

The release ledger is append-only. Therefore the quantity-authority WRITE has
no destructive rollback: a committed quantity-50 release must never be
updated or deleted, and the historical quantity-20 predecessor must remain.

Before WRITE commits, every refusal is transactional. An absent M66 band,
missing duplicate guard, moved target/history/founder hash, unexpected current
limit, mixed 20/50 state, malformed carried-forward field, deterministic ID
collision, or row-delta mismatch aborts the transaction and appends zero rows.

After WRITE commits:

1. Do not deploy or enable the Q50 application until POSTCHECK passes.
2. If POSTCHECK fails, close the storefront and preserve the exact database
   state and logs. Do not rerun the old quantity-20 packet.
3. Re-run PRECHECK read-only. If it reports the exact all-50 replay state,
   WRITE is safe to replay and must append zero rows.
4. Any other state requires a new named-human decision and a separately
   reviewed append-only successor packet. Never repair by UPDATE, DELETE,
   constraint weakening, RLS/grant changes, or history removal.

M66 rollback is separately governed by
`research-early-access-cart-quantity-band-50-rollback-notes.md`: the application
must first refuse above 20 and both durable tables must contain zero rows above
20 before the database band can be narrowed. If either condition is false, keep
the wider database constraint and keep commerce disabled while a reviewed
recovery is prepared.
