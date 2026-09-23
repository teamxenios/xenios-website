# Commerce authority refactor qualification — 2026-09-23

Base SHA: `b3dba343d01d5f4f3777e484d8a8a72d65606437`  
Base tree: `82c2647f99937f055a2946e75958f50d42fb0579`

This is source-only qualification. No staging or production database, Render
service, Stripe environment, feature flag, customer record, or commission
surface was contacted or changed.

## Authority contract

| Function | Purpose | Tables and mutation boundary | Caller / ACL |
| --- | --- | --- | --- |
| `research_claim_repository(text,jsonb)` | Closed claim read/write actions, refund-key lookup/reservation, refund-linked order update | Claims upsert with immutable order/member binding; first-writer refund key; order update limited to refund-owned columns and states | Backend repositories; `service_role` execute only |
| `research_order_persist(jsonb,jsonb,jsonb)` | Persist one complete order aggregate | Header, full line replacement, full shipment replacement, and state event in one transaction; transaction advisory lock serializes both absent and existing order UUIDs | Order repository; `service_role` execute only |
| `research_webhook_order_update(uuid,text,text,text)` | Compatibility webhook order projection | One order; state, payment reference, last idempotency key, and timestamp only | Webhook repository; `service_role` execute only |

All three functions are `VOLATILE SECURITY DEFINER`, owned by `postgres`, use
an empty `search_path`, schema-qualify relations, interpolate no identifiers,
and revoke execution from `PUBLIC`, `anon`, and `authenticated`. Capability V2
attests their exact bodies, signatures, attributes, owners, and ACLs. The
canonical token remains `durable_checkout_money_v2:20260923.1`.

## Behavioral parity

| Domain | Base behavior | Repaired behavior | Intentional difference |
| --- | --- | --- | --- |
| Claims | Save/get/member/order/open queries; UUID and enum guards | Same repository interface and returned records; database binds an existing claim permanently to its original order/member | Direct claim relation access removed |
| Orders | Header upsert, replace lines/shipments, append event on transition | Same aggregate projection and event semantics in one RPC transaction | Partial multi-request persistence removed; same-ID attempts serialized |
| Order lines | Full replacement; duplicate SKUs were accepted; empty set cleared lines | Same duplicate-SKU and empty-set behavior | Replacement is atomic with header and shipments |
| Refund keys | First insert wins; later same/conflicting records do not overwrite it | `ON CONFLICT DO NOTHING` returns deterministic inserted/matches/original evidence | Direct ledger access removed |
| Refund | Read order/lines, update refund state/amount/key | Reads remain under allowed `SELECT`; mutation uses bounded claim authority | Direct order `UPDATE` removed |
| Cancellation | Existing checkout cancellation authorities and projections | Unchanged | None |
| Recovery | Existing recovery functions and idempotency relations | Unchanged; approved direct idempotency matrix retained | None |
| Webhooks | Read narrow order projection; update four owned values | Same projection and not-found behavior through bounded RPC | Direct order `UPDATE` removed |

Production composition still resolves the same repository interfaces. Focused
production-wiring tests exercise the mounted claim/refund/order dependencies;
route code was not changed.

## ACL convergence

Migration `20260923181443_research_checkout_commerce_authority.sql` clears
table and exposed-role column ACL drift, uses `REVOKE ALL PRIVILEGES` (including
PostgreSQL 17 `MAINTAIN`), and restores this exact `service_role` matrix:

- claims and refund keys: none;
- orders and order lines: `SELECT`;
- order state events: `INSERT`;
- store credit ledger: `SELECT, INSERT`;
- idempotency keys: `SELECT, INSERT, UPDATE`.

`PUBLIC`, `anon`, and `authenticated` retain no relation privilege. The same
migration was applied twice from each of broad, partial, and already-exact ACL
fixtures in disposable PGlite/PostgreSQL 18.3; all three restored the exact
Capability V2 token.

## Security and transactional evidence

The local SQL rehearsal proves fresh order creation, replay/update, duplicate
SKU parity, line replacement, an empty line set, invalid-child rollback after
header mutation begins, immutable order identity, claim save/read/list,
cross-record claim refusal, refund-key first winner/replay/conflict retention,
bounded webhook update, and browser-role invocation denial.

It also passes the existing 18-case catalog tamper matrix and 16 new isolated
authority cases: extra `anon`, `authenticated`, and `service_role` table grants;
`MAINTAIN`; missing required relation access; column grants; body drift;
`SECURITY INVOKER`; wrong owner; search-path drift; `PUBLIC`, `anon`, and
`authenticated` execute; missing expected execute; overload/signature drift;
and grant-option drift. Every case rolls back and restores the exact token.

The engine is single-connection PGlite 0.5.8 / PostgreSQL 18.3. Database
uniqueness, `ON CONFLICT`, row locking, and the transaction-scoped order UUID
advisory lock are exercised structurally and sequentially, but independent
connection contention and managed Supabase/PostgREST behavior remain staging
qualification work. This source lane does not claim that evidence.

## Rollback

Before any authorized remote apply, capture function definitions and ACLs. If
rollback is required, keep checkout disabled, restore the predecessor
`research_checkout_money_capability()` body and predecessor relation ACLs,
restore the four repository modules from the pre-refactor release, and only
then drop the three new RPCs and the owner-only capability core. Never drop an
RPC while repaired application code can call it. No table or row rollback is
required because the migration creates no domain data and changes no existing
row.

## Qualification boundary

Passing this document's source gates makes the commit eligible only for an
independent review. It is not staging-qualified or production-ready and does
not authorize migration apply, deployment, checkout activation, or merge.
