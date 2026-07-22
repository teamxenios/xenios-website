# Track B Security Review (Wave 27, scan refresh over the final state)

Date: 2026-07-22
Scope: worktree `wt-track-b`, branch `integration/xenios-research-track-b-commerce-activation` (PR #38, head d69cce6 plus the final working-tree waves: the mounted payment webhook route, the shipping-quote and partner-portal surfaces, the durable webhook replay guard wiring, lot reservations, and the partner member linkage).
Method: read-only scans over source, SQL, docs, and a fresh production build (`npm run build`, exit 0, client bundle in `dist/public`, server bundle `dist/index.cjs` 414.8kb). No code was modified; findings are reported, not fixed.

Overall verdict: PASS (7 of 7 checks pass). Two non-blocking observations are recorded, one under Check 6 (stale comments plus an orphaned resolver in `webhooks-store.ts`) and one under Check 7 (the reservation seam is built and tested but not yet wired into the live checkout composition).

---

## Check 1: Secret scan over server/ client/ supabase/ docs/

Command:

```
grep -rInE "sb_secret_[A-Za-z0-9]{20}|sk_live_|whsec_[A-Za-z0-9]{20,}|STRIPE_SECRET_KEY *= *['\"][A-Za-z0-9]|[0-9]{8,}:[A-Za-z0-9_-]{30,}" server client supabase docs --exclude-dir=node_modules --exclude-dir=dist
```

Evidence (all five code hits, in full; the remaining matches are this document quoting them):

```
server/research/commerce/routes.test.ts:487:            throw new Error("SECRET_sk_live_123 leaked in an error message");
server/research/providers/payout.test.ts:288:    const r = validatePayoutConfig({ PAYOUT_API_KEY: "sk_live_secret_value" } as NodeJS.ProcessEnv);
server/research/providers/payout.test.ts:292:      expect(JSON.stringify(r)).not.toContain("sk_live_secret_value");
server/research/telegram-provider.test.ts:39:const FAKE_TOKEN = "123456789:UNIT_TEST_BOT_TOKEN_MARKER_abcdefghijklmnop";
server/research/telegram-provider.test.ts:177:    const rotated = "987654321:SOME_OTHER_TOKEN_SHAPE_zyxwvutsrqponml";
```

Triage: every hit is a deliberately fake, secret-shaped test fixture used to prove redaction or non-leakage, not a credential value.

- `routes.test.ts:487` (new this wave) throws the marker string `"SECRET_sk_live_123 leaked in an error message"` from a fake service inside the webhook-route test, then asserts the HTTP response never carries it. The fixture exists to prove the route's catch path does not echo provider or configuration errors.
- `payout.test.ts:288` constructs the literal `"sk_live_secret_value"` (only the prefix is Stripe-shaped) and line 292 asserts the value never appears in the validator's output.
- `telegram-provider.test.ts:39` is annotated in source (lines 37-38): a distinctive fake token whose appearance in any log or error means redaction failed. Line 177's second token shape tests that the scrubber catches any token-shaped string, not just the configured one.

No `sb_secret_`, `whsec_`, or `STRIPE_SECRET_KEY = "<value>"` assignments matched anywhere. Environment variable NAMES (STRIPE_SECRET_KEY, PAYOUT_API_KEY, TELEGRAM_BOT_TOKEN, etc.) appear only as names, never with inline values. The remaining matches are inside this review document itself, quoting the fixtures above.

Result: PASS. No real secret values in server/, client/, supabase/, or docs/.

---

## Check 2: Synthetic-production guard on every live-adapter factory

Requirement: each live-adapter factory (payment, payout, shipping, fulfillment) and the `buildCommerceDependencies` state-3 path must call `assertNoSyntheticDataInProduction` before constructing anything live. This wave adds new consuming surfaces (the mounted webhook route, shipping quotes, the partner portal); all of them are downstream of these same factories and the state-3 composition, so the guard set is unchanged and re-verified.

Command:

```
grep -rn "assertNoSyntheticDataInProduction" server --include="*.ts" | grep -v ".test.ts"
```

Call sites (guard defined at `server/research/commerce/production-guards.ts:111`):

| Factory | Call site | Placement |
| --- | --- | --- |
| Payment (Stripe) | `server/research/providers/payment.ts:887` | In the `selected === "stripe"` branch, after config validation, BEFORE `new StripePaymentAdapter(...)` |
| Payout (live) | `server/research/providers/payout.ts:1091` | In the `selected === "live"` branch, BEFORE `new RealPayoutAdapter(...)` |
| Shipping (carrier) | `server/research/providers/shipping.ts:1077` | In the live-carrier branch after `validateCarrierShippingEnvironment`, BEFORE the carrier adapter exists |
| Fulfillment (Mitch) | `server/research/providers/fulfillment.ts:839` | After the missing-environment early return, BEFORE the live Mitch adapter exists |
| Composition (state 3) | `server/research/commerce/production-deps.ts:659` | First statement of `liveDependencies(...)` (line 645), the state-3 return of `buildCommerceDependencies`, reached only when the commerce flag is on AND the database is configured |

The composition-level call now also covers the partner link base URL (`production-deps.ts:671-673`, `RESEARCH_PARTNER_LINK_BASE_URL`) alongside the Supabase URL, payment/shipping provider selection, serviceable states, and the checkout agreement keys. Each provider factory re-checks its own secrets. Every guard throws before any adapter, store, or provider call exists, so the new webhook, quote, and partner surfaces cannot be composed over a synthetic-marked configuration: they only exist inside `liveDependencies`, which is behind the guard.

New-surface confirmation: the webhook handler (`production-deps.ts:763-768`), the shipping quote path (`:1054-1056`), and the partner portal wiring (`:770-840`) are all constructed after line 659 inside `liveDependencies`; states 1 and 2 expose fail-closed stubs only (`webhooksFailClosed`, `production-deps.ts:310-314`, and `commerce_disabled` denials).

Result: PASS. All five required call sites present and positioned before construction; the new surfaces sit strictly behind the state-3 guard.

---

## Check 3: Supplier-PII scan over client/ and dist/public

Commands and exit codes (grep exit 1 = no matches), all against the fresh build:

```
grep -rInE "mitch\.clark|apexbio|Apex BioInnovations|Research Park Blvd|555-1234" client        # exit 1, no matches
grep -rlEi  "mitch\.clark|apexbio|Apex BioInnovations|Research Park Blvd|555-1234" dist/public  # exit 1, no matches
grep -rlin  "E8ED723F994138A33F9EB08018228FDE773A40BC299B099F568BC4EEA3031884" dist/public      # exit 1, no matches
grep -rlin  "e8ed723f" dist/public                                                              # exit 1, no matches (prefix check)
```

The signed-master SHA-256 value was taken from `docs/research-commerce/SIGNED_SUPPLIER_MASTER_INTAKE.md:16` (the intake record of the executed Apex master, 2026-07-21).

Negative control (the scan is meaningful because the terms DO exist in the repo, confined to back-office docs never shipped to the client):

```
grep -rli "mitch.clark|apexbio|apex bio" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
  ./docs/research-commerce/PER_SKU_GATE_REPORT.json
  ./docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md
  ./docs/research-commerce/signed-supplier-master-facts.json
  ./docs/research-commerce/SIGNED_SUPPLIER_MASTER_INTAKE.md
  ./docs/research-launch/TRACK_B_SECURITY_REVIEW.md   (this document)
```

Result: PASS. No supplier PII and no signed-master SHA in the client source or the shipped client bundle.

---

## Check 4: Client-bundle scan of dist/public

Fresh build first: `npm run build` completed (vite client build "built in 6.23s"; esbuild server bundle `dist/index.cjs 414.8kb`). All scans below are over `dist/public` only, which is the browser-served output.

Commands and exit codes:

```
grep -rn  "dev-gallery-fixture-token" dist/public       # exit 1, absent
grep -rlin "dev-gallery|DevGallery"   dist/public       # exit 1, the whole gallery module is compiled out
grep -rEn "COA-P0[0-9]{2}-LOT"        dist/public       # exit 1, absent
grep -rn  "MITCH_TEST_"               dist/public       # exit 1, absent
grep -rn  "whsec_|sk_live_|STRIPE_SECRET" dist/public   # exit 1, absent (secret shapes never reach the bundle)
```

Negative controls confirming the scans would catch a leak:

- The fixture token exists in source at `client/src/research/gallery.tsx:47` (`memberToken: "dev-gallery-fixture-token"`), guarded by `fixturesAllowed()` (`client/src/research/lib/fixtures.ts:6-12`), which is statically `false` in a PROD build via `import.meta.env.PROD`, so Vite eliminates the fixture path entirely. The bundle scan confirms the elimination actually happened.
- COA lot ids (`COA-P001-LOT-0824A` ... `COA-P003-LOT-0824D`) exist in repo docs/source and are absent from the bundle.
- `MITCH_TEST_` markers exist in `server/research/commerce/production-guards.ts` and `server/research/providers/fulfillment.ts` (server-side only) and are absent from the client bundle.

Result: PASS. No fixture token, no dev gallery, no COA lot ids, no Mitch sandbox markers, no secret shapes in the shipped client bundle.

---

## Check 5: Tenant isolation, including every NEW route

### 5a. New HTTP surfaces (routes.ts, all registered in `registerCommerceApi`, mounted live at `server/index.ts:135`)

The provider webhook route is signature-gated, not member-gated, BY DESIGN, and that design was verified:

- `POST /api/research/webhooks/payment` (`routes.ts:661-692`) carries no member guard; the in-source comment (`:654-660`) states the gate is the signature over the exact raw bytes. The handler refuses an absent signature before anything else (`webhooks.ts:192`), and verification runs over the captured raw body (`rawBodyOf`, `routes.ts:279-284`, reading the `req.rawBody` buffer set by the app-level `express.json` verify hook at `server/index.ts:52-58`, or the route-level `express.raw` buffer). Nothing from the body or the signature is logged or echoed: the route returns only `{ok, applied, eventId}` or `{ok:false, code}`, the catch path returns a bare `webhook_error` (`:686-690`), and the server's response-body logger suppresses bodies for every `/api/research` path (`server/index.ts:87`). The webhook can only move an order through `transitionOrder` with the event id as idempotency key (`webhooks.ts:159-183`); it has no read access to member fields (the `WebhookOrder` projection, `webhooks.ts:34-41`, deliberately excludes member id, totals, and lines).

Partner portal routes are member-scoped, never partner-id-addressable:

- `GET /partner/me`, `GET /partner/dashboard`, `POST /partner/apply`, `GET /partner/links` (`routes.ts:552-604`) all resolve the partner FROM the authenticated member (`deps.partners.findByMemberId(memberId)` under `withSubject`, which fails closed with 403 when there is no subject, `routes.ts:252-261`). No handler accepts a partner id from the request (in-source contract at `routes.ts:549-550`); `dashboardFor`/`listLinks` receive the partner id only after that resolution. The durable store reads by member: `partners-store.ts:604-605` (`.eq("member_id", memberId)`); links are read `.eq("partner_id", ...)` (`:246`). The partner response shape is built by explicit construction (`linkToSelfSource`, `production-deps.ts:791-807`, and `toPartnerSelfView`, `member-linkage.ts:176-194`), which structurally omits legal name, contact email, member id, internal notes, admin ids, and lifecycle history, so those fields are write-only through the member surface. The dashboard stats source (`createLedgerPartnerStatsSource`, `member-linkage.ts:96-147`) derives aggregates from the append-only commission ledger via `listByPartner` and rebuilds each conversion through `toPartnerVisibleConversion`; the snapshot type has no member field, so another member's identity has no path into a partner dashboard.

Other new member surfaces are subject-scoped the same way:

- `POST /shipping/quote` (`routes.ts:607-618`), `POST /subscriptions` (create, `:621-637`), `GET /claims/:claimId` (`:640-652`) all run under `withSubject`; claim detail enforces ownership beneath (`claims.getForMember`), and a foreign claim is indistinguishable from a missing one (404, `:644-648`).

Admin routes are admin-guarded, all six: `GET /api/admin/research/commerce/queues`, `GET /api/admin/research/claims`, `POST .../claims/:claimId/review|refund|replacement`, `POST .../partners/:partnerId/review` (`routes.ts:695-776`) each take the injected `admin` guard (the merged `requireSupabaseAdmin`, `server/index.ts:138`). Admin attribution comes from the guard-attached verified email, never the request body (`adminIdOf`, `routes.ts:268-271`).

### 5b. New persistence surfaces

- `reservations-store.ts`: `listByMember` filters `.eq("member_id", memberId)` (`:230`); `get(reservationId)` reads by the unguessable business id (`rsv_<uuid>`) and is called only inside the checkout reservation seam, which is not member-addressable over HTTP (no reservation route exists; verified by the route enumeration above). A row whose status the domain does not define is dropped rather than half-acted on (`rowToReservation`, `:105-125`), failing closed.
- `partners-store.ts` (extended this wave): partner rows and links are insert plus member/partner-scoped reads only; zero `.update()`/`.delete()` in the file. The one-partner-per-member rule is backed by the DB unique constraint and surfaces as a typed `MemberAlreadyPartner` denial (`production-deps.ts:828-837`).
- Prior-wave store evidence (carts, orders, claims, store credit, subscriptions, commissions, idempotency) re-checked and unchanged: every member/partner tenant read is owner-filtered at the store or ownership-checked at the service layer (`orders.ts:480` `memberId` check; `subscriptions.ts` `getOwned`; `refunds.ts` order/claim ownership), and the cross-tenant reads (`orders-store.ts listAll`, `claims-store.ts listOpen`, admin queues) remain documented admin-only with their sole callers behind the admin guard.

Result: PASS. The webhook route's gate is the signature (verified, with no member data exposed on that surface); every partner route resolves the partner from the authenticated member; every admin route is admin-guarded; the new stores are owner-scoped.

---

## Check 6: Provider replay protection (the webhook route is now real HTTP)

The previous review recorded one observation: the durable replay guard existed but no webhook HTTP route was mounted and the event-store interface was synchronous. This wave closes that loop, and the closure was verified end to end:

Signature plus timestamp, before anything else:

- The route refuses an absent signature without consulting the provider, the store, or any order (`webhooks.ts:192`); verification runs before the replay check, so a forged body can never burn a real event id (`webhooks.ts:8-11, 194-197`).
- Stripe rail: HMAC-SHA256 over `${t}.${rawBody}`, constant-time compare, absolute skew window `STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300` (`payment.ts:355`), staleness enforced at `payment.ts:388`, wired into the adapter at `payment.ts:810-820`.
- Mitch fulfillment rail: `MITCH_WEBHOOK_TOLERANCE_SECONDS = 300` (`fulfillment.ts:351`), absolute skew both directions (`fulfillment.ts:662-664`), timestamp bound into the MAC (`fulfillment.ts:358-360`).
- Shipping carrier rail: `SHIPPING_WEBHOOK_TOLERANCE_SECONDS = 300` (`shipping.ts:365`), live adapter reuses `verifyStripeSignature` and rejects `stale` (`shipping.ts:913-929`).

Durable DB dedup, now WIRED:

- `WebhookEventStore` is async-capable (`webhooks.ts:51-54`: `seen` returns `boolean | Promise<boolean>`, `record` carries the event type the durable table requires; every handler call site awaits).
- `resolveDurableWebhookEventStore` (`production-deps.ts:197-205`) adapts `createSupabaseWebhookReplayGuard` behind that interface and is the default wiring (`:250`); `liveDependencies` resolves it (`:686`) and hands it to `createWebhookHandler` (`:763-768`), so in state 3 (which always has the database) whether an event was seen is answered by the DATABASE.
- SQL: `supabase/production/research-track-b-commerce.sql:451`, `constraint research_provider_webhook_events_unique unique (provider_name, event_id)`. The guard's `record()` inserts and absorbs exactly the unique-violation code 23505 (`webhooks-store.ts:248-259`), so the constraint, not application memory, is the guard, and a racing double-record collapses to one row.
- Order of operations in the handler: verify, then `seen` (replay acknowledged with `applied:false`), then `record`, then apply (`webhooks.ts:202-233`), with the event id doubling as the transition idempotency key so even a record-then-crash redelivery is absorbed by `transitionOrder`.
- Failure direction: a store error throws, the route's catch returns 500 (`routes.ts:686-690`), and the provider retries. Fail closed, retry later, never apply unverified.
- States 1 and 2 (flag off, or no database): `webhooksFailClosed` (`production-deps.ts:310-314`) answers `capability_disabled`, which the route maps to 503 (`routes.ts:684`), structurally side-effect free.

Non-blocking observation (reported, not fixed, per this wave's mandate): `webhooks-store.ts` carries stale documentation from before the wiring wave. Its module header (lines 17-28) and the comment blocks at lines 171-187 and 198-202 still state that `WebhookEventStore` is synchronous and that the durable guard "is not wired into the running handler", both of which are no longer true. Worse, the exported `resolveWebhookEventStore()` (`webhooks-store.ts:182-187`) still returns the in-memory store and now has NO production caller (only a test references it); a future integrator reaching for that obvious resolver name would silently get process-memory replay protection instead of the database guard. Recommend deleting or redirecting that export and refreshing the comments in the next code wave.

Result: PASS. The mounted route enforces signature, timestamp tolerance, and database-backed dedup in the correct order; the prior wave's wiring gap is closed. One stale-comment/orphaned-export observation recorded above.

---

## Check 7: Append-only ledgers, including the new reservation/allocation tables

Store scan for mutations:

```
grep -nE ".update\(|.delete\(" persistence/{commissions,store-credit,orders,subscriptions,webhooks,reservations,partners}-store.ts
```

- `commissions-store.ts`: zero `.update()`/`.delete()`. Inserts only (`:295` commission entries, `:640` payout batches, `:675` payout attempts).
- `store-credit-store.ts`: zero `.update()`/`.delete()`. Ledger inserts only (`:503`).
- `subscriptions-store.ts`: events are insert-only; the header `.upsert` is current state, not the ledger.
- `orders-store.ts`: state events are insert-only into `research_order_state_events`; the `.delete()` calls at `:441`/`:451` are the current-state lines/shipments replaced wholesale on save, by documented design, not the events ledger.
- `webhooks-store.ts`: the `.update()` at `:156-159` is the webhook ORDER projection (a narrow UPDATE of current order state keyed by the id the verified handler passes); webhook events are insert-only through the durable guard (`:249-252`).
- `partners-store.ts` (new surfaces): zero `.update()`/`.delete()`; partner rows, links, and attribution touches are inserts with scoped reads.
- `reservations-store.ts` (new): the header `.upsert` (`:210`) and the allocation-line `.delete()` plus `.insert()` (`:217-222`) are CURRENT STATE by explicit design, not a ledger. A reservation's status legitimately moves (held to released or finalized) and its lines are replaced together so two generations can never interleave (the `research_order_shipments` pattern, documented at `:20-23` and `:158-164`).

Database enforcement, `supabase/production/research-track-b-commerce.sql`: the shared trigger function `public.research_ledger_is_append_only()` (line 1050) raises on any UPDATE or DELETE, attached BEFORE UPDATE OR DELETE FOR EACH ROW by four triggers:

| Trigger | Table | SQL line |
| --- | --- | --- |
| `research_commission_ledger_no_update` | `public.research_commission_ledger` | 1062 |
| `research_store_credit_ledger_no_update` | `public.research_store_credit_ledger` | 1067 |
| `research_order_state_events_no_update` | `public.research_order_state_events` | 1324 |
| `research_subscription_events_no_update` | `public.research_subscription_events` | 1329 |

New reservation tables (`supabase/research-track-b-fidelity.sql`, this wave): `research_lot_reservations` (header) and `research_lot_reservation_allocations` (FEFO lines). These are deliberately NOT append-only ledgers, and the DDL says so and constrains the mutability instead: status is CHECK-constrained to `held | released | finalized`, a terminal state must carry its timestamp (`research_lot_reservations_released_has_date`, `..._finalized_has_date`), quantities must be positive, allocation lines are uniquely sequenced per reservation (`unique (reservation_id, seq)`) and reference the migration-21 lot table by its unique business `lot_id`. RLS is enabled on both tables (fidelity SQL, final two statements), and the server-only service-role client is the sole writer. Reservation audit evidence is designed to flow through the checkout `reservationAudit` seam (`checkout.ts:88-98, 398-404`) precisely because the append-only order state trail is `transitionOrder`-mediated and owned elsewhere.

Minor note for the record: migration 21's `research_lot_allocations` (SQL line 295) is described as the append-only ORDER allocation history but carries no append-only trigger; no application code writes to it today (repo-wide grep: only comments reference it), so nothing can currently violate it, but the trigger should accompany its first writer.

Non-blocking observation (reported, not fixed): the reservation capability is complete and tested at every layer (DDL, `reservations-store.ts`, the `createInventoryReservationSeam` FEFO seam with all-or-nothing planning and mid-persist compensation, `checkout.ts:594` onward) but is NOT yet wired into the live composition: `liveDependencies`' `createCheckoutService` call (`production-deps.ts:727-744`) passes no `inventory` or `reservationAudit` dependency, and `resolveReservationStore` has no production caller. The failure direction is safe (live checkout simply takes no durable lot hold, exactly as before this wave), but the wiring wave should inject the seam, and this document flags it so the gap is not mistaken for coverage.

Result: PASS. No application update/delete paths on any ledger table, the four DB triggers block them independently, and the new reservation tables are correctly modeled as constrained current state rather than falsely labeled ledgers.

---

## Verification of this review's own claims

- `npm run build`: exit 0 (vite client "built in 6.23s", server bundle `dist/index.cjs 414.8kb`); all Check 3/4 scans ran against this fresh `dist/public`.
- `npm run check` (tsc): exit 0, zero errors.
- Touched-surface test suites, all green: `npx vitest run` over routes, webhooks, production-wiring, reservations-store, webhooks-store, member-linkage, partners-store, checkout, inventory lots, and partners tests: 10 files, 314 tests, 314 passed.

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | Secret scan (server/client/supabase/docs) | PASS (5 hits, all fake redaction/leak-test fixtures) |
| 2 | Synthetic-production guard on live factories + state 3 | PASS (5 call sites; new surfaces all behind the state-3 guard) |
| 3 | Supplier PII / signed-master SHA out of client + bundle | PASS |
| 4 | Client bundle free of fixture token, COA ids, MITCH_TEST_, secret shapes | PASS |
| 5 | Tenant isolation incl. new webhook/partner/admin routes and new stores | PASS (webhook signature-gated by design; partner routes member-resolved; admin routes admin-guarded) |
| 6 | Provider replay: HTTP route with signature + timestamp + DB dedup | PASS (prior wiring gap closed; one stale-comment/orphaned-export observation) |
| 7 | Append-only ledgers incl. new reservation/allocation tables | PASS (reservation tables are constrained current state by design; reservation seam not yet wired, flagged) |

Verdict: PASS. Two observations for the next code wave: (1) refresh or remove the stale `resolveWebhookEventStore` export and its outdated comments in `server/research/commerce/persistence/webhooks-store.ts` so nobody wires in-memory replay protection by accident; (2) inject the built reservation seam (`createInventoryReservationSeam` over `resolveReservationStore`) into `liveDependencies`' checkout composition, plus an append-only trigger on `research_lot_allocations` before its first writer lands.
