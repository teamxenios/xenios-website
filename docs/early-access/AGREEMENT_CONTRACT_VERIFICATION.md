# Early Access agreement acceptance: contract verification

Independent verification lane. Read-only. Base SHA `0a25b0b90f787d7e82df3a81631d45d0954dffc1`.
Every statement below was read from that exact tree; nothing is inferred from a
prior SHA or from another session's report.

FABLE-RM owns the implementation. This document exists so the review is fast and
the acceptance criteria are agreed before the code arrives.

---

## 1. The RPC

`supabase/migrations/20260804120000_research_early_access_identity_persistence.sql:424`

```sql
public.research_early_access_record_agreement(
  p_customer_ref  text,
  p_kind          text,
  p_version       text,
  p_accepted_at   timestamptz,
  p_evidence      jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
```

**Return shape.** `true` when the row was inserted. `false` when a
`unique_violation` was caught. It never raises on a repeat and it returns no row
data.

**Idempotency.** The uniqueness is enforced by the table, not by a pre-read, so
two concurrent identical acceptances cannot both insert. The second gets
`false`. There is no read-then-write window to lose.

**Conflict.** Only `unique_violation` is swallowed. Any other exception
propagates, so a genuine failure is not silently reported as a duplicate. That
distinction matters: `false` means "already accepted", never "something broke".

**`search_path` is pinned** to `pg_catalog, public` and every relation is
schema-qualified, so a caller cannot shadow a table to redirect the write. This
is the same discipline the strength-gate functions use.

## 2. The acceptance table

`...identity_persistence.sql:140`

| column | constraint |
|---|---|
| `id` | `bigint generated always as identity primary key` |
| `customer_ref` | **`~ '^eac_[a-f0-9]{32}$'`** |
| `agreement_kind` | length 1..64 |
| `agreement_version` | length 1..64 |
| `accepted_at` | `timestamptz not null`, **supplied by the caller** |
| `evidence` | `jsonb not null default '{}'` |
| `recorded_at` | `timestamptz not null default clock_timestamp()` |

```sql
constraint research_early_access_agreements_once
  unique (customer_ref, agreement_kind, agreement_version)
```

**Two timestamps, deliberately.** `accepted_at` is what the caller asserts;
`recorded_at` is when the database saw it. They are separate so a wrong or
replayed client clock cannot rewrite when the row actually landed. Review should
confirm the route sets `accepted_at` from server time, not from the request body.

**`evidence` has no shape constraint.** The database accepts any JSON object.
Whatever the route puts there is the whole story, so the review must check it
carries no secret, no raw session token and no full IP if that is not intended.

## 3. Security boundary

- RLS is **enabled** on all five tables (`:240`-`:248`).
- `revoke all on table ... from public` and from each listed role (`:265`-`:268`).
- `revoke all on function ... from public` and per role, then
  **`grant execute ... to service_role` only** (`:563`-`:571`).

So the RPC is reachable only by the server's service-role connection. No
browser-held key can call it. **Review must confirm the route never accepts a
`customerRef` from the request body**, because the RPC itself will happily write
whatever ref it is given: the identity guarantee lives entirely in the caller.

## 4. The gate

`public.research_early_access_agreements_accepted(p_customer_ref, p_required jsonb)`

**Fails closed, explicitly.** Returns `false` when `p_required` is null, is not
an array, is empty, or contains an entry that is not an object or is missing
`kind` or `version`. An empty requirement list is refused rather than read as
"nothing is required", which is the correct direction and worth preserving.

Route-side (`server/research/early-access/routes/ports.ts:93`):

```ts
export interface EarlyAccessAgreementGate {
  accepted(customerRef: string): Promise<boolean>;
}
export class NoEarlyAccessAgreements implements EarlyAccessAgreementGate {
  async accepted(): Promise<boolean> { return false; }
}
```

The default implementation refuses. Nothing is agreed until an agreement source
says so.

**Required pair, per founder decision:** `early_access_terms` / `v1`.

At base SHA that pair appears **nowhere in `server/`**. Wiring it is part of
FABLE-RM's slice, and the review must confirm the exact strings, because a
mismatch in either direction silently changes the gate: a wrong `kind` means
nothing is ever satisfied, and a wrong `version` means a customer who signed v1
is treated as having signed something else.

## 5. Order route behaviour

`server/research/early-access/routes/order-routes.ts`

- `AGREEMENT_REQUIRED` is a declared refusal (`:95`) mapped to **403** (`:117`).
- Ordering of checks (`:697`-`:704`): session, then request shape, then
  identity, then agreements.

The comment states the reasoning and it is correct: the agreement check runs
**last of the four so a caller who is not the customer never learns whether that
customer has signed anything.** Any change that moves the agreement check earlier
turns the endpoint into an oracle for another customer's signing status, and
should be rejected on that ground alone.

## 6. Policy source

`GET /api/research/policies` returns `server/research/policies-data.ts`.

**Use only the `research-use` document.** Founder decision: the `terms` and
`privacy` entries in that same file are marked *"an operational draft for
qualified counsel to replace or approve before production launch"* and must not
be presented as accepted legal text.

Fields the client must display for `research-use`:

```
title      "Research Use Policy"
updated    "July 2026"
sections[] { heading, paragraphs[], bullets?[] }
```

Four sections: Purpose, Prohibited use (with five bullets), Order review,
Communication. Render them as given. **Do not paraphrase, truncate, reorder or
add language.**

---

## 7. Focused test matrix

