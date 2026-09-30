# HL-12 financial authority progress (source-only)

Branch: `codex/xenios-health-launch-implementation-20260930`
Source checkpoint: `8047e39f588dc20665b7a2c8ab9672ff14484a3f`
Tree: `94a758ac437231a278a9c61a4860bd1d7f36c1c9`

This is not a payment release or a completed Health site. The mounted
assisted-order bridge still rejects every paid transition. The new migration
`20260930202413_research_assisted_order_quote_payment_authority.sql` is
PENDING in `MIGRATION_DAG.json` and `MIGRATIONS.md`, checksum
`f59dc7d285a7c5714ec1a81ec2e0dfb469ef4434da355f15a85ca1e366c5a894`.
No managed migration or hosted configuration changed.

Since the prior SQL checkpoint, a disposable PostgreSQL 17 race exercised
two independent service-role verification connections. It produced exactly
one immutable verification and one paid event, with the second call returning
a replay. The first synthetic fixture attempt failed the reference-format
constraint; only a corrected synthetic reference passed. The race script is
`supabase/verification/research_assisted_order_quote_payment_concurrency_local.mjs`.
The disposable Docker container was stopped after the test.

The existing `requireSupabaseAdmin` JWT guard now stamps the verified Supabase
Auth UUID on the server request. The assisted-order admin viewer carries only
that guarded UUID; body/query values and an email label cannot substitute for
it. This does not create or grant a finance role. Focused production-wiring
tests passed 16/16 under Node v20.19.0, and TypeScript typecheck passed.

At this source: route uniqueness passed (453 registrations); migration DAG
passed (41 nodes and canonical checksums); source no-em-dash passed (1332
files, zero forbidden forms); production build passed (224 build files, zero
forbidden forms), using Node v20.19.0 and npm 10.8.2. Vite emitted existing
chunk-size/dynamic-import warnings. These results are separate checks, not a
new full-suite aggregate. The full suite was not run at this checkpoint.

Open P1 work before any payment promotion: mount quote issue/read/accept and
manual observation/verification with server-derived actors and owner identity;
verify a signed provider event and bind a server-created payment attempt before
provider observations are accepted; qualify composed HTTP/PostgREST and
concurrency; add refund/cancellation and historical-paid resolution; then run
the full suite, browser journeys, protected-change gates and independent
review. No finance grant, real payment, real email, procurement, managed
staging change, production migration or deployment is authorized by this
record.
