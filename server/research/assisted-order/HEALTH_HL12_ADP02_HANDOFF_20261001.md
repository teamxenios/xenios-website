# HL-12 ADP02 provider create ownership and recovery

Status: implementation in progress, not a qualified runtime or release.

## Continuity and scope

- Same branch: `codex/xenios-health-launch-implementation-20260930`.
- Frozen predecessor runtime: `e9f221c974f45831a7ad1a13bcb2bd6d8198db42`.
- Predecessor tree: `30e570b77d19de0ebdb8b40765334a8f98cea5e0`.
- Predecessor handoff: `77cdeaec34ae19bbcc9615f75887d21fe86f0746`.
- Active task: `HEALTH-HL12-ADP02-PROVIDER-CREATE-RECOVERY-20261001`.
- New migration: `supabase/migrations/20261001102904_research_assisted_order_quote_provider_execution.sql`.
- Existing ADP01 migration, tests and qualification records remain unchanged.

This successor implements provider-independent preparation and readback only.
It does not authorize settlement, payment verification, paid status, capture,
void, refund, fulfillment, historical-paid adoption, or removal of uncertainty.
There is no selected processor, operational source, policy or execution grant.
The mounted application supplies `source: null` unconditionally, including when
the feature flag is true. No webhook is mounted by this slice.

## Contract

An authenticated admin command names an existing held provider attempt and has
an empty body. The server, not the browser, supplies actor and source identity.
The database independently derives the accepted quote, exact amount/currency,
acceptance and request identity. A separately configured execution grant and
explicit replay policy are required in addition to the earlier reservation.

Durable create ownership precedes the transport call. A short committed claim
owns one dispatch; no database transaction remains open over a network call.
The first claim fixes the create key and replay deadline. Later retry claims
cannot extend that deadline or change the body. Existing bound provider objects
are retrieved, not created again. A repeated claim receipt is not new permission
to dispatch. Concurrent callers without ownership wait.

The adapter boundary requires independently returned provider object fields,
including provider/account/mode, quote/order metadata, exact amount/currency and
external identities. Echoing the create request is not evidence. The core
contains no processor SDK, credentials, provider defaults or live configuration.
An actual provider adapter and independently verified operational policy remain
unimplemented and unqualified.

Normalized allowlisted results are retained immutably, including unknown and
conflicting observations. Raw responses, signatures, client secrets and tokens
are neither persisted nor returned. Provider payment and optional session
identities are write-once and scoped to the existing unique source/account/mode.
A later observation may establish a previously absent optional session identity,
but cannot replace a non-null one. No result makes an order paid.

Timeout, interrupted persistence and response loss do not mean no funds.
Recovery uses the same key and body only within an explicitly granted replay
guarantee; otherwise the attempt remains held for reconciliation. Late responses
to an issued claim are retainable even after lease or grant revocation. This
does not authorize a new dispatch after revocation. The committed claim is the
authorization linearization point; revocation cannot atomically recall an
external call already authorized by that claim.

Bound-object retrieval may proceed despite an existing journal or global hold
after the active lease ends. This narrow readback exception cannot create a
second object, replace a binding, settle money or clear the hold. A configured
source/policy/actor and exact accepted quote are still required.

## Database boundary

The additive migration requires the exact final ADP01 v2 installation, not just
a matching version label or a self-consistent different predecessor. It keeps
the journal v2 held capability contract and adds execution v1 with actual
READ COMMITTED required. Stronger/stale snapshots are refused rather than
silently downgraded. The schema-definition seal is drift detection, not an
arbitrary database-owner defense or proof that provider facts are authentic.

Five private forced-RLS tables hold policy, execution grants, claims, results
and identity bindings. Only the exact service-role RPC surface is permitted;
direct client table writes and internal-helper calls remain denied. Triggers
derive claims/results, enforce immutability, and remain enabled in replica mode.
Financial decisions and existing uncertainty fences are not weakened.

Only disposable local PostgreSQL testing is authorized. No migration has been
applied to managed staging or production. Managed roles, effective functions,
PostgREST isolation, ledger history, audit/outbox dependencies and rollback must
be independently qualified under new exact scoped authority.

Rollback means disabling new ingress/execution while preserving all claims,
results, journal entries, bindings and financial holds, then reviewed roll-forward.
Do not delete external-effect evidence, replay old financial function bodies,
or downgrade the active schema to make a hold disappear.

## Evidence accounting

All current ADP02 runs are work-in-progress diagnostics. Final exact source,
test, release-control and records SHAs and final commands/results will be added
only after the implementation is frozen and locally qualified.

The predecessor aggregate remains a separate run: 18,998 passed, one failed,
85 skipped, exit 1, no timeouts. Its sole failure is the unamended protected
Research gateway seam assertion. It is not a passing aggregate and does not
qualify ADP02 changes. Existing owner approval for two older baseline amendments
does not approve current or future bytes. The protection manifest is unchanged.

Early diagnostics retained separately:

- `adp02-http-initial`: 50 passed in two files, exit 0. Mounted protocol tests
  include synthetic admission; this is not live Supabase JWT qualification.
- `adp02-execution-unit-run1`: 97 passed in one file, exit 0. Mocked source/RPC
  unit checks are not actual provider or database proof.
- `adp02-install-smoke1`: first install, repeat install and both capability
  readers passed on disposable no-network PostgreSQL 17.11; cleanup confirmed.
  This tested earlier migration bytes, before a subsequently identified missing
  session-identity comparison against earlier journal observations. A passing
  installation smoke did not demonstrate that semantic case.

The authoritative local runtime is the private official Windows x64 Node
`v20.19.0`, npm `10.8.2`; archive SHA-256
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Commands invoke the binary by full path and change PATH only for child processes.
Wrapper receipts preserve command, dataset, start/end revision, dirty state,
exit status, elapsed time and log hash. Child-runtime samples do not constitute
continuous ancestry attestation; intermediates such as `cmd.exe` can hide
grandchildren from Node-only CIM sampling. Missing observations remain missing.

## Open work and release holds

The selected payment/evidence provider and real authorized grant procedure remain
external dependencies. Provider-specific authenticated event ingestion and
settlement, governed void/refund, historical reconciliation, managed qualification,
independent successor review and the separate protection amendment remain open.
Do not infer that a processor decision blocks this provider-neutral engineering.

The current 424-canonical / 423-customer catalog reconciliation and genuine
holds remain intact. Care prices remain withheld in the Research projection,
not removed from Product Control. Product/public/account/admin/supplier journeys
remain queued after payment correctness. No replacement prices, discounts,
commissions, partnerships or credentials are invented.

The imagery and media-decoupling lanes remain separate. Batch 0 has 25 generated
non-public candidates, zero approved/public/integrated assets. No re-render or
integration is authorized merely by the stale earlier zero-render checkpoint.
Independent Claude review remains separate; no ADP02 acceptance is claimed.

Deployment status: not deployed. No hosted configuration, account grant, price
release, real email, money, procurement or clinical action was performed.
