# [FABLE-DURABLE-PERSISTENCE HANDOFF]

base_sha: 5ed785e8f5c89a13042075d41ddf3751ca02d366 (claude/f5-ea-final-integration, frozen QA candidate, not edited; 9dd38c9 merged in afterwards)
head_sha: 61e0eae plus this handoff-document commit on top (the pushed branch tip is authoritative)
branch: claude/f5-ea-durable-persistence
code_commits: 8739b43 (implementation) -> be8fc3a (governance 50-52) -> 4da9615 (index.ts returned to the frozen seam) -> 8b031cd (merge 9dd38c9) -> a2698a5 (migration 53 + reservation adapter) -> 61e0eae (governance 53)

Integration note (2026-08-04): the integration head moved to 29b5345 (the pure
`commerce/reservation.ts` module) and then 9dd38c9 (the reservation store port
+ the `consumed` register option, answering this lane's seam requests). This
branch MERGED 9dd38c9 (no history rewrite, pinned checksums intact) and ships
the durable reservation adapter as migration 53. QA blockers R1 and R2 from
the FABLE-QA exact-SHA verdict on 5ed785e are discharged by this branch; R3
(composition) is deliberately left to the integration lane, and the one-line
hookup is documented below.

## migrations

| file | sha256 |
|---|---|
| supabase/migrations/20260804120000_research_early_access_identity_persistence.sql | 3ac2f40f9627d8952db3a181a2ae0174565bda1fe469e3bfc5661a02108c5e28 |
| supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql | 8a84bd82845e726702cdc001bdfce661ced7f74132c68a1338d5a476bd9ec9c6 |
| supabase/migrations/20260804122000_research_early_access_supplier_operations.sql | fa12c45348c25826f63a5ad0a001a34ecfb847ef6e97a9470ff9fc96b1fd134c |
| supabase/migrations/20260804123000_research_early_access_reservation_holds.sql | 3085cfe06fc2340c75e28a4f30491a2dae48773bc94572b763113933cd2df590 |
| supabase/migrations/20260804130000_research_early_access_unit_holds.sql | cea8f8bcde4d31a4a2d77a7b2b11ed831aadd46eb38600f820f17a9c84ffede2 |

Governance: managed-ledger rows 50-52 in supabase/MIGRATIONS.md; three DAG
nodes in docs/coordination/MIGRATION_DAG.json pinned to reviewed source
8739b43 (validator green: 13 nodes, canonical checksums verified); rollback
procedure supabase/production/research-early-access-persistence-rollback-notes.md
(strategy: retain-and-disable, forward repair; additive-only drops permitted
solely while no production data has ever been written). NOT applied to
production; managedMigrationId PENDING; PRODUCTION_DB_STATE_UNVERIFIED stands.

## durable coverage (all RPC-only SECURITY DEFINER, RLS forced, zero policies, zero table grants; append-only triggers on facts and money)

- durable_customers: YES — research_early_access_customers (unique normalized email, status vocabulary, canonical jsonb record) + SupabaseEarlyAccessCustomerRepository
- durable_sessions: YES — the accepted session spine (ledger row 48 SQL) + the EXISTING SupabasePrivateAccessSessionRepository, now constructed by the composition root when RESEARCH_EARLY_ACCESS_OWNER_ID is set
- durable_session_bindings: YES — research_early_access_session_bindings (bind-once by primary key) + SupabaseSessionBindingStore
- durable_consumed_tokens: YES — research_early_access_consumed_tokens (single-use by primary key) + SupabaseConsumedTokenStore (see seam request 1: no mount exists yet)
- durable_releases: YES — research_early_access_releases (append-only) + SupabaseEarlyAccessReleaseLedger (domain validator runs BEFORE the database; duplicate id refused under concurrency)
- durable_supplier_confirmations: YES — research_early_access_supplier_confirmations = SUPPLIER_CONFIRMED_ON_DEMAND: supplier org, contact, exact SKU/variant, strength, presentation, max quantity, fulfillment location + method, 72-hour handoff target, shipping requirements, cold-chain state, documentation state, confirmed timestamp, expiration, named confirmed-by, evidence, in-transaction audit event; SupabaseEarlyAccessSupplierDirectory answers only from active unexpired rows. Migration 54 completes the b5402c3 SupplierConfirmationStore PORT over the same table (truthful byId, caller-stamped withdraw with record sync, forward repair of the operator withdraw) via SupabaseSupplierConfirmationStore / buildEarlyAccessSupplierConfirmationStore, which also satisfies the declared-facts SupplierConfirmationLiveReader structurally.
- durable_unit_holds: YES (QA R4's durable half) — migration 54's research_early_access_unit_holds: named-human prohibitions (REGULATORY_HOLD, RECALL, STOP_SHIP, SUPPLIER_QUALITY_HOLD) per exact unit, withdrawal as a recorded state change, deletion blocked by trigger for every role; SupabaseUnitHoldRegistry implements UnitHoldReader (canonical blocker order) + record/withdraw, composed via buildEarlyAccessUnitHoldRegistry; refusing variants exist for both new stores
- durable_reservations: YES, both layers — (a) research_early_access_reservations, written INSIDE commit_placement BEFORE the invoice; optional TTL via RESEARCH_EARLY_ACCESS_RESERVATION_TTL_MINUTES; expiry after money submitted raises exactly one research_early_access_admin_exceptions row (no auto-fulfill, no silent refund; resolve requires a named human); and (b) migration 53's research_early_access_reservation_holds + research_early_access_reservation_expiry_exceptions implementing the 9dd38c9 EarlyAccessReservationStore port via SupabaseEarlyAccessReservationStore (insert idempotent by unique constraint, one reservation per order draft by unique constraint, pure-module transitions only, clock-derived validity, APPEND-ONLY expiry exceptions), composed via buildEarlyAccessReservationStore.
- durable_orders: YES — research_early_access_placements (unique idempotency key, unique order number, payment-state vocabulary, canonical jsonb)
- durable_order_lines: YES — research_early_access_order_lines, immutable (append-only trigger), line_total = quantity x unit_price as a table constraint
- durable_money_snapshots: YES — research_early_access_money_snapshots, immutable, payable = subtotal - discount + shipping + tax as a table constraint
- durable_invoices: YES — research_early_access_invoices (unique invoice number, unique order, UNIQUE payment_reference); commit refuses an invoice whose money disagrees with the order snapshot
- durable_payment_references: YES — the unique payment_reference column above (derived XEAPAY form persists verbatim)
- durable_manual_payment_submissions + durable_proof: YES — research_early_access_payment_proofs (unique proof id, unique (order, sequence) chain) + research_early_access_proof_objects (private-object reservations: JPG/PNG/WEBP/PDF only, 25 MiB cap, sha256 shape, enforced in BOTH the adapter and table constraints) + private bucket research-ea-payment-proofs-production (no policies, not public, no public URL possible); SupabaseEarlyAccessProofStorage derives the SAME opaque handle as the synthetic default; short-lived signed preview (bounded 600 s) via an injected signer, admin-side only
- durable_verification: YES — research_early_access_verifications, written only inside commit_settlement
- durable_payment_transactions: YES — research_early_access_ledger_entries, append-only money ledger, GLOBALLY UNIQUE external_transaction_id (one arrival of money pays one order)
- durable_receipts: YES — research_early_access_receipts (unique receipt id, unique order)
- durable_supplier_orders: YES — research_early_access_supplier_orders (unique release id, unique order, packet + record jsonb)
- durable_supplier_events + durable_tracking: YES — research_early_access_dispatch_events and research_early_access_tracking (sequence-gapless per order, primary-keyed) + research_early_access_fulfillments (one forever)
- durable_attribution: YES — attribution frozen on the placement record + research_early_access_referral_grants (server-side, revocable, self-referral refused by constraint) + SupabaseEarlyAccessReferralResolver
- durable_commissions: YES — research_early_access_commission_events (hold state vocabulary, append-only, unique per order), written inside commit_settlement. KNOWN UPSTREAM GAP (QA blocker 5, route-side, out of this lane): the confirm route persists only the hold, never the accrual.
- durable_refunds: PARTIAL BY DESIGN — no refund flow exists in the 5ed785e domain (QA blocker 4, route/domain-side); what this lane provides is research_early_access_manual_actions, the append-only deterministic-id ledger where refund_transmission (and supplier_communication, affiliate_payout, and the rest of the manual-action vocabulary) are durably recorded.
- durable_outbox: YES — research_early_access_outbox (kind vocabulary, delivered_at ready for a future drainer)
- durable_audit: YES — research_early_access_audit_events, append-only, named-actor constraint + SupabaseEarlyAccessAuditSink
- durable_agreements: YES — research_early_access_agreement_acceptances + SupabaseEarlyAccessAgreementGate; the required (kind, version) list is explicit deployment policy (RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS); unset or malformed = the gate stays fail-closed exactly like the placeholder it replaces
- durable_shipping: YES — research_early_access_shipping_regions allowlist + SupabaseEarlyAccessShippingPolicy (empty table serves nowhere)
- durable_idempotency: YES, constraint-based per the house style — placement idempotency key, verification key inside the settlement, proof chain sequence, deterministic manual-action and settlement-derived ids, all enforced as database unique constraints, never app locks

## production_memory_fallback_blocked: YES, twice over

`buildEarlyAccessPersistence` (server/research/early-access/persistence/production-deps.ts):
- test: in-memory (tests call the register function directly; the builder is not involved)
- local development without Supabase: in-memory with an explicit logged warning
- any deployment with Supabase configured: the durable repositories
- production-like (NODE_ENV=production OR any production capability flag) with
  RESEARCH_EARLY_ACCESS_ENABLED=true and missing durable configuration:
  REFUSED — the options carry REFUSING stores (hold nothing, throw a
  named-operation error on every call) and deliberately NO session repository,
  so the existing decideEarlyAccessAdapter independently forces the gate
  closed. There is no code path from "production wants to sell" to a Map.
Proven by server/research/early-access/persistence/production-deps.test.ts
(the full decision matrix) and the refusing-store suite.

## atomic payment verification

research_early_access_commit_settlement = ONE transaction, placement row lock
(select ... for update), creating exactly once: settlement + verification +
receipt + append-only ledger entry (unique external transaction id) + supplier
order + outbox + commission hold (when attributed) + placement state
payment_verified. Replay returns the FIRST settlement to every caller
(original verifier preserved); a reused external reference refuses with
transaction_id_used; receipt/ledger amounts and currency are cross-checked
against the immutable money snapshot and RAISE on disagreement (integrity
fault, never a wrong commit). Proven under real concurrency in the pg suite.

## verification evidence

- pg16: PASS — scripts/verify-early-access-commerce-migration.sh 16 (2026-08-04, five-migration chain): apply twice with ON_ERROR_STOP, data written between applies survives, 18/18 behavioral tests through the real adapters
- pg17: PASS — same script, same result (the verifier's readiness wait now requires a real query twice, so it can never race initdb's throwaway server)
- apply_twice: PASS on both majors (script + the pg suite each apply the chain twice)
- rollback: retain-and-disable documented + additive-only compensating drops while pre-production (see rollback notes); append-only money tables are never deleted as rollback
- restart-survival: explicit pg test — a second independent connection pool reads the placement, settlement, and fulfillment
- tests: full suite 6817 passed, 22 skipped, 3 failed, all three environmental or baseline (below); offline persistence suite 79/79; migration DAG validator green (14 nodes, canonical checksums)
- typecheck: PASS (tsc clean; check:release-control-plane strict pass clean)
- build: PASS (dist/index.cjs 1.1mb)

Pre-existing failures at the UNTOUCHED baseline 5ed785e on this machine, not
regressions of this branch:
1. Gateway.catalog-guard.test.tsx: the public /research Gateway carries
   link-gateway-early-access, absent from the known-good CTA allowlist
   (possible policy conflict with the 2026-07-30 home/landing directive;
   flagged, deliberately not resolved in this lane).
2. release-control-plane "accepts the internally consistent checked-in
   production snapshot": exceeds its own 15 s machine-dependent timeout here
   (the test's comment acknowledges this); passes when the machine is quiet,
   assertion intact.
3. release-control-plane "hashes canonical raw Git blobs and rejects
   newline-normalized bytes": trips its explicit 6 s timeout ONLY under
   full-suite parallelism while other sessions' review containers load this
   machine; passes in isolation in 1.1 s at the same commit.
4. INHERITED FROM THE INTEGRATION HEAD (not this lane's code):
   shared/research/pricing.test.ts:60 "stays identical to the cart purchase
   audiences and never gains compare_at" — upstream commit 134704a added
   "private_early_access" to CART_PURCHASE_AUDIENCES without extending
   CUSTOMER_PRICE_AUDIENCES in shared/research/pricing.ts, so the two
   constants disagree. Fails identically on b5402c3 itself. Suggested owner:
   the integration lane (shared pricing is not this lane's surface).
   Latest full gate on this branch: 6909 passed, 24 skipped, 2 failed
   (this inherited one plus the Gateway baseline item; both control-plane
   suites fully green including the timeout-flaky tests on a quiet run).

## shared_seam_requests (for FABLE-RM-INTEGRATION)

1. Composition (QA R3): spread `buildEarlyAccessPersistence().options` into
   `registerPrivateEarlyAccessApi` in server/index.ts and log the build's
   `warnings` / `reason`. This branch built and tested the hookup, then
   returned server/index.ts to the frozen seam because the file is
   seam-controlled and owned by the integration lane.
2. ANSWERED at 9dd38c9 and consumed here: register.ts carries the `consumed`
   option, and buildEarlyAccessPersistence now passes the durable
   SupabaseConsumedTokenStore (refusing variant in refused mode). The door
   MOUNT is still future work (QA blocker 7): until a redemption route exists,
   session bindings are never written in production.
3. ANSWERED at 9dd38c9 and consumed here: the EarlyAccessReservationStore port
   is implemented durably by migration 53 + SupabaseEarlyAccessReservationStore
   (buildEarlyAccessReservationStore for composition; register has no
   reservation option yet, so the integration lane composes it where the
   reservation routes mount).
4. MIGRATIONS.md rows 50-53, MIGRATION_DAG.json nodes, and the
   release-control-plane allowlist extension live on this branch because the
   census suite hard-fails unledgered migration files; supersede at merge if
   the integration lane wants to own them.

## remaining_placeholders

- Agreement gate defaults to fail-closed until RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS states the required list (deployment policy, deliberately not invented here).
- Admin directory: unchanged (ConfiguredEarlyAccessAdminDirectory over ADMIN_EMAIL, the one reviewed non-fail-closed default).
- Commission ACCRUAL persistence and any refund FLOW are route/domain work (QA blockers 4-6), out of this lane's charter.
- The outbox has no drainer (unchanged from baseline; delivered_at column is ready).

RESEARCH_EARLY_ACCESS_ENABLED stays false. No production secret was touched or
rotated; rotation belongs immediately before final deployment per the operator
instruction.
