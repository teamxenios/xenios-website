# Supabase migration ledger

The xenios research schema is applied through the approved Supabase production
path in dependency order. For PENDING rows, `docs/coordination/MIGRATION_DAG.json`
dependencies override numeric append order. Row 47 was applied and verified
ahead of still-pending row 42 because row 42 declares it as a prerequisite. The
Order column records append-only ledger history; it does not authorize or
reorder pending application. This ledger is the source of truth for what has
been run. Migration-specific apply-twice evidence is not blanket authority to
re-run a migration after later operational state changes. Update this table in
the same PR that adds or changes a migration file.

| Order | File | Purpose | Status | Run date | Verified |
|---|---|---|---|---|---|
| 1 | schema.sql | Main site: waitlist, LOI, bookings, notes, gallery | RUN | pre-2026-07-17 | live site |
| 2 | research-membership.sql | Applications + event audit (12-status state machine) | RUN | 2026-07-18 | live admin queue |
| 3 | research-notification-outbox.sql | Durable email outbox, attempts, exports (disabled), admin prefs | RUN | 2026-07-18 | verify-research-schema.sql |
| 4 | research-members.sql | Member accounts bound to applications | RUN | 2026-07-18 | verify-research-schema.sql |
| 5 | research-referrals.sql | Programs, identities, attributions, rewards, credit ledger | RUN | 2026-07-18 | verify-research-schema.sql |
| 6 | research-referrals-seed.sql | Seed program member-give10-get15 (1500/1000 cents) | RUN | 2026-07-18 | verify-research-schema.sql (seed row) |
| 7 | research-consent-covenant.sql | Consent events + covenant acceptances | RUN | 2026-07-18 | verify-research-schema.sql |
| 8 | research-referral-fraud.sql | Fraud queue, referral event audit, applicant_ip, uniqueness indexes, durable rate-limit table + function | RUN | 2026-07-18 | verify-referral-fraud.sql |
| 9 | research-member-billing.sql | Member statuses past_due/cancelled + separate billing_state column | RUN (presence verified) | by 2026-07-25 | production schema check |
| 10 | research-agreements.sql | Append-only versioned agreement acceptances (hashed request metadata) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 11 | research-member-profile.sql | Member profile sections, one row per member and section | RUN (presence verified) | by 2026-07-25 | production schema check |
| 12 | research-assessment.sql | Assessment responses (answers jsonb, deadline and reminder tracking) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 13 | research-blueprint.sql | Blueprints: versioned, state machine, review and supersede pointers | RUN (presence verified) | by 2026-07-25 | production schema check |
| 14 | research-plans.sql | Xenios 30, Xenios 90, and the one-per-month plan change requests | RUN (presence verified) | by 2026-07-25 | production schema check |
| 15 | research-documents.sql | Plan documents: versions, checksums, archive pointers, acknowledgment | RUN (presence verified) | by 2026-07-25 | production schema check |
| 16 | research-tracker.sql | Tracker observations across the six metric domains | RUN (presence verified) | by 2026-07-25 | production schema check |
| 17 | research-media.sql | Private media records, retention elections, access audit log | RUN (presence verified) | by 2026-07-25 | production schema check |
| 18 | research-questions.sql | Member questions and Telegram link tokens (hash only) | RUN (presence verified) | by 2026-07-25 | production schema check |
| 19 | research-sla-events.sql | SLA escalation ledger; the unique key is the idempotency guarantee | RUN (presence verified) | by 2026-07-25 | production schema check |
| 20 | research-catalog.sql | Products, provenanced supplier facts, goal + guide links, prohibited claims, open supplier questions, supplement candidates | RUN | 2026-07-25 | managed migration `release_train_1_research_catalog`; production schema/RLS/count verification |
| 21 | research-inventory-lots.sql | Lots, per-lot quality documents, excursions, FEFO allocations, lot-to-order shipment traceability | RUN | 2026-07-25 | managed migration `release_train_1_research_inventory_lots`; production schema/RLS/count verification |
| 22 | research-orders.sql | Carts, orders, order lines, state events, webhook replay events, claims, durable refund keys | PENDING (not run) | — | commerce lane |
| 23 | research-subscriptions.sql | Product subscriptions (30/60/90) + append-only subscription events | PENDING (not run) | — | commerce lane |
| 24 | research-fulfillment.sql | Split fulfillment orders, shipments, shipping quotes with provenance, shipping profiles | PENDING (not run) | — | commerce lane |
| 25 | research-partners.sql | Partners, agreements, training, lifecycle, links, attribution, conversions, organizations, events, content assets, violations | PENDING (not run) | — | commerce lane |
| 26 | research-commission-ledger.sql | Append-only commission + store-credit ledgers (UPDATE/DELETE blocked by trigger), payout batches and attempts | PENDING (not run) | — | commerce lane |
| 27 | research-product-requests.sql | Private member product requests, demand candidates, private attachments, append-only events, and atomic request/status functions | RUN | 2026-07-25 | Supabase migration + production schema checks |
| 28 | research-product-requests-hardening.sql | Remove Supabase default direct table grants from anonymous and authenticated browser roles | RUN | 2026-07-25 | zero browser-role table grants |
| 29 | research-product-requests-function-hardening.sql | Remove default browser-role execution from the append-only event trigger helper | RUN | 2026-07-25 | zero browser-role Product Request function grants |
| 30 | research-security-definer-grants-hardening.sql | Remove unnecessary PUBLIC/anon/authenticated execution from the internal RLS event-trigger helper | RUN | 2026-07-25 | managed migration `20260725231517`; advisor + explicit privilege check |
| 31 | research-products-diagnostics.sql | Extend canonical lots/quality documents; persist supplement placeholders, metabolic pathways/interests, Superpower configuration, biomarker uploads/records, product content, private buckets, and append-only certificate access audit | RUN | 2026-07-25 | managed migration `release_train_1_research_products_diagnostics`; forced-RLS/browser-grant/private-bucket/RPC/count verification |
| 32 | research-prelaunch-foundation.sql | Canonical private roles, seed-origin namespaces, provider modes, access audit, and external-action capture | RUN | 2026-07-25 | managed migration `canonical_prelaunch_foundation`; 5/5 forced RLS, zero browser grants, zero roles/namespaces/audits/captures |
| 33 | research-required-input-readiness.sql | Canonical required-input register, append-only review audit, readiness manifests, and server launch switches | RUN | 2026-07-26 | managed migration `20260726045307 canonical_required_input_readiness`; forced-RLS/browser-grant/zero-row verification |
| 34 | care-access-foundation.sql | Disabled-by-default Care capability, Care-only roles, and metadata-only access audit | RUN | 2026-07-26 | managed migration `20260726064113 care_access_foundation`; one disabled capability, 3/3 forced RLS, zero browser mutation grants, zero role/audit rows |
| 35 | care-eligibility-intake.sql | Care location, eligibility, consent, privacy, waitlist, and versioned intake foundation | RUN | 2026-07-26 | managed migration `20260726080248 care_eligibility_intake`; 13/13 PR2 tables forced RLS, zero browser grants/rows, Care disabled |
| 36 | care-appointments-clinician.sql | Provider-neutral appointments, exact clinician readiness, reminders, check-in, and human review | RUN | 2026-07-26 | managed migration `20260726093600 care_appointments_clinician`; 12/12 PR3 tables forced RLS, zero browser grants/rows, Care disabled |
| 37 | care-prescription-pharmacy.sql | Human-clinician prescription and verified pharmacy/order lifecycle foundation | RUN | 2026-07-26 | managed migration `20260726112848 care_prescription_pharmacy`; 10/10 PR4 tables forced RLS, zero browser grants/rows, Care disabled |
| 38 | migrations/20260726143000_research_product_control_center.sql | Product, variant, effective-dated price, private media, immutable audit, and exact readiness administration | RUN | 2026-07-26 | managed migration `20260726214102 research_product_control_center`; post-apply verification found Supabase pre-existing/default `TRUNCATE`, `REFERENCES`, and `TRIGGER` grants requiring migration 39 before application deployment |
| 39 | migrations/20260726214500_research_product_control_center_privilege_hardening.sql | Converge Product Control service-role grants to the reviewed exact 33-privilege boundary | RUN | 2026-07-26 | managed migration `20260726215603 research_product_control_center_privilege_hardening`; 33 service table privileges, five command tables SELECT-only, zero command DML, zero excess `TRUNCATE`/`REFERENCES`/`TRIGGER`, 11 service RPC grants, zero Product Control rows |
| 40 | migrations/20260727120000_research_inventory_lot_coa_admin.sql | Versioned inventory lots, append-only movements, exact-lot private COAs, immutable quality/access audit, and atomic Product Control projection | RUN | 2026-07-27 | managed migration `20260727120000 research_inventory_lot_coa_admin`; Website 6 post-deploy accepted exact production schema/RLS/grants/bucket/zero-row and browser/API gates |
| 41 | migrations/20260727160000_research_inventory_reservation_commands.sql | Atomic server-only inventory reserve/release/finalize/expire commands, independently additive canonical reservation tables, exact readiness serialization, immutable redacted receipts, and checkout-disabled composition port | RUN | 2026-07-27 | authenticated managed migration `20260727160000 research_inventory_reservation_commands`; repository source identity is SHA-256 `4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005`; provider SQL-byte equality is not claimed |
| 42 | migrations/20260727200000_research_persistent_cart.sql | Authenticated-member and opaque-anonymous persistent-cart commands with exact Product Control price/readiness/inventory lineage, optimistic versions, expiry, idempotency, one-way claim, immutable audit, and no inventory mutation | PENDING (not run) | — | raw Git-blob SHA-256 `6d1379db45939bdb27f6ea1b32c50e3137a3d0c3cbdbe21cd9a145e2d771d880`; accepted disposable PostgreSQL 16 apply-twice/security/concurrency/rollback proof; requires migration 41 |
| 43 | migrations/20260728010000_research_fulfillment_supplier_operations.sql | Supplier and fulfillment operations, immutable command evidence, lot/readiness binding, shipment and exception foundations | PENDING (not run) | — | raw Git-blob SHA-256 `dd8895522862383f2dcc3b2d4013a2a9d4a4ef5385efcf237980756c13b6df53`; accepted PR106 disposable PostgreSQL 16 proof; requires migration 42 |
| 44 | migrations/20260728020000_research_affiliate_professional_operations.sql | Affiliate, organization, professional, commission, statement, payout, reversal, and immutable paid-evidence foundations | PENDING (not run) | — | raw Git-blob SHA-256 `989cc6e5929d1297056c3f600898c07bab191c378107f12c8029263c9c77a722`; accepted PR106 disposable PostgreSQL 16 proof; requires migration 43; commission/payout activation remains separately blocked |
| 45 | migrations/20260729000000_research_pricing_lineage.sql | Additive order-line price provenance snapshot with coherent price identity/version/audience/amount/currency/effective-window evidence and guarded absent-table behavior | PENDING (not run) | — | raw Git-blob SHA-256 `377fe1eec2655026de94454254602a77227adfc0afa4297b8f11711dfe164666`; requires migration 44 and exact target-table preflight |
| 46 | migrations/20260729100000_research_rls_retro_hardening.sql | Retrospective forced-RLS and browser-grant hardening across the intended Research operational schemas with absent-target-safe behavior | PENDING (not run) | — | raw Git-blob SHA-256 `406c9a481dd588c56ec1cff467e091a2e154e92671e3cba30bac3b458013e87d`; requires migration 45 and exact target/privilege preflight |
| 47 | migrations/20260801120000_research_variant_strength_write_gate.sql | Freeze disputed variant identity and refuse unresolved disputed price creation or approval at the database boundary | RUN | 2026-08-02 | authenticated managed migration `20260801120000 research_variant_strength_write_gate`; canonical Git-blob SHA-256 `6cd11e07eb764d0f803db4baa308ae397c23aacb8ff5d29306c8797be60b4818`; independently accepted source `0b835c7d7fa6fb633b269cd64665a0338c7bf163`; stock PostgreSQL 16.14 and 17.10 apply/apply-twice, atomic unsafe-precondition rollback, P0/P1/P2/P3-P8/P12/P13, and full/partial/absent rollback plus reapply; production apply/post-apply evidence: issue #44 comment 5155125337, independently corroborated by comments 5156785323 and 5157073545; requires migrations 38 and 39; prerequisite to migration 42 |
| 48 | research-private-early-access-sessions.sql | Durable Private Early Access sessions: hash-only session and one-time grant-nonce tables, the four SECURITY DEFINER functions, and revocation of every browser-reachable grant | PENDING (not run) | | file SHA-256 `7365f2a6ae224d8a45e2d32ab437d07ea1e83470314e2f0ba7227f3d3e3eea38`; Git blob `0f266e8b58f994bb6989762f9ca0f0b45fcbaa3e`; verified on real PostgreSQL 16 and 17 by `scripts/verify-early-access-migration.sql` (20 checks each: grant single-use under 4-way concurrency, anon and authenticated denied on both tables and all four functions, 240-minute exact expiry); apply-twice proven safe (second apply succeeds, an existing session survives, ACLs intact). Not yet applied to production; RESEARCH_EARLY_ACCESS_ENABLED stays false. |
| 49 | research-private-early-access-session-ttl-240.sql | Forward migration for a database that already has the 15-minute session lifetime: clears rows, rewrites the exchange function and the exact-expiry constraint to 240 minutes, and refuses to commit unless the two agree | NOT REQUIRED (row 48 was never applied, so its 240-minute form applies directly) | | file SHA-256 `e362800cb0ba5920fe5b8eaa6d52ef8038a03db05af78716376a629f5280f34e`; verified on PostgreSQL 16 by upgrading a real 15-minute database and re-asserting all 20 checks including that the function rewrite preserved SECURITY DEFINER, owner, search_path, and every revocation |
| 50 | migrations/20260804120000_research_early_access_identity_persistence.sql | Durable Early Access identity: customer roster (unique normalized email), single-use consumed verification tokens, bind-once session-to-customer bindings, append-only agreement acceptances, and server-side referral grants; RLS forced, zero policies, zero table grants, SECURITY DEFINER functions granted to service_role only | PENDING (not run) | — | raw Git-blob SHA-256 `3ac2f40f9627d8952db3a181a2ae0174565bda1fe469e3bfc5661a02108c5e28`; pinned source `8739b433e5a1588a72bfed3eae649e38e416fe0f`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` (apply twice, data written between applies survives, behavioral suite through the real adapters); coexists with row 48 (session spine applied first in the verifier); RESEARCH_EARLY_ACCESS_ENABLED stays false |
| 51 | migrations/20260804121000_research_early_access_commerce_persistence.sql | Durable Early Access commerce spine: placements with immutable order lines and money snapshots (arithmetic as table constraints), reservations persisted before invoices, unique payment references, payment proofs and private proof-object reservations (private bucket, no policies), the eight-fact settlement as one row-locked exactly-once transaction (verification, receipt, append-only ledger entry with globally unique external transaction id, supplier order, outbox, commission hold), sequenced dispatch/tracking and one-fulfillment-forever, the founder release ledger, the append-only audit trail, and admin exceptions (reservation expiry after money is a human decision, never auto-fulfill or silent refund) | PENDING (not run) | — | raw Git-blob SHA-256 `8a84bd82845e726702cdc001bdfce661ced7f74132c68a1338d5a476bd9ec9c6`; pinned source `8739b433e5a1588a72bfed3eae649e38e416fe0f`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` incl. concurrent-settlement exactly-once, transaction-reference single-use across orders, money-integrity refusal, append-only enforcement, RLS denial for anon/authenticated AND direct-table denial for service_role, restart survival on a second pool; requires migration 50 |
| 52 | migrations/20260804122000_research_early_access_supplier_operations.sql | Durable Early Access supplier operations: SUPPLIER_CONFIRMED_ON_DEMAND confirmations (organization, contact, exact SKU/variant, strength, presentation, quantity ceiling, fulfillment location and method, 72-hour handoff target, shipping and cold-chain requirements, documentation state, expiry, named human, evidence, in-transaction audit), append-only manual actions (supplier communications, refund and payout transmissions), and the explicit shipping-region allowlist (empty serves nowhere) | PENDING (not run) | — | raw Git-blob SHA-256 `fa12c45348c25826f63a5ad0a001a34ecfb847ef6e97a9470ff9fc96b1fd134c`; pinned source `8739b433e5a1588a72bfed3eae649e38e416fe0f`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` incl. expiry and withdrawal behavior; requires migration 51 |
| 53 | migrations/20260804123000_research_early_access_reservation_holds.sql | Durable reservation holds behind the EarlyAccessReservationStore port (9dd38c9): idempotent insert by primary key, one reservation per order draft by unique constraint, pure-module status transitions only, clock-derived validity, and APPEND-ONLY expiry exceptions (money outlived the hold = a human decision that cannot be quieted) | PENDING (not run) | — | raw Git-blob SHA-256 `3085cfe06fc2340c75e28a4f30491a2dae48773bc94572b763113933cd2df590`; pinned source `a2698a56b1a56cb46ffe1a89220eef4da3de92dc`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` (four-migration chain, apply twice, data preservation, 16/16 behavioral tests); requires migration 52 |
| 54 | migrations/20260804130000_research_early_access_unit_holds.sql | Durable unit-hold registry (QA R4's durable half): named-human prohibitions (REGULATORY_HOLD, RECALL, STOP_SHIP, SUPPLIER_QUALITY_HOLD) on exact units, withdrawal as a recorded state change stamped with the caller's named human and instant, deletion blocked by trigger for every role; plus the supplier-confirmation store completion over the migration-52 table (truthful by-id read, port-shaped caller-stamped withdraw, forward repair of the original withdraw so the canonical record can never go stale) | PENDING (not run) | — | raw Git-blob SHA-256 `cea8f8bcde4d31a4a2d77a7b2b11ed831aadd46eb38600f820f17a9c84ffede2`; pinned source `eafb8288ca2227d79dde545dfe2499d3dadb739e`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` (five-migration chain, apply twice, data preservation, 18/18 behavioral tests); requires migration 52 (preflight-enforced); apply after 53 in chain order |
| 55 | migrations/20260804140000_research_early_access_settled_transaction_refs.sql | One read function: every external transaction reference that has ever settled an Early Access order, across all orders, from the append-only settlement ledger, so duplicate-payment classification names a reuse at review time (the commit-time unique constraint stays the authority) | PENDING (not run) | — | raw Git-blob SHA-256 `ff7179abd2991bd1f4eb2f4ae735c6109683173780dd3439ae971cb483aae20b`; pinned source `da8385371b750d99026d88d3b7ce4e1e56bd8407`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` (six-migration chain, apply twice, cross-order and restart-survival behavioral tests); requires migration 51 (preflight-enforced); apply after 54 in chain order |
| 56 | migrations/20260804150000_research_early_access_proof_bucket_privacy.sql | Converge the payment-proof bucket to PRIVATE no matter how the row came to exist (a pre-created or snapshot-restored PUBLIC bucket is flipped, not skipped) and assert the end state, failing the apply rather than reporting success over a public payment-proof bucket | PENDING (not run) | — | raw Git-blob SHA-256 `803d68913a08ecf18b0f1dcc260b4f9a426ca6b0f6a0dc092b5757f067f7da13`; pinned source `44145cb66b56340de219fa9f826d3196a4193403`; verified on stock PostgreSQL 16 and 17 by `scripts/verify-early-access-commerce-migration.sh` (seven-migration chain; the PG suite pre-seeds the bucket PUBLIC and proves the flip); requires migration 51; apply after 55 in chain order |
| 57 | migrations/20260804160000_research_early_access_strength_registry_mirror.sql | Founder-authorized mirror repair: the eight accepted identities (BPC-157 5 mg, DSIP 10 mg, GHK-Cu 50 mg, Glutathione 500 mg, Sermorelin 5 mg, Cagrilintide 10 mg, Hexarelin 10 mg, Oxytocin 5 mg) enter the founder-locked variant registry NON-DISPUTED so it mirrors the complete 78-variant catalog; migration 47 stays immutable and byte-identical; one atomic locked upsert, absent-target-safe, end-state asserted | PENDING (not run) | — | raw Git-blob SHA-256 `0391876a285023d58a6dfa8f113693140ca69e570bd61cf5069b7903dbe351b2`; pinned source `5bee236b996d839f71e148a416efeaa22c366810`; verified on stock PostgreSQL 16 and 17 with the write-gate substrate (real insert, gate-decision parity, disputes still block, existing identities unchanged) and absent-registry no-op on the bare pass; requires migration 47 (applied 2026-08-02); apply after 56 in chain order |
| 58 | migrations/20260807193000_research_early_access_cart_checkout.sql | The multi-product Early Access cart: six additive tables (quotes, checkouts, items, invoices, events, settlements) and one commit function that writes the parent, every child line and the invoice in a single transaction, so a cart is never half-placed. Alters no existing table and changes no existing function; the single-product placement path is untouched | PENDING (not run) | — | raw Git-blob SHA-256 `8bf36cedb3cfe523f77c2853a5ea259859c7d067825b846dc8602ba9dbcdbe3b`; pinned source `f718a6f6b0154d9d4afd1a5f5f65c16595a0944f`; applied twice on a disposable PostgreSQL 16 after the base production schema and every preceding migration with ON_ERROR_STOP, second pass introducing no new failure and all six tables plus the commit RPC present after both; feature ships behind RESEARCH_EARLY_ACCESS_CART_ENABLED which is false by default; requires migration 51; rollback notes at supabase/production/research-early-access-cart-checkout-rollback-notes.md |
| 59 | migrations/20260807200000_research_affiliate_access_and_portal_v2.sql | The affiliate access-code, application, attribution, commission-schedule, content and audit foundation: twenty additive tables, each either _v2 suffixed or previously nonexistent, reconciled against 20260728020000 so partners, links, attribution events, commission events and statements are untouched | PENDING (not run) | — | raw Git-blob SHA-256 `061c2c59317ef9f6e915f06a8333289225c3b16d23b34f41331aacb82710ad4a`; pinned source `f718a6f6b0154d9d4afd1a5f5f65c16595a0944f`; applied twice on a disposable PostgreSQL 16 after its research_affiliate_professional_operations dependency, second pass introducing no new failure and all twenty tables present with no collision against the six pre-existing affiliate tables; every affiliate flag ships false and the commission schedule ships as an inactive draft; requires migration 20260728020000; rollback notes at supabase/production/research-affiliate-access-and-portal-v2-rollback-notes.md |
| 60 | migrations/20260808100000_research_early_access_cart_completion.sql | The Early Access cart completion lifecycle: four additive tables (external proofs, receipts, child releases, supplier outbox) and three functions covering named-admin proof METADATA, atomic settlement, and the customer-safe status projection. Recording proof is deliberately a separate function and a separate table from settlement, so proof metadata can never mark an order paid | PENDING (not run) | — | raw Git-blob SHA-256 `5e0b745ae3d8ff0844e55ba0714fd5f2bb5f446e7523594af8bfce7e1395bf22`; pinned source `2b9d789ba705f79977a0130fc909b87aba8b6e5c`; APPLY-TWICE VERIFIED on 2026-08-07 against disposable PostgreSQL 16.14 in BOTH required shapes, Shape A with migration 54 present and Shape B production-shaped with migrations 54 and 55 absent (absence proven before the run, not assumed); each applied the 58+60 candidate pair twice at psql exit 0 and passed the same 45-assertion behavioural suite including a FORCED mid-transaction failure that left zero rows in every table; full record at supabase/production/research-early-access-cart-completion-apply-twice-evidence.md; depends on migration 58 ONLY, verified by grep rather than assumed: zero affiliate references, so the affiliate v2 migration (59) may remain pending indefinitely and Early Access does not require it despite the earlier timestamp; and no reference to migration 54's unit-hold RPC, whose absence in production Shape B exists to prove is survivable; feature ships behind RESEARCH_EARLY_ACCESS_CART_ENABLED which is false by default and additionally gated by the F4 fail-closed durable-store resolver; rollback notes at supabase/production/research-early-access-cart-completion-rollback-notes.md |
| 61 | migrations/20260809120000_research_early_access_cart_duplicate_guard.sql | One active checkout per quote, after the first real founder checkout created TWO parent orders sixty seconds apart from one quote with two idempotency keys. Adds the disposition columns, dispositions the historical duplicate XEC-063A962A0053A65324F21E7F under XEC-E1703CC63BBE89E6839E24C1 fail-closed, and only THEN creates the partial unique index, because a plain UNIQUE (quote_id) cannot create while two live rows share that quote. Teaches commit_cart_checkout to replay the existing active checkout for a quote instead of creating a second one, re-checking ownership and intent first, with the unique violation caught and converted to the same replay so concurrent confirms cannot both win. Makes a superseded checkout financially inert by trigger on all five money and release tables and freezes its payment state | PENDING (not run) | — | raw Git-blob SHA-256 `a15ed8163b618a1de56d779c8b16e1ced31621ccf07d7435a2aa4838e4f3ead2`; pinned source `4031cace41eba98f283e63b8ed3a14f555f6d79a`; applied twice on the MANAGED SUPABASE shape (pgcrypto in the extensions schema) on PostgreSQL 16 and 17, where the 45-assertion behavioural suite still passes so the invariant does not break the ordinary cart flow, a second active checkout for one quote is refused by the database, all five money and release tables plus the payment state refuse a superseded checkout, the seeded production duplicate pair is dispositioned with BOTH rows retained and exactly one audit event across two applies, and a duplicate that had already been PAID aborts the migration rather than being superseded; nothing is deleted; requires migrations 58 and 60; harness at scripts/verify-early-access-cart-managed-supabase.sh |
| 62 | migrations/20260809130000_research_early_access_hardening.sql | The Early Access hardening layer: seven additive forced-RLS tables with no direct role grants, covering legal bindings, versioned agreement packages, append-only attestations, metadata-only proof submissions, canonical transaction identities, settlement hardening facts and append-only fulfilment corrections. The exact migration 60 settlement implementation is RETAINED as a private core and one hardened nine-argument wrapper becomes the sole service_role settlement door; the old seven-argument service door is removed. Canonical transaction identity is unique across case and whitespace variants, so two spellings of one payment cannot settle two checkouts. Both named-admin confirmations are required and persisted. payment_verified_at comes from clock_timestamp() inside the settlement transaction and ship_by_at is constrained to exactly payment_verified_at + 72 hours, so a caller cannot set money time. Proof rows carry metadata only: no bytes, base64, object path or storage reference. Customer and admin submission projections are separate and the customer one denies provider and internal operational metadata. Existing settlements receive transaction-identity backfill only; no agreement, confirmation, submission or SLA fact is fabricated, and an ambiguous canonical backfill aborts atomically rather than guessing. Applied twice on the managed-Supabase shape on PostgreSQL 16 and 17; requires migrations 58, 60 and 61; harness at scripts/verify-early-access-cart-managed-supabase.sh |
| 63 | migrations/20260810120000_research_fm_document_category_expansion.sql | The legal document category widening: the founding-membership legal tables constrained `category` to sixteen values, so the four REQUIRED counsel-approved documents that map to no category (XR-LEGAL-12 Website Terms of Use, XR-LEGAL-13 Product Purchase Terms, XR-LEGAL-14 Shipping, Claims and Replacement Policy, XR-LEGAL-15 Payment Evidence Upload Consent) could hold no published version and bind no signature. A package naming one could never complete (document_not_signable); a package omitting one was refused (required_document_omitted); every stage carried at least one, so no stage scoping escaped it. This widens the single-column CHECK on `category` from 16 to the same 20 values on BOTH public.research_fm_document_versions and public.research_fm_document_signatures. The original sixteen values are preserved in order; nothing is renamed, removed or transformed. The constraint is dropped by structural discovery (any single-column check on `category`, whatever its generated name) and recreated under one canonical name, so a second apply is a no-op in effect. It refuses to run if the legal schema is absent, and refuses to replace the constraint if any existing row carries a category the widened set would not accept. It writes no row: no document version, signature, legal package, binding, attestation, customer, settlement or supplier fact, and it publishes and enables nothing | PENDING (not run) | — | applied twice on the MANAGED SUPABASE shape (pgcrypto in the extensions schema, public.digest proven absent) on PostgreSQL 16.14 and 17.10, each run first proving the pre-M63 constraint REFUSES all four new categories, then seeding historical legal rows (three document versions and one real signature bound to a published version), then applying M63 twice at psql exit 0 with the seeded rows byte-identical after both passes and the row counts unchanged; the verification suite proves all 20 categories are accepted by real inserts on BOTH tables and a 21st is refused by both, that a draft of a new category still cannot be signed, that the append-only and published-only signature triggers and the one-published-version-per-category index are intact, and that M63 fabricated no legal package, signature or binding; a bare database proves the preflight fails closed; requires the founding-membership agreements schema and the accepted M62 chain; harness at scripts/verify-m63-legal-signability.sh; rollback notes at supabase/production/research-fm-document-category-expansion-rollback-notes.md |

Founding-membership operational migrations use a separate dependency chain.
Production presence and managed migration history were reconciled on
2026-07-25:

| Order | File / managed migration | Status | Production evidence |
|---|---|---|---|
| FM-1 | production/research-founding-membership.sql | RUN (presence verified; exact apply date not recorded) | 18 expected `research_fm_*` tables present with RLS |
| FM-2 | research-fm-esign-native.sql | RUN 2026-07-24 | managed migration `20260724163934` |
| FM-3 | research-fm-esign-native-hardening.sql | RUN 2026-07-24 | managed migration `20260724170132` |
| FM-4 | research-fm-esign-native-attempt-lease.sql | RUN 2026-07-24 | managed migration `20260724171056` |
| FM-5 | research-idempotency-keys.sql | RUN 2026-07-24 | managed migration `20260724185842` |
| FM-6 | research-fm-activation-verify-atomic.sql | RUN 2026-07-24 | managed migration `20260724185858` |
| FM-7 | research-agreement-package-notifications.sql | RUN 2026-07-25 | managed migration `20260725225920`; RLS/grants/triggers verified |

FM-2 through FM-4 require FM-1. FM-6 requires FM-5. Applying schema does
not enable the founding-activation or e-signature capabilities.

Verification files (read-only, run any time):

- `verify-research-schema.sql` — all 14 research tables exist, RLS on, zero
  public policies, referral seed values correct.
- `verify-referral-fraud.sql` — the fraud tables, uniqueness and queue indexes,
  the applicant_ip column, and the research_rate_limit_hit function.

Notes:

- 2026-07-18: migrations 2-7 were confirmed by a code-to-schema cross-check
  (every table and column the server queries exists; zero mismatches) plus
  Samuel running the combined SQL in production.
- 2026-07-18: migration 8 run by Samuel; his run returned the three new tables
  (referral_events, referral_fraud_flags, research_rate_limits). The
  remaining pieces (indexes, applicant_ip, the function) are covered by
  verify-referral-fraud.sql.
- All research tables are service-role only by design: RLS enabled with no
  public policies. Adding a policy to any research table is a security
  regression; see docs/security.
- 2026-07-25 release discovery reconciled migrations 9-19 against production.
  The `billing_state` column and widened member status constraint are present;
  every expected member-platform table is present; every Research table has
  RLS enabled; and Research has zero policies. The original application date
  was not recorded in the managed migration-history stream, so this ledger
  uses the conservative date `by 2026-07-25` rather than inventing an exact
  run date. The server still reads these objects defensively. Each member-
  platform migration corresponds to a wave documented in
  docs/agent-coordination/status/WEBSITE2_MEMBER_PLATFORM.md.
  Note for whoever runs them: research-sla-events.sql relies on its unique
  (kind, subject_id, phase) constraint for escalation idempotency, and
  research-questions.sql relies on a partial unique index to keep one active
  Telegram link per chat, so neither should be edited to relax a constraint.
- 2026-07-21: migrations 20-26 drafted by the commerce and distribution lane
  (PR #31; renumbered from 10-16 on integration to sit after the member-platform
  migrations). NONE are run. They follow the service-role-only rule: RLS enabled,
  zero policies. Run them in listed order, because 22 and 26 reference concepts
  introduced by 20 and 21. Nothing in the running server queries these tables
  yet, so there is no deploy-order hazard; the commerce services are exercised
  entirely through injected in-memory repositories today.
- Constraints worth knowing before running 20-26, because they will reject data
  that older habits would have allowed:
  - research_product_facts refuses a fact marked `confirmed` without both a value
    and a supplier document or COA source. This is deliberate and is exactly the
    control that keeps the signed-but-unattached supplier package (eligibility
    summary relocated to the private operations repository; see
    docs/research-commerce/SUPPLIER_DATA_RELOCATION.md) from unlocking commerce
    on COA-backed facts.
  - research_orders refuses a payment_authorized, payment_captured, or refunded
    row without a provider reference, refuses a capture above the authorization,
    and refuses a refund above the capture.
  - research_commission_ledger and research_store_credit_ledger BLOCK UPDATE and
    DELETE via trigger. A correction must be a new row referencing the original.
    A migration that tries to backfill by UPDATE on these tables will fail, which
    is the intended behavior rather than a bug to work around.
  - research_partners has no parent, sponsor, upline, or tier column, and must
    not gain one. Recursive downline compensation is a founder-level prohibition.
- 2026-07-25: FM-7 was applied for the communications/client-experience
  release. Migration 30 was applied after an idempotent disposable PostgreSQL
  dry run. Production verification confirmed that `public.rls_auto_enable()`
  retains its pinned `pg_catalog` search path and enabled event trigger while
  PUBLIC, `anon`, and `authenticated` no longer have execute privilege. The
  corresponding Supabase security-advisor finding is cleared.

Care uses a separate, disabled-by-default migration chain. These migrations
must remain serialized behind Website 2 review and must not activate clinical
services:

| Order | File | Purpose | Status |
|---|---|---|---|
| Care-1 | `care-access-foundation.sql` | Care capability, roles, access audit, forced RLS | RUN (`20260726064113 care_access_foundation`) |
| Care-2 | `care-eligibility-intake.sql` | Patient identity seam, location, state/clinician coverage, append-only consent/waitlist/eligibility history, and versioned intake foundation | RUN (`20260726080248 care_eligibility_intake`) |
| Care-3 | `care-appointments-clinician.sql` | Verified medical-group/clinician/provider readiness, appointment/reminder lifecycle, private telehealth references, assignment history, and human-clinician review | RUN (`20260726093600 care_appointments_clinician`) |
| Care-4 | `care-prescription-pharmacy.sql` | Patient-specific human-clinician prescription source/signing/supersession plus verified pharmacy, license, state coverage, operator, clarification, dispense, and shipment foundations | RUN (`20260726112848 care_prescription_pharmacy`) |

Care-2, Care-3, and Care-4 seed no state, clinician, medical group, provider,
consent document, intake definition, medical question, patient, appointment,
pharmacy, product, price, prescription, instruction, shipment, or availability
record. No migration can make the canonical Care capability live. Care-3 must
be applied only after Care-1 and Care-2; Care-4 must be applied only after
Care-3. Website 2 must integrate the canonical pre-launch gate and required
input model before any private seed-data workflow is authorized.
- 2026-07-26: Care PR2 was applied as managed migration
  `20260726080248 care_eligibility_intake` after Care PR1. Production
  verification found all 13 PR2 tables forced RLS, zero browser table or
  routine grants, exactly three service-role RPC grants, zero PR2 rows, and the
  canonical Care capability still disabled.
- The global order in this ledger is the integration order. The authoritative
  ordered run script for a production apply is
  docs/research-launch/FULL_PRODUCTION_MIGRATION_MANIFEST.md.
- 2026-07-25: Release Train 1 production migrations were applied in dependency
  order as managed migrations
  `release_train_1_research_catalog`,
  `release_train_1_research_inventory_lots`, and
  `release_train_1_research_products_diagnostics`. Verification found all
  expected tables, the Website 3 forced-RLS/browser-grant/private-bucket/RPC
  posture, zero fabricated product/lot/COA/biomarker records, and unchanged
  existing record-count invariants.
- `research-prelaunch-foundation.sql` was applied as managed migration
  `canonical_prelaunch_foundation`. Production verification found the canonical
  disabled settings row, 5/5 forced-RLS tables, zero browser grants, and zero
  roles, namespaces, access audits, or external-action captures.
- `research-required-input-readiness.sql` was applied as managed migration
  `20260726045307 canonical_required_input_readiness`. Production verification
  found 4/4 forced-RLS governance tables, zero browser grants, and zero
  required-input, audit, readiness-manifest, or launch-switch rows.
- `care-access-foundation.sql` was applied as managed migration
  `20260726064113 care_access_foundation` after the Website 2 integration
  candidate passed independent review. Production verification found one
  canonical `care:disabled` capability, 3/3 forced-RLS tables, zero browser
  mutation grants, two intended authenticated read policies, and zero Care
  role-assignment or access-audit rows. It creates no clinical record.

- 2026-07-30 authenticated production preflight confirmed managed migration
  `20260727160000 research_inventory_reservation_commands` is applied.
  The five managed files numbered 42 through 46 are present in the repository,
  are represented exactly once in `docs/coordination/MIGRATION_DAG.json`, and
  remain absent from the authenticated production ledger. Their checked-in
  representation is release-order evidence only; it does not authorize or
  imply production application.
  Pre-apply production verification found all four cart tables and all cart
  functions absent, all Product Control, inventory, and reservation domain rows
  at zero, and two existing Research members. The migration creates no rows and
  performs no inventory reservation, allocation, decrement, checkout, order,
  payment, provider, or Care action. Applying it to production remains a
  separate protected action that this change does not perform or authorize.