Ten cases. Each names what fails if it is missing.

| # | case | expected | why it matters |
|---|---|---|---|
| 1 | unauthenticated acceptance | refused, nothing written | an unauthenticated caller must not be able to sign on anyone's behalf |
| 2 | wrong agreement kind | refused | a typo'd kind would satisfy nothing while looking accepted |
| 3 | wrong version | refused | a v2 acceptance must not open a v1 gate, or the record says the customer agreed to text they never saw |
| 4 | correct acceptance | recorded once, gate opens | the happy path |
| 5 | repeated acceptance | **exactly one row**, second call returns `false`, no error surfaced as failure | a double-click must not create two records or a 500 |
| 6 | evidence persisted | `evidence` present and containing **no secret, no raw token, no unintended PII** | the column is unconstrained, so this is the only guard |
| 7 | gate before acceptance | order refused **403 AGREEMENT_REQUIRED** | the whole point |
| 8 | gate after acceptance | order proceeds past the agreement check | proves the gate reads the row it wrote |
| 9 | wrong price after acceptance | **409 PRICE_CHANGED** | proves acceptance does not weaken price authority |
| 10 | wrong-price smoke | **no order, payment, receipt, supplier order, commission or shipment created** | a refusal that leaves debris is not a refusal |

Cross-customer case worth adding: **customer A accepting must not open the gate
for customer B.** The unique key is per `customer_ref`, so this should hold by
construction, and a test makes it stay true.

---

## 8. Production smoke sequence

Read-only except for one acceptance write, which is the deliberate exception.

```
A. Before acceptance
   POST /api/research/early-access/orders  ->  403 AGREEMENT_REQUIRED

B. Accept
   early_access_terms / v1

C. After acceptance, submit expectedUnitPriceCents wrong by ONE cent

D. Expect
   409 PRICE_CHANGED

E. Confirm no order, payment, receipt, supplier order, shipment or
   fulfillment record was created
```

Step C is chosen deliberately: **one cent** is the smallest value that proves the
comparison is exact rather than approximate, and it cannot be mistaken for a
rounding artefact.

Run `AGREEMENT_PRODUCTION_POST_STATE.sql` after step E. Every query in it is a
`select`.

---

## 9. Can a correctly priced order draft be created safely?

**Yes, and the reasoning should be checked rather than taken from me.**

At base SHA, order placement creates the placement, money snapshot and invoice.
It does **not** verify payment, create a receipt, release a supplier order, or
hold commission: those happen only in the admin confirm path, which requires a
named verifier role and an explicit action. Payment verification is what creates
the receipt and the supplier order, exactly once, atomically.

So a correctly priced draft parks at `awaiting_payment` with money in nobody's
hands. **The one caution:** it consumes an order number and creates a real
invoice with a real payment reference. If a smoke run creates one, it must be
recorded so it is not later mistaken for a customer order, and the SQL file
includes a query to list any order created during the window.

**Recommendation: do the wrong-price smoke first.** It proves the gate and the
price authority while creating nothing at all. Only create a correct draft if the
founder wants the invoice path exercised end to end tonight.

---

## 10. Exact-SHA review protocol

On a successor SHA from FABLE-RM: inspect that exact SHA, review every changed
file, run only the focused agreement and order-gate tests, return **ACCEPT** or
**CHANGES_REQUIRED** with reproductions. **This lane does not edit the
candidate.** A reviewer who repairs what they review has reviewed nothing.

---

# ADDENDUM: the accepted repair contract

Defect accepted as release-blocking. The repaired server slice must satisfy all
of the following, and the review will check each one against the exact SHA.

| condition | required response |
|---|---|
| first acceptance | **200 `RECORDED`** |
| duplicate identical acceptance | **200 `ALREADY_RECORDED`** |
| genuine persistence failure | **502** |

Plus, unchanged from the current slice and re-verified rather than assumed:

- exactly one acceptance row per `(customer_ref, kind, version)`
- **no migration change** — the RPC and table are already correct; the defect is
  entirely in how the caller reads a `false`
- session identity preserved: `customerRef` only from the resolved session
- server-authored `acceptedAt`
- server-authored `evidence`
- order gate ordering unchanged: session -> shape -> identity -> agreement

## Why "no migration change" is the right call

The RPC's `false` on `unique_violation` is a **correct and useful** answer: it
distinguishes "inserted" from "already there" without raising. The defect is that
one boolean was carrying three outcomes and the caller collapsed two of them into
failure. Repair belongs in the recorder and the route, not the database. Any
successor that alters the migration to "fix" this should be questioned: it would
change a working append-only guarantee to paper over a caller bug.

## What the idempotency test must now do

The current test cannot fail, because its stub returns `true` on every call. The
repaired test must exercise **the real false-on-duplicate contract**: a recorder
that answers `true` then `false`, asserting **200 both times** with distinct
outcome codes, and a separate recorder that signals genuine failure asserting
**502**. If the repaired test still passes with a stub that always returns
`true`, the defect is not fixed, only hidden.

## Comment corrections required

- `agreement-routes.ts` — remove or correct *"The RPC upserts on (customer_ref,
  kind, version)"*. It does not upsert.
- `agreement-routes.test.ts` — the row-uniqueness comment is true about the row
  and silent about the return value, which is what the handler branches on.
- `register.ts` — *"neither is read from the body, where a caller could write
  anything"* is narrow: `x-request-id` is a caller-writable header. Either bound
  the value or state the limit accurately.
