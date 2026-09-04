# Gen2 Referral V1 database candidate

Local engineering candidate only. Not registered in the production migration DAG,
not applied to a live database, and not evidence that referral V1 is live.
No earlier GO hash authorizes this migration, configuration or real link creation.

## Canonical data and prerequisites

The candidate extends `research_partner_links` and `research_attribution_touches`
with nullable V1 fields. Existing rows remain legacy/version-null; they do not
become eligible opaque links. Existing canonical Gen2 partners remain the sole
partner registry. Auth UUID is resolved through `research_members.auth_user_id`
to member UUID, then `research_partners.member_id`; the three IDs are not aliases.

The intended `research_affiliate_customer_bindings` table is created if absent,
or adopted only if its columns exactly match the prior 20260819 candidate. Legacy
binding rows remain untouched. V1 fields add actual link/touch foreign keys; the
canonical Auth account key is `auth:<verified Auth UUID>`. A legacy account winner
is not silently replaced or reclassified. There are no commission, credit, payout,
entitlement, order or clinical writes. `program_state` stays `pending_program`.

Prerequisites must be inspected in the actual target: canonical members, partners,
links, touches, idempotency table, activation constraints, uniqueness, object owner,
roles and existing binding table. The owner must have BYPASSRLS/superuser authority
for the reviewed security-definer functions; it must not be a browser/service role.
Unexpected shapes or a previous V1 object abort the entire transaction. The source
files are not proof that any corresponding object exists in production.

## Atomic contract and limitations

- `research_referral_v1_authority()` returns the exact schema version and refuses
  important privilege, RLS, trigger, constraint and uniqueness drift.
- `research_referral_v1_execute(operation,input)` is service-role-only. The HTTP
  layer must verify the Supabase Auth user before supplying an Auth UUID, and must
  pass the canonical admin guard before `listAdmin`. An asserted UUID in this
  service RPC is not independent proof of a user's session or admin role.
- Issue/revoke resolve partner ownership in SQL. Only active, certified, activated
  canonical partners can issue. Revocation remains possible after suspension.
- Request idempotency is stored in the existing `research_idempotency_keys` table
  in the same transaction as link and audit. There is no separately committed
  pending reservation. The issue fingerprint is destination plus the fixed 30-day
  policy, not a newly generated link UUID/token candidate or moving expiry time.
  A retry reprojects the original row with CURRENT availability.
- URLs are reconstructed in the server using HMAC of link ID and key version;
  the stored token hash must match before offering a URL. `tokenHashHex` in the
  internal store projection is for this comparison only and must be removed from
  every browser/admin DTO. No raw bearer token is stored in SQL or audit.
- Initial destination policy is `/health`, `/care`, `/care/how-it-works`, `/research`,
  `/research/member/catalog`, or one bounded lower-case product slug under
  `/research/member/products/`. No query, origin, encoded path or dot segment.
- A signed visitor nonce must be bootstrapped before capture; the server supplies
  its non-reversible keyed hash. A unique partial subject index preserves one
  first-valid touch. Invalid incoming links are denied; an ineligible historical
  winner stays retained with non-ready availability and never switches partners.
- Bind revalidates the touch, current link/partner, self-referral and expiry.
  Binding and binding reads require an existing canonical member whose status is
  not `closed`; Auth UUID existence alone does not create a Research membership.
  One Auth account keeps one winner; one capture may bind to only one account.
  On a shared browser, a second account cannot inherit that first account's capture.
  Existing bindings remain immutable if the link is revoked/expired later; reads
  return current availability separately. These facts alone authorize no economics.
- Mutations initially share one transaction advisory lock, and eligibility takes
  partner/link row locks. This is deliberately conservative, not a throughput
  certification. Rate limits and deadlines belong to HTTP composition. A future
  finer-grained lock design requires fresh concurrency and deadlock tests.
- Link, touch and idempotency legacy privileges stay in place, except dangerous
  truncate and browser access are removed. Triggers protect V1 rows from direct
  service mutations. Binding/audit tables are RPC-only, FORCE RLS, no policies;
  legacy binding direct INSERT/SELECT grants are removed. Append-only triggers
  prevent UPDATE/DELETE/TRUNCATE of evidence even through ordinary owner DML.
  A privileged database operator can still change DDL; this is not an assertion
  of resistance to a compromised database owner.
