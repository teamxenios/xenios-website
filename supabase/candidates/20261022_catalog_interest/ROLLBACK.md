# Catalog-interest candidate rollback

This candidate has not been applied to a managed environment. Qualify it in a disposable PostgreSQL 16/17 database before promotion.

If a later managed apply must be reversed before any real intake is enabled:

1. Stop admission at the application configuration boundary.
2. Confirm no catalog-interest outbox row is `processing`, `sent`, or `delivered`.
3. Preserve an audited export of any lead, consent, and outbox rows. Do not delete customer records as an incidental rollback.
4. Revoke `record_catalog_interest` from `service_role` and drop the function.
5. Remove only unprocessed `catalog_interest_customer` and `catalog_interest_team` jobs after an explicit data-retention decision.
6. Drop the two tables only when the retained data has been dispositioned explicitly.

There is intentionally no automated destructive rollback script.
