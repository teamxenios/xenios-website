# HL-12 default-off finance source handoff, not a release candidate

Branch: `codex/xenios-health-launch-implementation-20260930`
Runtime source: `5df6e4bc90b072c28d8d4e0696793ac1ab255bee`
Runtime tree: `c5e20a4f87a041aaf5d6ad49aab2a345f7d93a4f`
Test-only PostgREST source: `e186625c04be2d88adf314276731a2b1f2ef2f4b`
Earlier full-suite source: `7600943f9ec7573f0a5cbfe7a7687ba851276a30`

The new financial route set is **default off** behind
`RESEARCH_ASSISTED_ORDER_FINANCE_ENABLED=true`. It is not configured in any
hosted environment. The mounted assisted-order status route still refuses an
ordinary `paid` transition. The source implements bounded admin quote issue,
customer owner-bound quote read/accept, and manual observation/verification
route contracts. The manual routes require the verified admin Supabase Auth
UUID. Both manual observation and verification refuse before an RPC when an
independent ledger adapter is absent; production composition currently passes
`null`. Browser-provided amount, actor and payment method cannot mark paid.

Pending SQL is pinned in the migration DAG and ledger, not applied:

1. `20260930191323_research_assisted_order_quote_payment_guard.sql` at
   `084063ac424a4c2ec55183c004c420aba43a3ba0` (HL-26 guard).
2. `20260930193033_research_assisted_order_quote_paid_hold.sql` at
   `f318859262812b8fc1fcb6d2c8e697d86a209349` (temporary fail-closed hold).
3. `20260930202413_research_assisted_order_quote_payment_authority.sql` at
   `c92d7a93e7b443cccd949f8903b62db77d425603` (quote/evidence foundation).
4. `20260930205725_research_assisted_order_quote_access_finance_bound.sql` at
   `5c8498ce7f4c2333ee75b52cdbb0e76e14f0a925`, canonical SHA-256
   `452a94e5acd880a9e02e34681e9844692997d5d7d22802f4efef94b27f30e18f`.

## Evidence, kept as separate runs

- Node v20.19.0, npm 10.8.2; finance focused tests 7/7 pass after the
  manual-adapter guard fix; TypeScript typecheck passes.
- `npm run build` on the `5df6e4b` runtime: exit 0; source scan 1333 files,
  production-build scan 224 files, zero forbidden customer-facing em dashes.
  Vite's chunk/dynamic-import warnings remain.
- Route uniqueness: 458 registrations at 449 call sites. Migration DAG:
  42 nodes with canonical checksums verified.
- Release-control-plane initial run failed two stale fixtures (new pending
  migration source SHAs and the five literal finance routes). After exact
  fixture updates it passed 51 tests, one existing skip. Do not call the
  initial failed run a pass.
- Full suite at `7600943f` under Node 20.19.0, npm 10.8.2, `vitest run
  --maxWorkers=2`: **exit 1**, 18,200 passed, 85 skipped, two failed among
  18,287 tests. Both failures are the intentional protected-file hash tripwire:
  `server/routes.ts` actual
  `sha256:7c21ea1ac26c6359c46d6070a9295a41b16f93355b3475a44f7831c668069137`
  versus manifest `sha256:f17d518ee2a3bcda2ff4d4ffca6bc8475c0ced5f7c9f5f85b19bd189e09ea2ae`,
  and `server/index.ts` actual
  `sha256:1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315`
  versus manifest `sha256:598ffd2e79038c35b5c9e6662cb05258a6b27a33bc3ee96b8b23757f9e2fd888`.
  Those baselines were **not** repinned. No later full suite was run at
  `5df6e4b`; do not transfer the earlier aggregate to this successor.
- Exact SQL source applied twice on disposable PostgreSQL 17.11. A synthetic
  two-connection race produced one immutable verification, one paid event and
  one replay. PostgREST 16.3 on loopback confirmed owner quote read, wrong
  owner null, anonymous/direct-table/unbound-RPC denial, wrong-path null and
  correct-path replay. This is local synthetic evidence, not managed staging.
  The disposable API, database and Docker network were stopped/removed.

## Review and release blockers

The protected-file owner/independent Claude reviewer must review the exact
`server/routes.ts` and `server/index.ts` diffs before any manifest repin.
Review has not happened in this record. There is no signed provider webhook,
server-created payment-attempt binding, real manual ledger adapter, founder-
approved finance grant, customer quote/payment UI, historical-paid handling,
post-paid refund/cancellation authority, or completed payment dashboard.
Managed PostgreSQL/PostgREST and browser journeys are unqualified. HL-11,
product details, public journeys and image integration remain separate work.
Production, managed staging, real email, real money and procurement were not
mutated. Do not deploy or apply these pending migrations from this handoff.