- Admin reads are bounded to 100 rows per collection. Links have totals; events,
  touches and bindings are explicit projections. They expose no raw visitor hash,
  customer email/name, or clinical details. Account UUID-based keys are internal
  identifiers and must remain in authorized operator responses, never public URLs.

## Rehearsal

Run the focused adapter suite normally. The actual database suite is opt-in:

```powershell
$env:XENIOS_REFERRAL_V1_DISPOSABLE_PG='1'
node node_modules/vitest/vitest.mjs run server/research/partners/referral-v1-database.test.ts
Remove-Item Env:\XENIOS_REFERRAL_V1_DISPOSABLE_PG
```

The test creates a uniquely named, volume-free container from the repository's
pinned PostgreSQL image, publishes only `127.0.0.1` on a random port, accepts no
database URL, uses actual canonical table DDL (with only the out-of-scope application
FK target stubbed), and destroys only that test container in teardown. All seeds
are synthetic, use `example.invalid`, and have no external integrations. New PG
connections exercise real persistence and SQL privilege behavior. Default skipped
database tests are not passes; unavailable Docker makes an opted-in run fail.

On the current Windows task, Docker Desktop could not start. A portable PostgreSQL
18.3 runtime extracted from checksum-verified official Ubuntu packages was used
instead, without a system install or service change. Set
`XENIOS_REFERRAL_V1_WSL_RUNTIME` to that reviewed task-owned runtime directory under
`/var/tmp/xenios-referral-v1-pg-<id>/runtime`. The shared
`server/research/partners/referral-v1-rehearsal.ts` helper runs `initdb` in a NEW
task directory, starts only that cluster bound to loopback on its own selected
port, and requires successful startup before connecting. It accepts no existing
database URL/host/port. Teardown stops that exact cluster; synthetic logs and data
are retained for local review. The same helper supports the local browser preview.
It is not imported into production composition.

Local verification at this implementation checkpoint: 33 strict RPC adapter checks
and 15 real PostgreSQL checks passed together (48 total). The database checks cover
both absent binding-table creation and prior-candidate adoption, independent
connection concurrency, exact retries, audit-failure rollback, current revocation/
suspension/self checks, Auth ownership/closed-member refusal, immutable evidence,
role/search-path/entrypoint-grant drift, and the separate lineage candidate's
post-bind/own-member filtering, source caps and missing-schema refusal. This is not
proof of the target production PostgreSQL version/schema or a release authorization.

Before promotion require an actual green database rehearsal, SQL review, application
tests, private/public projection tests, full composition/auth checks and current
release gates. Register the reviewed migration in the existing DAG rather than
adding a second release authority. Apply primary candidate before the separately
reviewed lineage candidate, if that candidate is included.

## Authorized rollout and rollback

1. Obtain current action-specific exact-SHA migration/deployment authority.
2. Capture schema-only backup and least-privilege grant baseline; run sibling
   precheck read-only. Reconcile drift without destructive assumptions.
3. Keep the referral route feature dark. Apply the candidate transaction with
   the reviewed owner; run sibling postcheck and the authority RPC as service role.
4. Deploy reviewed application code; configure key/version and flags only under
   the corresponding authority. Verify public token/visitor bootstrap, account
   binding, redaction, revoked/expired handling and admin scopes with authorized
   synthetic data. Do not use real customers as fixtures.
5. On failure, switch the referral feature off and roll back application activation
   first. Preserve the additive columns, links, touches, bindings, idempotency and
   audit evidence. A dark service safely returns unavailable; do not erase facts to
   make the UI look clean. Database removal after data exists is NOT the routine
   rollback. Any destructive schema reversal requires a reviewed backup, exact
   target inventory, explicit approval and a separately rehearsed plan.

Local work does not require new provider integration or financial approval.
Production schema verification, migration, deployment/config changes and real-user
actions do require the release authority above. This candidate alone does not
complete or launch the full website/referral program.
