# Commerce authority inventory — 2026-09-23

Base: `b3dba343d01d5f4f3777e484d8a8a72d65606437`.

This inventory covers every application/runtime access to the seven relations
attested by `durable_checkout_money_v2:20260923.1`. SQL rehearsals and operator
scripts are test/setup authorities, not deployed application callers.

| Relation | Caller | Operation and cardinality | Runtime / transaction | Idempotency and sensitivity | Disposition |
| --- | --- | --- | --- | --- | --- |
| `research_claims` | `claims-store.ts` `get` | `SELECT`, 0..1 | `service_role`; one HTTP statement | Claim UUID; member/refund-sensitive | Replace with bounded claim RPC. |
| `research_claims` | `claims-store.ts` `save` | UPSERT, exactly 1 | `service_role`; one HTTP statement | Claim UUID conflict key; financial state | Replace with bounded claim RPC. |
| `research_claims` | `claims-store.ts` member/order/open lists | `SELECT`, 0..n | `service_role`; one statement | Explicit member/order/open scope | Replace with bounded claim RPC. |
| `research_claims` | `admin-queues-store.ts` refund/replacement queues | `SELECT`, 0..n | `service_role`; one statement | Open-state projection; operator-sensitive | Reuse bounded open-claim RPC. |
| `research_refund_keys` | `claims-store.ts` lookup | `SELECT`, 0..1 | `service_role`; one statement | Refund scope is the replay identity | Replace with bounded replay-key RPC. |
| `research_refund_keys` | `claims-store.ts` record | `INSERT`, 0..1 | `service_role`; unique constraint; one statement | First writer wins; duplicate is a no-op | Replace with atomic bounded replay-key RPC. |
| `research_orders` | `orders-store.ts` reads | `SELECT`, 0..n | `service_role`; separate line/shipment reads | Member and checkout keys scope reads | Retain: Capability V2 permits `SELECT`. |
| `research_orders` | `orders-store.ts` `save` | UPSERT, exactly 1 | `service_role`; currently separate from child writes | Immutable checkout key; state/money-sensitive | Replace with one atomic order-persistence RPC. |
| `research_order_lines` | `orders-store.ts` load | `SELECT`, 0..n | `service_role`; read projection | Scoped by order UUID | Retain: Capability V2 permits `SELECT`. |
| `research_order_lines` | `orders-store.ts` `save` | `DELETE` 0..n then `INSERT` 0..n | `service_role`; currently multiple HTTP transactions | Must match header exactly | Fold into atomic order-persistence RPC. |
| `research_order_state_events` | `orders-store.ts` `save` | `INSERT`, 0..1 | `service_role`; currently after header/children | One event per observed state change | Fold into atomic order-persistence RPC; direct `INSERT` remains permitted for existing authorities. |
| `research_orders` / `research_order_lines` | `claims-store.ts` claim-order view | `SELECT`, 0..1 / 0..n | `service_role`; two reads | Refund calculation input | Retain: both reads are permitted. |
| `research_orders` | `claims-store.ts` refund-linked save | `UPDATE`, exactly 1 expected | `service_role`; one statement | Refund total/state/idempotency key | Replace with bounded claim-order update RPC. |
| `research_orders` | `webhooks-store.ts` compatibility projection | `SELECT`, 0..1 | `service_role`; one statement | Order UUID | Retain: Capability V2 permits `SELECT`. |
| `research_orders` | `webhooks-store.ts` compatibility save | `UPDATE`, exactly 1 expected | `service_role`; one statement | Verified webhook state/reference/key | Replace with bounded webhook-order RPC. |
| `research_orders` | account identity, buyer bridge, receipt repair, managed qualification, admin queues | `SELECT`, 0..n | backend `service_role`; read-only | Explicit order/member/admin scope | Retain: Capability V2 permits `SELECT`. |
| `research_store_credit_ledger` | `store-credit-store.ts` and admin queue | `SELECT` 0..n, `INSERT` 1 | `service_role`; spend uses existing RPC | Append-only financial ledger | Retain exact `SELECT, INSERT` contract. |
| `research_idempotency_keys` | idempotency and recovery stores | `SELECT`, `INSERT`, `UPDATE`, 0..1 | `service_role`; uniqueness/row locks in existing authorities | Durable cross-process replay | Retain exact `SELECT, INSERT, UPDATE` contract. |

## Required authority families

1. A claim repository authority with a closed action vocabulary for safe reads,
   validated claim persistence, refund-key lookup/reservation, and the narrow
   refund-linked order update. It accepts no SQL identifiers or predicates.
2. An order persistence authority that commits the header, full line set, full
   shipment set, and optional transition event in one database transaction.
3. A webhook order-update authority limited to the four columns owned by the
   compatibility webhook projection.

All three are `SECURITY DEFINER`, owned by `postgres`, use
`search_path = ''`, schema-qualify every object, revoke execution from
`PUBLIC`, `anon`, and `authenticated`, and grant execution only to
`service_role`.

## ACL conclusion

After those callers move to the bounded authorities, no deployed application
path requires a privilege forbidden by Capability V2. Direct non-conflicting
access remains limited to the exact seven-table matrix already encoded by the
capability function.
