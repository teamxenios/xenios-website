# Early Access agreement: exact-SHA deploy and rollback checklist

Read-only artifact. This lane does not deploy. Every step below is written for
the operator who does, and each one names what proves it worked.

Server repair reviewed and **ACCEPTED** at `4cac93c288ef1ee6a2f6e3931991240dc8fa6e93`.
UI reviewed and **ACCEPTED** at `7955f22890e6dc7652d73a2fe9f83624aec06d03`.

**Post-state SQL:** run the two verified evidence files, not this lane's
retracted one. `docs/early-access-release/evidence/AGREEMENT_POST_STATE.sql`
for the agreement and money proof, and `PRODUCT_CONTROL_POST_STATE.sql` for the
catalogue. Run `AGREEMENT_POST_STATE.sql` check 11 **before** the smoke as well
as after: it is a total count, so an after-only run proves nothing.

---

## Pre-flight, before anything moves

| # | check | proof |
|---|---|---|
| P1 | **Auto-Deploy is OFF** | dashboard shows it off before the deploy, not after |
| P2 | `RESEARCH_EARLY_ACCESS_ENABLED=false` | verified **by name**, never by printing a value |
| P3 | The SHA about to deploy is the exact accepted UI SHA | compare full 40-char SHA, not a branch name |
| P4 | Product Control post-state matches | 19 products / 22 variants |
| P5 | Storefront post-state matches | 22 visible / 18 purchasable / 4 held |
| P6 | Rotated password hash and session secret are configured | by name only |

**P1 first and on its own.** With Auto-Deploy on, any later push to the branch
ships itself, and every SHA guarantee below stops being true the moment someone
else commits.

## Deploy

| # | step | note |
|---|---|---|
| D1 | Deploy the exact accepted SHA **dark**, flag still false | the flag is the gate, not the deploy |
| D2 | Set `RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS=[{"kind":"early_access_terms","version":"v1"}]` | exact JSON; a malformed value makes the gate refuse everyone, which fails closed but looks like a bug |
| D3 | Restart **only after** the env save is confirmed | a restart before the save loads the old value and every later check tests the wrong thing |
| D4 | Confirm the route is mounted | `POST /api/research/early-access/agreements/accept` reachable |
| D5 | Re-confirm P4 and P5 **after** the restart | deploy must not have moved catalogue state |

## Production smoke, in this order

Order matters: each step's meaning depends on the previous one.

| # | step | expected |
|---|---|---|
| S1 | Order attempt **before** acceptance | **403 AGREEMENT_REQUIRED** |
| S2 | Accept `early_access_terms` / `v1` | **200**, `alreadyAccepted: false` |
| S3 | Accept the same pair again | **200**, `alreadyAccepted: true` |
| S4 | Order with `expectedUnitPriceCents` wrong by **one cent** | **409 PRICE_CHANGED** |
| S5 | Run `evidence/AGREEMENT_POST_STATE.sql` (and its check 11 before the smoke too) | one acceptance row; no order; no money row; no supplier release |
| S6 | Cagrilintide | visible, **no price**, no purchase control |
| S7 | NAD+ 1000 mg | **AVAILABLE at $100.75** |

**S3 is the step that would have caught the repaired defect in production.** Run
it even though the unit tests now cover it: a 502 here means the deployed build
is not the reviewed one.

**S4 uses one cent deliberately.** It is the smallest value that proves the
comparison is exact rather than approximate, and it cannot be mistaken for a
rounding artefact.

## Correctly priced order draft, only if the founder wants it

Safe to run: placement creates the placement, money snapshot and invoice. It
does **not** verify payment, create a receipt, release a supplier order, or hold
commission. Those happen only in the admin confirm path, behind a named verifier
role and an explicit action.

**It is not free.** It consumes an order number and mints a real invoice with a
real payment reference. If it is run, record the order number immediately so it
is never later mistaken for a customer order.

Verify after: the order sits at `awaiting_payment`, and the money and supplier
sections of the SQL are still empty apart from that one invoice.

## Rollback

| # | trigger | action |
|---|---|---|
| R1 | Any smoke step fails | **stop.** Do not continue the sequence; a later green step over an earlier red one proves nothing |
| R2 | Flag was never enabled | no rollback needed; the feature is dark. Redeploy the prior SHA at leisure |
| R3 | Flag enabled and a defect appears | set `RESEARCH_EARLY_ACCESS_ENABLED=false` **first**, then investigate. Closing the door precedes diagnosing it |
| R4 | Bad SHA deployed | redeploy the last known-good SHA by full 40-char SHA |
| R5 | Acceptance rows written during a failed run | **leave them.** The table is append-only and an acceptance is a true fact about a customer; deleting it would erase evidence that they agreed |
| R6 | An order draft was created and is unwanted | do not delete. Record it, and let the normal cancel path handle it, so the audit trail stays honest |

**R5 and R6 are the ones people get wrong under pressure.** The instinct after a
failed release is to clean up. An append-only acceptance and a real order number
are records of things that actually happened, and removing them makes the next
investigation harder while proving nothing.

**No migration runs in this release.** The RPC and table already exist and were
verified unchanged at `4cac93c`. If any step appears to need a migration, stop:
that means the deployed SHA is not the reviewed one.

## What this lane will not do

Deploy, change an environment variable, run a migration, write to production, or
edit either candidate. Every item above is written to be executed by the release
owner and verified by me from evidence.
