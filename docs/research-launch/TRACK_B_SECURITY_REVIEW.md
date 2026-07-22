# Track B Security Review (Wave 26, final scan pass)

Date: 2026-07-22
Scope: worktree `wt-track-b`, branch `integration/xenios-research-track-b-commerce-activation` (PR #38).
Method: read-only scans over source, SQL, docs, and a fresh production build (`npm run build`, exit 0, client bundle written to `dist/public`, server bundle to `dist/index.cjs`). No code was modified; findings are reported, not fixed.

Overall verdict: PASS (7 of 7 checks pass). One non-blocking observation is recorded under Check 6.

---

## Check 1: Secret scan over server/ client/ supabase/ docs/

Command:

```
grep -rInE "sb_secret_[A-Za-z0-9]{20}|sk_live_|whsec_[A-Za-z0-9]{20,}|STRIPE_SECRET_KEY *= *['\"][A-Za-z0-9]|[0-9]{8,}:[A-Za-z0-9_-]{30,}" server client supabase docs --exclude-dir=node_modules --exclude-dir=dist
```

Evidence (all four hits, in full):

```
server/research/providers/payout.test.ts:288:    const r = validatePayoutConfig({ PAYOUT_API_KEY: "sk_live_secret_value" } as NodeJS.ProcessEnv);
server/research/providers/payout.test.ts:292:      expect(JSON.stringify(r)).not.toContain("sk_live_secret_value");
server/research/telegram-provider.test.ts:39:const FAKE_TOKEN = "123456789:UNIT_TEST_BOT_TOKEN_MARKER_abcdefghijklmnop";
server/research/telegram-provider.test.ts:177:    const rotated = "987654321:SOME_OTHER_TOKEN_SHAPE_zyxwvutsrqponml";
```

Triage: every hit is a deliberately fake, secret-shaped test fixture used to prove redaction, not a credential value.

- `payout.test.ts:288` constructs the literal `"sk_live_secret_value"` (not a real Stripe key shape beyond the prefix) and line 292 asserts the value never appears in the validator's output. The fixture exists to catch a leak.
- `telegram-provider.test.ts:39` is annotated in source (lines 37-38): "A distinctive fake token. If this marker ever shows up in an error message, a log line, or an audit event, the redaction has failed." The token body is `UNIT_TEST_BOT_TOKEN_MARKER_...`; line 177's `987654321:SOME_OTHER_TOKEN_SHAPE_...` tests that the scrubber catches any token-shaped string, not just the configured one.

No `sb_secret_`, `whsec_`, or `STRIPE_SECRET_KEY = "<value>"` assignments matched anywhere. Environment variable NAMES (STRIPE_SECRET_KEY, PAYOUT_API_KEY, TELEGRAM_BOT_TOKEN, etc.) appear only as names, never with inline values.

Result: PASS. No real secret values in server/, client/, supabase/, or docs/.

---

## Check 2: Synthetic-production guard on every live-adapter factory

Requirement: each live-adapter factory (payment, payout, shipping, fulfillment) and the `buildCommerceDependencies` state-3 path must call `assertNoSyntheticDataInProduction` before constructing anything live.

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
| Composition (state 3) | `server/research/commerce/production-deps.ts:455` | First statement of `liveDependencies(...)` (line 441), which is the state-3 return of `buildCommerceDependencies` (line 676: reached only when the commerce flag is on AND the database is configured) |

The composition-level call covers Supabase URL, payment/shipping provider selection, serviceable states, and the checkout agreement keys; each provider factory re-checks its own secrets. Every guard throws before any adapter or provider call exists.

Result: PASS. All five required call sites present and positioned before construction.

---

## Check 3: Supplier-PII scan over client/ and dist/public

Commands and exit codes (grep exit 1 = no matches):

```
grep -rInE "mitch\.clark|apexbio|Apex BioInnovations|Research Park Blvd|555-1234" client        # exit 1, no matches
grep -rlEi  "mitch\.clark|apexbio|Apex BioInnovations|Research Park Blvd|555-1234" dist/public  # exit 1, no matches (fresh build)
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
```

Result: PASS. No supplier PII and no signed-master SHA in the client source or the shipped client bundle.

---

## Check 4: Client-bundle scan of dist/public

Fresh build first: `npm run build` completed (vite client build "built in 9.21s"; esbuild server bundle `dist/index.cjs 392.3kb`). All scans below are over `dist/public` only, which is the browser-served output.

Commands and exit codes:

```
grep -rn  "dev-gallery-fixture-token" dist/public   # exit 1, absent
grep -rlin "dev-gallery|DevGallery"   dist/public   # no matches, the whole gallery module is compiled out
grep -rEn "COA-P0[0-9]{2}-LOT"        dist/public   # exit 1, absent
grep -rn  "MITCH_TEST_"               dist/public   # exit 1, absent
```

Negative controls confirming the scans would catch a leak:

- The fixture token exists in source at `client/src/research/gallery.tsx:47` (`memberToken: "dev-gallery-fixture-token"`), guarded by `fixturesAllowed()` (`client/src/research/lib/fixtures.ts:6-12`), which is statically `false` in a PROD build via `import.meta.env.PROD`, so Vite eliminates the fixture path entirely. The bundle scan confirms the elimination actually happened.
- COA lot ids (`COA-P001-LOT-0824A` ... `COA-P003-LOT-0824D`) exist in repo docs/source and are absent from the bundle.
- `MITCH_TEST_` markers exist in `server/research/commerce/production-guards.ts` and `server/research/providers/fulfillment.ts` (server-side only) and are absent from the client bundle.

Result: PASS. No fixture token, no dev gallery, no COA lot ids, no Mitch sandbox markers in the shipped client bundle.

---

## Check 5: Tenant isolation in server/research/commerce/persistence/

Method: every `.select(...)` chain in the eleven `*-store.ts` files was extracted and each read of a member/partner-tenant table checked for an owner-scoped `.eq` filter.

Owner-scoped reads (evidence, file:line of the filter):

- `cart-store.ts:131` carts by `member_id`; `:151` cart lines by `cart_id` (the cart id is resolved from `member_id` first).
- `orders-store.ts:471` and `:483` orders by `member_id`; `:404` and `:413` lines/shipments by `order_id` of an already-loaded order.
- `claims-store.ts:263` claims by `member_id`; `:269` by `order_id`.
- `store-credit-store.ts:489` ledger by `member_id`; `:547` single entry by `id` AND `member_id` together (double filter).
- `subscriptions-store.ts:244` by `member_id`; `:259` events by `subscription_id`.
- `commissions-store.ts:286,318,668` by `partner_id`; `:348,688` by `order_id`/`batch_id`.
- `partners-store.ts:226,237` referral codes by `code`/`partner_id`; `:351` by `subject_key`.
- `idempotency-store.ts:133` by `scope` AND `key` (scope encodes the tenant).
- `inventory-store.ts` reads lots by `sku`/`lot_id`; inventory is global stock, not a tenant table.

By-primary-id reads and their ownership enforcement (the store reads by id; the service layer verifies the owner before returning anything):

- `orders-store.ts:424` `get(orderId)` has no member filter; `server/research/commerce/orders.ts:480` enforces `if (order.memberId !== memberId) return null` on the member-facing path.
- `subscriptions-store.ts:230` `get(subscriptionId)`; `server/research/commerce/subscriptions.ts:284-287` (`getOwned`) enforces `if (record.memberId !== memberId) return null` for member reads. The direct-by-id calls at `subscriptions.ts:447,471,485,529` are lifecycle/renewal paths taking an `Actor`, not member request paths.
- Same pattern in `refunds.ts:310` and `:499` (order and claim ownership checked before use).

Cross-tenant reads, all documented admin-only:

- `orders-store.ts:492` `listAll()` selects all orders with no filter. Documented admin-only in the interface (`orders.ts:100-102`: "Admin-only cross-member listing. The review queue has no single member.") and in the store header (`orders-store.ts:386-389`: "listAll is the one deliberate admin cross-member path"). Sole caller is `adminLargeOrderQueue` (`orders.ts:486`).
- `claims-store.ts:277` `listOpen()` selects claims across members. Documented in-line (`claims-store.ts:274-276`: "Admin-wide (no tenant scope, by contract)").
- `admin-queues-store.ts:687` reads the admin queue tables (`allQueueItems`), which are operator tables, not member-tenant tables.

Result: PASS. Every member/partner tenant read is owner-filtered at the store or ownership-checked at the service layer; the listAll-style admin paths are explicitly documented as admin-only.

---

## Check 6: Provider replay protection

Signature verification includes timestamp tolerance on all three rails (HMAC-SHA256 over `${t}.${rawBody}`, constant-time compare, absolute skew window):

- Stripe: `server/research/providers/payment.ts:354-355` (`STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300`), enforced at `payment.ts:388` (`if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return "stale"`), wired into the adapter at `payment.ts:815,821`.
- Mitch fulfillment: `server/research/providers/fulfillment.ts:351` (`MITCH_WEBHOOK_TOLERANCE_SECONDS = 300`), enforced at `fulfillment.ts:662-664` (absolute skew both directions), timestamp bound into the MAC at `fulfillment.ts:358-360` so an old body cannot be re-timestamped.
- Shipping carrier: `server/research/providers/shipping.ts:365` (`SHIPPING_WEBHOOK_TOLERANCE_SECONDS = 300`), the live `CarrierShippingAdapter.verifyDeliveryEvent` reuses `verifyStripeSignature` with the tolerance at `shipping.ts:913-918` and rejects `stale` at `:922-929`. (The `"test-signature"` string equality at `shipping.ts:239` is inside `TestShippingProvider`, the offline test double, not the live adapter.)

Webhook event dedup relies on the DB unique constraint:

- SQL: `supabase/production/research-track-b-commerce.sql:443-451`, `constraint research_provider_webhook_events_unique unique (provider_name, event_id)`, with the header comment "Webhook replay protection. UNIQUE is the whole point."
- Store: `server/research/commerce/persistence/webhooks-store.ts:233-261` (`createSupabaseWebhookReplayGuard`): `seen()` answers from the database (`.eq("provider_name",...).eq("event_id",...)`, line 240-242) and `record()` inserts and absorbs exactly the unique-violation code (line 252-259), so the constraint, not application memory, is the guard.

Non-blocking observation (reported, not fixed, per this wave's mandate): the durable guard is built but not yet wired into the webhook pipeline. `WebhookEventStore` in `server/research/commerce/webhooks.ts:43-45` is still synchronous, so `resolveWebhookEventStore` (`webhooks-store.ts:182-187`) returns the in-memory store, as documented in the module header (`webhooks-store.ts:17-28`). This is not currently exploitable: no commerce provider webhook HTTP route is mounted anywhere in live code (`createWebhookHandler` is constructed only in tests; the only `app.post` webhook routes in the server are the Telegram and Calendly ones, outside commerce), so the surface fails closed. Before any provider webhook endpoint is mounted, the event-store interface must be async-converted and `createSupabaseWebhookReplayGuard` wired in, exactly as the module comment prescribes.

Result: PASS (with the wiring observation above recorded for the mounting wave).

---

## Check 7: Append-only ledgers

Store scan for mutations on ledger tables:

```
grep -n ".update(|.delete(" persistence/{commissions,store-credit,orders,subscriptions,webhooks}-store.ts
```

- `commissions-store.ts`: zero `.update()`/`.delete()`. Writes are inserts only (`:295` commission entries, `:640` payout batches, `:675` payout attempts).
- `store-credit-store.ts`: zero `.update()`/`.delete()`. Ledger writes are inserts only (`:503`).
- `subscriptions-store.ts`: zero `.update()`/`.delete()` on the events ledger; events are insert-only (`:254`). The `.upsert` at `:239` is the subscription HEADER (current state), not the event ledger.
- `orders-store.ts`: state events are insert-only (`:464-465` into `research_order_state_events`; the row type comment at `:150` says "Append only"). The `.delete()` calls at `:441` (lines) and `:451` (shipments) are on the current-state child tables, replaced wholesale on save by design (`:440` "Lines are current-state, not a ledger"), not on the events ledger. The header `.upsert` at `:437` is current state.
- `webhooks-store.ts`: the `.update()` at `:158` is the webhook ORDER projection (current state), not the event dedup table; webhook events are insert-only (`:250-252`).

Database enforcement, `supabase/production/research-track-b-commerce.sql`: one shared trigger function `public.research_ledger_is_append_only()` (line 1050) raises an exception on any UPDATE or DELETE, attached as BEFORE UPDATE OR DELETE FOR EACH ROW by four triggers:

| Trigger | Table | SQL line |
| --- | --- | --- |
| `research_commission_ledger_no_update` | `public.research_commission_ledger` | 1062 |
| `research_store_credit_ledger_no_update` | `public.research_store_credit_ledger` | 1067 |
| `research_order_state_events_no_update` | `public.research_order_state_events` | 1324 |
| `research_subscription_events_no_update` | `public.research_subscription_events` | 1329 |

So even a hand-run statement or a buggy migration cannot rewrite ledger history; corrections must be new rows.

Result: PASS. No application update/delete paths on any ledger table, and the database blocks them independently via the four triggers.

---

## Summary

| # | Check | Result |
| --- | --- | --- |
| 1 | Secret scan (server/client/supabase/docs) | PASS (4 hits, all fake redaction-test fixtures) |
| 2 | Synthetic-production guard on live factories + state 3 | PASS (5 call sites, all before construction) |
| 3 | Supplier PII / signed-master SHA out of client + bundle | PASS |
| 4 | Client bundle free of fixture token, COA ids, MITCH_TEST_ | PASS |
| 5 | Tenant isolation in persistence stores | PASS (admin paths documented) |
| 6 | Provider replay protection (DB dedup + timestamp tolerance) | PASS, one non-blocking wiring observation |
| 7 | Append-only ledgers (stores + SQL triggers) | PASS |

Verdict: PASS. One observation for a later wave: async-convert `WebhookEventStore` and wire `createSupabaseWebhookReplayGuard` before mounting any provider webhook route (no such route is mounted today, so the surface currently fails closed).
