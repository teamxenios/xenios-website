# HANDOFF — PEPTIDE-DIRECT-ORDER-HOLD (claude-fable-s3)

SESSION:      claude-fable-s3
TASK:         PEPTIDE-DIRECT-ORDER-HOLD
BRANCH:       fable/peptide-direct-order-hold-20260821 (pushed)
PUSHED SHA:   b0b228e9c740e219e984a069af07f06e2dd8b4c4
WORKTREE:     C:/xenios-wt/assisted-order-flow
PRODUCTION MUTATED: NO. No server seam, no route registration, no migration,
                    no flag, no email, no deploy.

## READ THIS FIRST — BRANCH ANCESTRY

This branch is based on **your local, UNPUSHED commit
6d9eb587d3714ca802abe5f66b095cad7ba8b801** ("Let the catalog rebuild from the
MASTER CATALOG workbook alone"), not on origin head c371201.

That was deliberate. Your 6d9eb58 rewrites `customer-pathway.ts` by +241 lines
and is the file this change edits. Branching from c371201 would have edited the
pre-rewrite version and handed you a guaranteed conflict. Branching from your
actual commit means my change applies on top of your work as written.

Consequence you should know about: pushing my branch published 6d9eb58 as
ancestry. **If you amend, rebase or drop 6d9eb58, do not merge this branch —
cherry-pick my two commits instead**, they are self-contained:

    2db0f4f  Pin the 141-peptide launch target, and name the row that breaks it
    b0b228e  Hold the one peptide whose composition is unresolved

2db0f4f is a clean cherry-pick of my earlier standalone SHA 68271321. **This
branch SUPERSEDES `fable/peptide-launch-acceptance-20260821`** — integrate this
one only, not both, or you will apply the acceptance suite twice.

## FILES

    shared/research/early-access/customer-pathway.ts        (+~45 / edited)
    shared/research/early-access/customer-pathway.test.ts   (+6 tests)
    shared/research/launch/peptide-launch-acceptance.test.ts (+6 tests, from 2db0f4f +18)
    docs/research-launch/PEPTIDE_LAUNCH_ACCEPTANCE_2026-08-21.md (from 2db0f4f)

## WHAT THIS FIXES — the launch shipped 112 direct, not 111

BUY_NOW was earned from three canonical facts. The founder's rule has four:

    research_peptides_materials + RUO Research + current retail price
    + NO EXPLICIT HOLD

The fourth was missing. The row

    CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)   $99

satisfies all three of the old facts — approved family, channel RUO Research,
approved retail price — and nothing in `shared/`, `server/`, `client/src/` or
`scripts/` excluded it. The storefront would have offered Buy Now on a product
whose component split Xenios cannot state.

## DESIGN — why an input, not a denylist

`directOrderHold?: string | null` is a canonical, server-derived fact about
THIS ROW. The first three facts describe a CATEGORY of product; a hold
describes one variant.

A SKU denylist has to be edited twice: once to add the row, once to remember to
remove it when the split resolves. A canonical hold clears itself the moment
the catalog stops reporting a reason, with no code change — the same property
your classification rule already has, and the reason this is an input rather
than a constant in that file. Your own header comment ("A row becomes
purchasable the moment its classification lands, with no code change and no
list to edit") is why I did not reach for a list; I extended that sentence to
cover the hold.

Properties, each covered by a test:

- **A hold is not a refusal.** A held row still appears, still shows retail
  price, and still routes to `assisted_order`, so the customer can REQUEST it.
  It just does not take money before we can describe it.
- **Blank text is not a hold.** Empty / whitespace-only clears, so a blank
  catalog column cannot quietly pull 111 products off sale.
- **A hold only ever subtracts.** The check sits inside the
  `direct_order_request` branch, so an absent hold can never lift a row out of
  Care, classification review, availability review or request-pricing.

## YOUR REMAINING WIRING — the one thing this does NOT do

The rule now accepts the fact; **nothing yet supplies it.** `directOrderHold`
is optional and defaults to no-hold, so this commit is behaviour-neutral until
the catalog projection populates it. That was deliberate — the catalog
authority is s7's lease (`shared/research/master-offerings/**`,
`server/research/catalog/**`), not mine, so I did not write into it.

To close the P0 end to end, one of:

1. **Preferred** — the catalog projection sets
   `directOrderHold: "composition_unresolved"` for the CJC row, sourced from a
   canonical column, and passes it into `earlyAccessCustomerPathway`.
2. **Interim for launch** — derive it where the pathway input is built, from
   the specification text matching `/split pending|pending split|tbd|unresolved/i`.
   My acceptance suite uses exactly that predicate, so the two agree, and it
   catches a second such row the day one is added.

Either way my suite already asserts the direct target is 111, so the wiring
verifies itself the moment it lands.

## CANONICAL TARGET PINNED (founder, 2026-08-21)

    141 source rows  -> 139 canonical variants
    112 RUO source   -> 111 direct + 1 held
     29 pending rows ->  27 unique pending      (111 + 1 + 27 = 139)

Asserted separately from the source-row counts, because a reconciliation that
silently drops a real product and one that correctly collapses a duplicate both
change the count, and only one of them is right.

Both collapsing duplicates (`Hexarelin (5mg)`, `Oxytocin (10mg)`) are on the
PENDING side, so the collapse never removes a directly orderable row. The suite
also asserts the RUO side of each pair survives — collapsing to the pending row
instead would take a product that is orderable today and make it un-orderable,
a revenue regression dressed up as a cleanup.

## TESTS

    npx vitest run shared/research/launch shared/research/early-access --pool=threads
    -> 7 files, 103 tests, all passing

New: 6 hold tests in customer-pathway.test.ts, 6 canonical-target tests in
peptide-launch-acceptance.test.ts.

**Mutation-checked both ways**, per your "make the tests able to fail"
standard:
- replacing `!hasDirectOrderHold(input)` with `true` -> 3 failures
- flipping 139 -> 140 and 27 -> 26 -> 3 failures, each reporting the true value

## BLOCKERS

None for this branch. One dependency for the P0 to actually close: the catalog
projection must supply `directOrderHold` (see wiring above). That path is under
s7's lease, so it needs either s7 or your delegation.

## STILL OPEN FROM MY EARLIER LANES

- `0b9c24eb` (fable/assisted-order-s9-defects-20260820) pushed, still unmerged:
  member Supabase JWT never sent, so a signed-in member was anonymous to the
  assisted-order doors AND saw "Price on request" instead of approved member
  prices; plus iOS 16px inputs and raw family enum labels.
- `clearAssistedOrderStorage` still has zero call sites, so Early Access
  sign-out leaves the previous customer's status token and draft on a shared
  machine. One import plus one call in `EarlyAccessRoute.tsx` (lead seam).
