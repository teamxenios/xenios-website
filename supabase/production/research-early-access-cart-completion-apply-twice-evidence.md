# Apply-twice evidence: research_early_access_cart_completion (migration 60)

This is the evidence behind `applyTwiceVerified: true` in
`docs/coordination/MIGRATION_DAG.json`. It was not set because the migration
looks additive. It was set because both database shapes below actually ran.

| Field | Value |
| --- | --- |
| Migration | `supabase/migrations/20260808100000_research_early_access_cart_completion.sql` |
| Checksum (sha256) | `5777518b5f269908212024d8a3b97c9e41b83bbc76d2e60c4589d40099737bb8` |
| Companion, migration 58 | `supabase/migrations/20260807193000_research_early_access_cart_checkout.sql`, sha256 `8bf36cedb3cfe523f77c2853a5ea259859c7d067825b846dc8602ba9dbcdbe3b` |
| Engine | PostgreSQL 16.14 (`postgres:16-alpine`), container `xenios-early-access-pg16` |
| Databases | `ea_shape_a` and `ea_shape_b`, both created disposable for this run |
| Production touched | NO. No production SQL was applied and no live database was read or written. |

The candidate pair is migration 58 followed by migration 60. "Apply twice"
below means the candidate pair was applied, then applied again over itself,
with `ON_ERROR_STOP=1` and psql's own exit status recorded (never a pipeline's).

## Migration 59 is not here on purpose

Migration 59 (`20260807200000_research_affiliate_access_and_portal_v2`) has a
timestamp between 58 and 60 and is deliberately absent from both shapes. A
timestamp is not a dependency. Migration 60 mentions `affiliate`, `commission`,
`payout`, `accrual` and `referral` zero times, and both shapes prove the cart
works without it. Migration 59 remains PENDING.

## Shape A: the full chain, migration 54 present

Prerequisites, each `psql exit 0`:

```
20260804120000_research_early_access_identity_persistence.sql
20260804121000_research_early_access_commerce_persistence.sql
20260804122000_research_early_access_supplier_operations.sql
20260804123000_research_early_access_reservation_holds.sql
20260804130000_research_early_access_unit_holds.sql          <- migration 54, PRESENT
20260804140000_research_early_access_settled_transaction_refs.sql
```

| Step | Result |
| --- | --- |
| Prerequisites | psql exit 0 |
| Candidate (58, 60), first application | psql exit 0, exit 0 |
| Candidate (58, 60), second application | psql exit 0, exit 0 |
| Behavioural suite | 45 assertions, all PASS, psql exit 0 |

## Shape B: production shaped, migration 54 ABSENT (release critical)

Production does not have migration 54, so this is the shape that decides
whether the release is safe. Prerequisites, each `psql exit 0`:

```
20260804120000_research_early_access_identity_persistence.sql
20260804121000_research_early_access_commerce_persistence.sql
20260804122000_research_early_access_supplier_operations.sql
20260804123000_research_early_access_reservation_holds.sql
```

Migration 54 was never applied, and migration 55
(`settled_transaction_refs`) is omitted with it because it depends on 54, which
is exactly the pair production is missing.

Absence proven before the candidate ran, not assumed:

```
unit_hold tables:     0
unit_hold functions:  0
any hold-named routine: NONE
```

| Step | Result |
| --- | --- |
| Prerequisites | psql exit 0 |
| Candidate (58, 60), first application | psql exit 0, exit 0 |
| Candidate (58, 60), second application | psql exit 0, exit 0 |
| Behavioural suite | 45 assertions, all PASS, psql exit 0 |
| Hold-named routines after the candidate | still 0, so nothing created or required one |

## The two shapes produce an identical cart

The only objects that differ between Shape A and Shape B belong to migrations
54 and 55 themselves. The cart surface is byte-for-byte the same posture:

Tables present only in Shape A: `research_early_access_unit_holds`.
Functions present only in Shape A: the six unit-hold routines, the two supplier
confirmation routines, and `research_early_access_settled_transaction_refs`.
Nothing exists only in Shape B.

