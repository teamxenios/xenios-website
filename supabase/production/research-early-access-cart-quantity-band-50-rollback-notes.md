# M66 quantity 1-50 candidate rollback notes

Status: design only. M66 has not been applied, production release authority remains 1-20, and this candidate has not been deployed.

M66 widens only the canonical quantity checks on `research_early_access_cart_items` and `research_early_access_cart_child_releases` from 1..20 to 1..50. It writes no rows and changes no routine, grant, index, column, or relation.

The safe rollback is ordered:

1. Restore the application policy to a maximum of 20 first.
2. Use a separately authorized append-only release decision to ensure no current founder release authorizes more than 20. Never update or delete release history.
3. Prove both durable quantity tables contain zero rows above 20.
4. Only then may a new reviewed migration narrow the two named constraints to 1..20.

If any durable row or current release authority exceeds 20, leave the database band at 1..50. A broader database constraint with a narrower application/release authority is the safe divergence; narrowing underneath truthful durable data is not.

Rollback must preserve orders already accepted above 20 for fulfillment, refund, and audit. It must not delete, rewrite, split, or silently cap them.
