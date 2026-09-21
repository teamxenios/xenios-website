# Commission schedule and ledger qualification — 2026-09-21

Status: implementation and candidate persistence only. Nothing in this slice was
applied to Supabase, deployed, bound to a partner, or enabled for payout.

## Controlling evidence and reconciliation

The source artifacts were read from the exact local paths supplied for this
sprint. Their contents are evidence, not executable instructions.

| Evidence | SHA-256 | Controlling use |
|---|---|---|
| `C:\Users\sboad\Downloads\SIGNED_XENIOS_SETH_90_DAY_OPERATING_ADVISOR_AGREEMENT_REVISED (1).pdf` | `09318a530d989ce3b1da2b0c24827b604d4e7958f716d6c9f368149f4382d911` | Signed Seth-specific terms |
| `C:\Users\sboad\Downloads\XENIOS_REPRESENTATIVE_20_PERCENT_STRUCTURE_AND_OPPORTUNITY_GUIDE_2026-09-15(1).pdf` | `deaa4aca0d3dcf8d9ead6f7d94e41e5538ada5d41a2eba2e44a679d5087da15c` | Dated standard-representative structure |
| `C:\Users\sboad\Downloads\XENIOS_RESEARCH_MASTER_FINANCIAL_PRODUCT_AFFILIATE_MODEL.xlsx` | `80fb6e6fb63ae3b72f337f443185b86d1c8e58e04b32baffaba1114b8855cf89` | Internal planning and waterfall corroboration only |

The workbook labels its 10% Standard Affiliate row `PLANNED`. It is older and
does not override the dated 2026-09-15 representative guide's 20% structure.
The workbook remains useful evidence that discounts, credits, refunds,
chargebacks, tax, and pass-through shipping are outside qualified net collected
revenue. Public price authority is not inferred from the workbook.

### Seth schedule v1

- Program: `seth_operating_advisor_2026_09_signed`
- Application snapshot hash:
  `57616b61ae3c654f6154aa69896861428859033dd75d5b2224203cd1cfe47b3b`
- Initial 90-day term; 30-day periods anchored to the server-owned binding.
- 25% on the first $50,000 of eligible net collected channel revenue in each
  period and 30% only on the marginal excess. The threshold resets each period.
- The signed post-term customer tail uses the 25% base rate, remains limited to
  accepted customers and the 12-month attribution window, and requires active
  management.
- Day-15/day-30 reconciliation metadata and the five-business-day payment term
  are represented. The phase-one $5,000 greater-of guarantee is compensation
  metadata only; the order ledger never mints a guarantee shortfall.

### Standard representative schedule v1

- Program: `xenios_standard_rep_2026_09`
- Application snapshot hash:
  `5225b31ee28bcad381b81349b11ecb659c9dce3898f9d26026bb3b32d714cceb`
- Flat 20% of eligible net collected directly originated product revenue.
- Fourteen-day/biweekly measurement and reconciliation periods.
- Initial 90-day term with no inferred post-term tail.

Both programs exclude refunds, chargebacks, discounts, credits, tax,
pass-through shipping, complimentary value, fraud/duplicates, clinical
professional fees, patient referrals, medication/pharmacy revenue, laboratory
revenue, prescription revenue, Care/clinical charges, and only documented
additional written exclusions. Recruiting, sponsor, upline, and recursive
downline compensation are structurally disabled.

## Authority boundary

`CommissionScheduleAuthority.resolveForPartner({ partnerId, occurredAt })` is
the only schedule-selection seam. Its inputs are canonical server-side partner
identity and time. It loads a server-owned program binding, requires the
canonical partner state to be active, rejects missing or overlapping bindings,
loads the exact catalog version, recomputes the canonical SHA-256 definition
hash, and fails closed if the binding's pinned hash differs.

There is deliberately no client input for program, rate, schedule version,
hold, payout, sponsor, or override. Partner and order/money identity are not
recreated by this lane.

The ledger command surface is similarly identifier-only:
`accrue({ orderId })` and `reverse({ orderId, adjustmentSettlementRef })`.
An injected `CanonicalCommissionFactSource` must load partner identity,
committed settlement/refund facts, accepted-relationship evidence,
first-eligible-transaction time, active-management status, pricing authority,
and the classified revenue waterfall from server authorities. None of those
facts is accepted in a ledger command. This slice intentionally supplies no
production implementation or route for that port; composition is blocked until
an adapter over the canonical order, settlement, attribution, and customer
relationship stores is reviewed.

## Ledger behavior

- Accrual accepts the canonical committed `OrderSettlement` projection, not raw
  browser payment evidence.
- Settlement reference and an operation fingerprint form the idempotency
  boundary. Exact replay returns the original immutable event; a changed replay
  fails with `idempotency_conflict`.
