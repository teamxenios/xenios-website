# HL-12 SQL candidate checkpoint, not a release candidate

Branch: `codex/xenios-health-launch-implementation-20260930`
SQL source commit: `c92d7a93e7b443cccd949f8903b62db77d425603`
SQL source tree: `01f315be50bb7cfe1b6a916f0d0747a529148a58`
Migration: `supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql`
Local proof: `supabase/verification/research_assisted_order_quote_payment_foundation_local.sql`

This candidate is **source-only, pending, and incomplete**. It is not applied to
managed staging or production and must not be deployed by itself. The mounted
application still refuses every paid transition. It has no card checkout,
signed webhook adapter, refund transition, historical-paid resolution, or
completed admin/customer quote UI. The migration is not yet in the DAG or
managed ledger at this exact source commit; register it in the next records
slice, still as PENDING.

The SQL candidate creates private quote, verifier-grant, observation and
verification records. It adds service-role-only quote issue/accept,
observation and atomic verification RPCs. The quote issue routine derives
priced lines from immutable request line snapshots; a genuinely quote-only
line requires a private pricing basis. Customer acceptance echoes quote
version and exact cents. A manual observation requires a separately granted
named finance actor; the grant table is empty by default. Provider
observations require event and payment identities, but SQL does not and cannot
authenticate a webhook signature. A future mounted adapter must verify raw
provider bytes before invoking the RPC. No raw payment evidence or card data
belongs in these tables; `source_evidence_ref` is an internal pointer only.

The new SQL guard replaces the temporary paid hold only after a matching
verification exists, while keeping historical paid labels without independent
evidence frozen. That is a known production blocker until a managed preflight
count and an evidenced resolution/runbook are approved. Paid/supplier-state
cancellation remains refused until a governed refund path exists. The
application must not be changed to claim paid is available until these
dependent paths and tests land together.

## Evidence, scoped to the exact source

- Node `v20.19.0` focused customer/server tests: 110/110 after the payment-copy
  safety successor; unmounted payment engine tests: 53/53; TypeScript
  typecheck passed. These are separate runs, not an aggregate full suite.
- Disposable `postgres:17-alpine`: bootstrap roles, M71, HL-26 guard,
  temporary paid hold, new migration and local proof, all exit 0. New migration
  and proof each ran a second time, exit 0. No managed database touched.
- SQL proof covers exact stored line prices and total, quote-only basis,
  wrong owner, stale total, acceptance replay, forced RLS/ACL, append-only
  evidence, wrong amount/currency, reused provider event/reference, typed
  verification ID refusal, wrong finance actor, interrupted write rollback,
  atomic paid status/event and replay. This is SQL-only, not composed HTTP or
  signed-provider evidence.
- Full suite, production build, route uniqueness, migration DAG registration,
  composed PostgREST tests and browser journeys have **not** been run at this
  source. No full-site or release-readiness claim follows from this checkpoint.

## Next exact work

1. Register the pending migration in the DAG and managed ledger; preserve
   predecessor checksum and ordering.
2. Mount quote issue/read/accept and manual observation/verification through
   server-derived actor/owner identity and the existing RPC repository.
3. Add a provider-adapter boundary and signed webhook verification. Bind
   checkout session/payment identity, amount, currency, order and quote before
   recording a provider observation. No browser callback may mark paid.
4. Add governed refund/cancellation and historical-paid compatibility or a
   preflight proof that no such rows exist in each managed environment.
5. Prove wrong owner, wrong amount/currency/reference, stale/unaccepted quote,
   cross-order reuse, concurrent verification, replay and interrupted writes
   in composed HTTP/PostgREST. Then run affected suites, full suite,
   typecheck/build, browser journeys and protected release gates.

Production mutated: **NO**. Managed staging mutated: **NO**. Real email or
money sent: **NO**.
