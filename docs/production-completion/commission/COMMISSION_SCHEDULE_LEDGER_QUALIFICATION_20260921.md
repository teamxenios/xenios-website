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
  `549f97385d7e7c4bf78bde1f407798dfb35866da2024a97149476217aabe697c`
- Initial 90-day term; 30-day periods anchored to the signed contract effective
  instant (`2026-09-02T00:00:00.000Z`). The immutable binding writer requires
  that exact instant, so a later administrative record cannot shift the term or
  the marginal-rate reset.
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
canonical partner state to have been active at the money-event instant, rejects
missing, ended, malformed, or overlapping bindings, loads the exact catalog
version, recomputes the canonical SHA-256 definition hash, and fails closed if
the binding's pinned hash differs. Binding creation and termination are
append-only lifecycle operations with advisory-lock serialization, database-
verified operation fingerprints, and exact replay/conflict semantics.

There is deliberately no client input for program, rate, schedule version,
hold, payout, sponsor, or override. Partner and order/money identity are not
recreated by this lane.

The ledger command surface is similarly identifier-only:
`accrue({ orderId })` and `reverse({ orderId, adjustmentSettlementRef })`.
An injected `CanonicalCommissionFactSource` must load partner identity,
committed settlement/refund facts, accepted-relationship evidence,
first-eligible-transaction time, active-management status, pricing authority,
and the classified revenue waterfall from server authorities. None of those
facts is accepted in a ledger command. This slice supplies a durable Supabase
ledger/binding/state repository, but intentionally supplies no canonical fact-
source adapter or route. Composition therefore remains blocked until an adapter
over the canonical order, settlement, attribution, partner-lifecycle, pricing,
and customer-relationship stores is reviewed.

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
  schedule snapshot; catalog changes cannot rewrite old economics. A canonical
  allocation record must bind to the SHA-256 of the original revenue snapshot,
  allocate the entire adjustment across unique cash-component kinds, and name
  the exact eligible-product basis reduction. Tax, shipping, Care, or another
  excluded component never reduces eligible basis merely because it was
  refunded. A later refund remains able to claw back the original period after
  the earning period, 90-day term, or binding has ended.
- Revenue follows an exact collected-cash waterfall: gross eligible product
  value minus pre-collection discounts/credits/complimentary value equals
  eligible product cash, and eligible cash plus collected exclusions equals the
  committed settlement amount. Components must be positive safe-integer cents,
  unique by kind, and exactly reconciled; nothing is silently clamped and no
  pre-collection adjustment is deducted from settled cash twice.
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

All money writes go through one `SECURITY DEFINER` transaction. It takes
idempotency, period, and partner-binding advisory locks; compares the expected
period revision; revalidates the immutable binding and exact schedule JSON;
enforces partner state at accrual occurrence and the 12-month Seth attribution
boundary; recomputes the exact flat or marginal before/after commission from
the database schedule; validates the cash waterfall or reversal allocation;
and appends the canonical ledger and period event together. State transitions
and binding lifecycle writes have separate locked RPCs. There is no in-memory
fallback in the Supabase adapter: absent candidate SQL or malformed PostgREST
snapshots fail closed.

The five new tables grant `service_role` only `SELECT`; writes are possible only
through the reviewed RPCs. `anon` and `authenticated` receive no table or
function access. The shared canonical ledger retains only the pre-existing
server need for `SELECT` and legacy `INSERT`; direct program-row inserts are
rejected by a guard trigger. `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and
`TRIGGER` are denied, row mutation is rejected by append-only triggers, and the
postcheck verifies exact privileges, forced RLS, enabled trigger/function
bindings, security-definer/search-path posture, and full schedule definitions.

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
The executor must be the canonical commission-ledger owner so the guarded
security-definer writer and existing append-only authority share one trusted
ownership boundary; the precheck and postcheck verify that invariant.
The sibling postcheck must say `APPLIED_OK` afterward. As required by the sprint,
neither was run against production here. This schema remains candidate-only and
unmounted; the implemented repository cannot activate or persist without it.

## Verification

Local gates on 2026-09-21:

- `npx -y node@20.19.0 node_modules/vitest/vitest.mjs run shared/research/commission-schedules/calculation.test.ts server/research/partners/commission-schedules/authority.test.ts server/research/partners/commission-schedules/ledger.test.ts server/research/partners/commission-schedules/supabase-repository.test.ts`
  — 4 files passed, 34 tests passed.
- `npx -y node@20.19.0 node_modules/typescript/bin/tsc --noEmit --pretty false`
  — passed.
- `node server/research/partners/commission-schedules/sql-rehearsal.mjs $env:TEMP\codex-commission-pglite-0.5.8\node_modules\@electric-sql\pglite`
  — PASS, 23 checks on pinned `@electric-sql/pglite@0.5.8` / PostgreSQL
  18.3 WASM. It proved `APPLY_READY`, first apply + exact `APPLIED_OK`, replay
  apply + `APPLIED_OK`, Seth boundary math, exact-definition drift refusal,
  database rejection of missing evidence and arbitrary commission deltas,
  partner-state and 12-month attribution enforcement, immutable lifecycle and
  state writes, exact reversal allocation/hash binding, a valid late reversal
  after period/term/binding end, append-only refusal, and service-role direct
  program insert/`TRUNCATE` denial. Scope was a new in-memory engine with no
  socket, credentials, or production mutation.

Boundaries covered include marginal threshold splitting and reset, flat 20%,
partial, tax-only, late, and racing refunds/chargebacks, exact replay and
conflicting replay, inactive/quality-review/suspended/terminated partners,
Care-only denial, exact mixed-Care allocation, exclusive 30/14/90-day and
12-month boundaries, Seth's contract-effective anchor and 25% tail, pinned-hash
mismatch, unknown runtime programs, ambiguous/ended binding rejection,
paid-state evidence, malformed PostgREST snapshot refusal, and historical
snapshot preservation.

## Remaining production gates

Application remains blocked, intentionally, on current founder authorization,
accepted migration-DAG placement, live read-only precheck, exact-SHA release
authority, reviewed rollback, canonical fact-source/application wiring, and
post-apply smoke. Those gates are outside this implementation slice and no
production mutation was attempted.

Docker Desktop itself did not answer a bounded engine probe, but the accepted
local PGlite runtime supplied a real disposable PostgreSQL/WASM execution path.
Managed-Supabase parity, a true multi-connection concurrency rehearsal, and live
pre/post checks remain pre-activation gates and are not implied by the local
single-engine rehearsal.