| Cart surface | Shape A | Shape B |
| --- | --- | --- |
| Cart tables | 10 | 10 |
| Row-level security enabled | 10 / 10 | 10 / 10 |
| Row-level security FORCED | 10 / 10 | 10 / 10 |
| `anon` may SELECT any cart table | 0 | 0 |
| `authenticated` may SELECT any cart table | 0 | 0 |
| `service_role` may SELECT any cart table | 0 | 0 |
| Cart RPCs (excluding trigger functions) | 11 | 11 |
| `anon` may EXECUTE any cart RPC | 0 | 0 |
| `authenticated` may EXECUTE any cart RPC | 0 | 0 |
| `service_role` may EXECUTE cart RPCs | 11 / 11 | 11 / 11 |

Two functions do carry the PostgreSQL default of PUBLIC execute:
`research_early_access_cart_immutable` and
`research_early_access_cart_completion_immutable`. Both are trigger functions
taking no arguments, and PostgreSQL refuses a direct call with "trigger
functions can only be called as triggers", verified by attempting it as `anon`.
They are not a reachable surface.

Note worth carrying forward: even `service_role` has no direct table privilege
on any cart table. The server reaches the cart only through the eleven reviewed
SECURITY DEFINER routines, so there is no ad-hoc write path at all.

## What the behavioural suite proved, in both shapes

Durability and purity:

- a quote persists durably and reads back
- a quote creates ZERO durable checkout facts

One cart, one payment:

- the cart commits atomically
- exactly one parent checkout, all child lines, exactly one invoice
- exactly one payment reference for the whole cart

Idempotency:

- the checkout is found by its idempotency key
- the same key under a second cart is refused
- the refused replay wrote no second parent, no extra child, no second invoice

Atomicity, forced rather than inferred. The third child of a three-line cart
was made to collide with an existing child order number, so the function failed
only after two children would otherwise have landed:

- no parent checkout survived
- no child line survived
- no invoice survived
- no settlement, receipt, supplier release or supplier outbox row survived
- the earlier cart was untouched and kept exactly its own children

Proof is not payment:

- external proof metadata is recorded
- and still: no settlement, no receipt, no supplier release
- status still reports `paid: false`

Settlement:

- a named admin settles the cart
- exactly one settlement, exactly one receipt
- every child released, one release each
- mixed suppliers: each child kept its own real supplier, and no supplier SKU
  was invented or blanked to make grouping succeed
- the supplier outbox received the release
- the settlement records the named actor

Settlement retry:

- refused as `already_settled`
- still exactly one settlement, no second receipt, no duplicate child release,
  no duplicate supplier outbox entry

Ownership:

- the checkout carries the owning customer reference the server re-checks
- a checkout number that does not exist reads as null

F2, affiliate non-activation:

- the settled cart created ZERO commission events
- the settled cart created ZERO referral grants
- the affiliate v2 platform (migration 59) is absent

The commission and referral tables DO exist in both shapes. They belong to
migration 51, the pre-existing single-product referral lane, and predate the
cart. The claim tested is therefore not that they are absent, which was never
true, but that a complete cart settlement wrote nothing into them.

## Reproducing this

The behavioural suite is checked in at
`supabase/production/research-early-access-cart-completion-verification.sql`,
so this evidence is repeatable rather than a claim about a session that has
ended. Against a PostgreSQL 16 container with the `anon`, `authenticated` and
`service_role` roles created:

```bash
docker exec CONTAINER psql -U postgres -c "create database ea_shape_b;"
```

Apply the Shape B prerequisites, then the candidate pair twice, each with
`-v ON_ERROR_STOP=1`, then:

```bash
docker exec -i CONTAINER psql -U postgres -d ea_shape_b -v ON_ERROR_STOP=1 -q < supabase/production/research-early-access-cart-completion-verification.sql
```

Every assertion raises on failure, so psql's own exit status is the result.
Read that status directly and never a pipeline's: piping into `tail` or `grep`
reports the exit code of `tail`, which is how a failing suite can look green.

The script is written for a FRESH database and is deliberately not idempotent:
rerunning it against an already-exercised database fails on the first quote,
because that quote already exists. Drop and recreate the database between runs.