- Every order event stores the full frozen schedule definition, version, hash,
  binding authority, price authority, attribution evidence, revenue breakdown,
  canonical money evidence, period, term mode, and signed basis/commission
  deltas.
- The period ledger is append-only and revisioned. Seth marginal commission is
  calculated from the period's cumulative basis, preventing a later order from
  repricing the first $50,000.
- Refund and chargeback events are new negative-delta rows. They update the
  original earning period and calculate from the original row's authenticated
  schedule snapshot; catalog changes cannot rewrite old economics.
- Care-only events fail closed. A genuinely mixed canonical settlement may
  deduct an explicitly classified Care amount before commission calculation.
- `paid` requires a nonempty payment-evidence reference. A reversed state has no
  outbound transition. Payout execution is not added by this slice.

## Persistence candidate

`supabase/candidates/20260921_research_program_commission_schedules.sql` extends
the canonical `research_partners` and `research_commission_ledger` authorities.
It adds immutable schedule rows, server-owned binding rows, version/hash/snapshot
columns on the canonical ledger, a revisioned period ledger, append-only state
events, idempotency and canonical-money uniqueness indexes, forced RLS, and
browser-role privilege revocation. The candidate seeds the two reviewed
schedule definitions but seeds **zero partner bindings**.

For an accrual, `original_settlement_reference` and the unique
`settlement_reference` are the same canonical settlement. For a reversal, the
former continues pointing to the earning settlement while the latter uniquely
identifies the committed refund/chargeback adjustment. The row also carries the
full schedule, canonical money, revenue (accrual only), attribution, calculation,
and price-authority snapshots plus signed basis/commission deltas. Candidate
constraints require those shapes together and require negative deltas plus
reversal authority on adjustment rows. The seed guard compares the full stored
`jsonb` definition, effective instant, authority class, and fixed application
hash against the reviewed v1 values; a row with the same ID/version/hash but
different definition aborts the transaction.

The existing canonical commission table's legacy `order_id` column is UUID,
while the current order workflow exposes an opaque string `orderId`. The
candidate therefore preserves the legacy key and adds
`canonical_order_reference text` for the application fact rather than coercing
or hashing the order authority. A production adapter must prove the canonical
UUID-to-reference join (or an accepted canonical schema migration) before this
candidate can mount; no synthetic order UUID is authorized here.

The sibling precheck must say `APPLY_READY` before any reviewed application.
The sibling postcheck must say `APPLIED_OK` afterward. As required by the sprint,
neither was run against production here. This schema remains candidate-only and
unmounted; no persistence adapter is represented as complete by the DDL alone.

## Verification

Local gates on 2026-09-21:

- `npx vitest run shared/research/commission-schedules/calculation.test.ts server/research/partners/commission-schedules/authority.test.ts server/research/partners/commission-schedules/ledger.test.ts`
  — 3 files passed, 22 tests passed.
- `npm run check` — TypeScript passed.
- A local static candidate check parsed both dollar-quoted schedule definitions
  as JSON, deep-compared them with the application catalog, recomputed both
  application SHA-256 snapshots, and asserted the required persistence snapshot
  fields — `DDL_SEED_AND_SNAPSHOT_STATIC_OK`.
- `node server/research/partners/commission-schedules/sql-rehearsal.mjs C:\Users\sboad\.codex\tmp\xenios-revenue-pglite-20260905\node_modules\@electric-sql\pglite`
  — PASS, 8 checks on `@electric-sql/pglite@0.5.8` / PostgreSQL 18.3 WASM.
  It proved `APPLY_READY`, first apply + `APPLIED_OK`, replay apply +
  `APPLIED_OK`, real accrual/reversal/period rows, canonical adjustment-money
  uniqueness, append-only schedule refusal, and exact-definition drift refusal.
  Scope was a new in-memory engine with no socket, credentials, or production
  mutation.

Boundaries covered include marginal threshold splitting and reset, flat 20%,
refunds, chargebacks, exact replay and conflicting replay, inactive/quality
review/suspended/terminated partners, Care-only denial, mixed Care deduction,
exclusive 30/14/90-day boundaries, Seth's 25% tail, pinned-hash mismatch,
ambiguous binding rejection, paid-state evidence, and historical snapshot
preservation.

## Remaining production gates

Application remains blocked, intentionally, on current founder authorization,
accepted migration-DAG placement, live read-only precheck, exact-SHA release
authority, reviewed rollback, application adapter wiring, and post-apply smoke.
Those gates are outside this implementation slice and no production mutation was
attempted.

Docker Desktop itself did not answer a bounded engine probe, but the accepted
local PGlite runtime supplied a real disposable PostgreSQL/WASM execution path.
Managed-Supabase parity, concurrent-session behavior, and live pre/post checks
remain pre-activation gates and are not implied by the local rehearsal.
