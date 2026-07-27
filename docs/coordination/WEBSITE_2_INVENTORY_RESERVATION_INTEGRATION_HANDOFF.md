# Website 2 atomic inventory reservation integration handoff

## Frozen identities

- Exact integration/production base:
  `57533983e4c11e6549e6e8bf9d94f50cd46005af`
- Exact PR #92 source base:
  `ef158672ce9ec3524f8bb64841b285a76e37a54b`
- Website 6-accepted production-compatible PR #92 source:
  `31b91f107cd2a54140d007267bb4cc02549e8404`
- Accepted source scope: ten files, byte-preserved in the integration tree.
- Accepted source and managed migration canonical Git-blob SHA-256:
  `4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005`.
- Prohibited PR #92 predecessors remain prohibited and are not integration
  sources.
- Prohibited integration heads `27a4a6dfc3e7d0d302b2c41ba4eeee7cfcb71ff8`
  and `10f1f15a4e0de0ec4c7b28befc9c2e3e45ed0061` are not release
  candidates. The latter failed transactionally against the Wave 2-only
  production shape because the superseded source assumed dormant Track B
  reservation tables; the failed apply created no object, row, or migration
  ledger record.
- The exact integration head is the frozen PR head and is pinned in the
  out-of-band machine-readable release manifest.

## Website 2 integration scope

- Copies the accepted SQL byte-for-byte into managed migration
  `20260727160000_research_inventory_reservation_commands.sql`.
- Records the exact reviewed source SHA/path and raw checksum in the formal
  migration DAG, after the deployed Wave 2 inventory/COA prerequisite.
- Extends the DAG validator so a managed migration at a distinct path must
  byte-match its externally reviewed source blob.
- Adds a read-only production verifier and documented non-destructive
  application rollback.
- Creates the two canonical reservation base tables and indexes when they are
  absent after deployed Wave 2, while converging with the dormant Track B
  schema when it already exists.
- Adds no HTTP route, UI, capability, environment variable, provider call,
  cart, checkout, order, payment, seed, role, product, lot, COA, reservation,
  or Care record. Checkout remains disabled.

## Validation required before exact-SHA review

- All ten Website4 source blobs byte-identical to accepted PR #92.
- Managed migration byte-identical to the accepted source and canonical raw
  SHA-256 verified.
- Focused reservation, release-control, typecheck, build, and exact-diff
  gates pass.
- Fresh PostgreSQL 16 applies the production-shaped Wave 2 chain with zero
  reservation tables and the candidate twice, then passes the complete accepted
  race/concurrency/security verifier and the new read-only verifier.
- A separate preexisting Track B lane converges apply-twice without replacing
  canonical tables and passes the same verifier.
- Three reservation tables force RLS with zero policies/browser grants;
  `service_role` has exactly three SELECT privileges and four command RPC
  grants; helper functions remain ungranted; zero reservation rows remain.

## Production sequence after exact-SHA integration acceptance

1. Capture immediate pre-apply counts and current migration, RLS, privilege,
   RPC, Product Control, Wave 2, baseline operational, and disabled-Care
   evidence without creating a record.
2. Apply only the reviewed managed migration.
3. Run the read-only production verifier and preserve its exact output.
4. Merge only the Website 6-accepted integration head.
5. Wait for the matching Render auto-deployment to reach `LIVE`.
6. Verify deployed SHA, health, signed-out route/privacy boundaries, logs,
   unchanged baseline counts, zero reservation rows, exact grants/RLS/RPC
   posture, no new navigation, checkout disabled, and Care disabled.
7. Hand exact merge/deployed SHA, Render deployment ID, migration row, and
   pre/post evidence to Website 6 for read-only post-deploy QA.

## Rollback

Before any real input exists, application rollback restores the exact
pre-release Render deployment while retaining the inert additive schema.
After real input exists, preserve the additive schema and append-only history;
do not drop tables or use `CASCADE`. Destructive schema rollback requires a
separate explicit data decision and reviewed exports.
