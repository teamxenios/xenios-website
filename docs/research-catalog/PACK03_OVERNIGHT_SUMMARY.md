# Pack 03 overnight summary

**SESSION ROLE** — BUYER-A, the full catalog display, search and pricing lane.
Branch `lane/pack03-full-catalog-search-pricing`, worktree `C:\xenios-wt\pack03-catalog`,
base `851d4b05` (frozen Catalog Foundation).

**PRODUCTION MUTATED: NO.** Nothing deployed, no production SQL, no migration applied, no
commerce flag enabled, no secret touched, no signature, no attestation. The lane is still
unmounted and still absent from the production bundle, verified against a real build.

---

## SHAs

```text
STARTING SHA   c2e65f007d884731895f7e3b5ed251323d96bca2
ENDING SHA     see HANDOFF.json at the worktree root
BRANCH         pushed to origin after every commit
```

**COMMITS CREATED TONIGHT**

| SHA | What |
| --- | --- |
| `024deca` | Detail surface, cart handoff, named-member breadth grant |
| `0573a0f` | Separator-free search fix, adversarial search, accessibility audit |
| `f308f54` | Typechecked wiring factory, proven end to end |
| this one | Recreation packet and this summary |

---

## FEATURES COMPLETED

**The exact-variant detail page.** `MasterOfferingDetailSurface` fetches by family and
slug, so a shared or bookmarked deep link works cold with nothing but the URL. Skeleton
while loading, an honest state for every refusal, a retry only where retrying can help,
and a response for a product the member already left is dropped rather than rendered.

**The handoff into the cart that already exists.** `catalog-cart-handoff.ts` is not a
cart: no line, no total, no persistence, no pricing rule. It takes the `add_to_cart` action
the server already resolved, checks the quantity against the injected capability, and hands
an exact-variant request to whatever the composition root injects. Every field comes from
the action, so a catalog row cannot reach the cart on its own.

**The wiring as a factory.** `createMasterOfferingCatalogDependencies` replaces the
composition paragraph with code that stops compiling when it drifts. It enforces two
things rather than asking for them: a new service per request, so the price memo cannot go
stale; and one identity resolved once and shared, so a price and a purchase verdict can
never describe two different instants.

**The named-member breadth grant, proven.** An allowlisted address sees the full breadth, a
near miss does not, an unset or misspelled variable grants nobody, and the grant changes
which records are listed without touching price, action, or purchase verdict.

**A structural accessibility audit** over both surfaces, and an **adversarial search pass**.

---

## BUGS FOUND, AND FIXED

**1. `bpc157` matched nothing.** Real, and a buyer would have hit it on day one. `BPC-157`
normalizes to the two tokens `bpc 157`; `bpc157` normalizes to one token that is not a
substring of the two, so the search returned zero results for a spelling people actually
type. Research names are alphanumeric codes typed from memory. Fixed by memoizing a
space-stripped haystack alongside the normal one and matching a token against either; a
separator-free spelling of the exact name now scores as an exact name. Pinned by test.

**2. Search cost 39.6ms per query at full catalog scale** (earlier in the session, kept
here because it is the same defect class). Every query re-normalized the full text of all
1,121 offerings. Memoized per offering object in a `WeakMap`, which needs no invalidation
because a regenerated dataset produces new objects. Now 6.0ms. A hundred-search regression
guard fails above two seconds.

**3. The lane had nothing to show** (earlier in the session). The only catalog reader was
the in-memory one used by tests, so a fully mounted catalog would have served zero
offerings. `dataset-reader.ts` is the production reader.

Nothing was found that required weakening a security boundary, and none was weakened.

---

## TESTS RUN, AND RESULTS

```text
npx tsc --noEmit                                      PASS
lane suite, 31 files                                  PASS, 231 tests
whole repository, --testTimeout=30000                 PASS, 524 files, 8,476 tests, 27 skipped
node script/build.mjs                                 PASS
grep for the lane in dist/public/assets, dist/index.cjs   no match, as required
```

Adversarial coverage added tonight: regex metacharacters in the search box, a
catastrophic-backtracking shape, full-width paste, Greek alpha folding, token narrowing,
order-independent ranking, double and triple click on Add to Cart, concurrent adds of
different variants, a cart that throws mid-add, a cart refusal code, quantity 1 / 20 / 21 /
49 / 50 accepted and 51 refused, a Care pathway that cannot become a checkout, a stale
detail response after navigation, and a near-miss email against the breadth allowlist.

---

## QUANTITY 50 STATUS

**Green in this lane, and structurally incapable of a threshold.**

This lane owns no quantity constant and never has, so it follows the injected authority to
50 with no code change. The stronger property is pinned: quantity is not an input to action
resolution anywhere in the catalog, so no quantity can turn a purchase into a review. The
band walks 1, 2, 19, 20, 21, 25, 49, 50 and the action, label and CTA count never move. 51
is refused, not clamped, and the field keeps showing what the buyer typed.

**Not green elsewhere, and not this lane's to fix.** The exact stale constraints are named
with file and line in `QUANTITY_1_50_STALE_CONSTRAINT_REGISTER.md`: the two-ceiling domain
and its `manual_review` route on the quantity-50 candidate, the test that pins
`toBe(20)`, the M65 database checks needing M66, and the append-only founder
`approvedQuantityLimit` that is the only real ceiling. Two of those are human gates.

---

## KRIS IMPACT

His canonical identity belongs to the Pack 02 lane, which recorded his organization's email
and his existing Supabase Auth UID in its own human-gated binding runbook. **This lane
restates neither, and no test here contains them**, because duplicating an identity across
lanes is how two systems start disagreeing about who someone is.

What this lane delivers for his journey: the full member-safe catalog, search, filters,
pagination, detail, variant selection, customer-facing price where one is approved,
quantity 1 to 50, and the handoff into the existing cart. What it does not deliver, by
design: authentication, the account, the cart itself, checkout, orders, history, payment,
fulfillment. Those are other lanes, reused rather than rebuilt.

---

## CATALOG IMPACT

The catalog is code-complete and integration-ready at 1,121 offerings and 1,181 variants of
scale, verified through the production reader: first page 0.95ms, page 40 of 47 0.85ms,
search 5.97ms, detail 0.24ms, full 1,181-row price list export 15.5ms. Twenty-four cards
per page; the full catalog never enters the first DOM. Deep links, back and forward, and
refresh all work.

---

## ACCOUNT IMPACT

None, deliberately. This lane creates no authentication, no account, and no session. It
consumes `authorizeViewer` from the composition root and an identity from the authenticated
session, and it fails closed when either is absent.

---

## LEGAL IMPACT

None. This lane is not the legal lane. It signed nothing, prepared no attestation, and
touched no legal file. Founder Binding was not replayed, recreated, or referenced.

---

## TRUE HUMAN BLOCKERS

1. **The runtime dataset does not exist.** The foundation left the generated member-safe
   payload under the ignored `.local` boundary. Until someone runs the builder against the
   private intake workbook, a mounted catalog answers 503. This is the blocker for Kris
   seeing anything, and it is not a code gap. The lane must not fabricate it.
2. **`FINAL_EA_FAST_FOLLOW_BASE` does not exist**, so every result above is pre-freeze
   evidence that expires at recreation.
3. **Product Control has zero exact-variant bindings**, so no approved price can display or
   export yet. Creating them is a commerce-authority action.
4. **Quantity 50 in the database needs M66**, an irreversible migration requiring named
   human release authority, plus a founder append to `approvedQuantityLimit`.
5. **Mounting** is the composition-root owner's call under Pack 09.

---

## EXACT MORNING ACTIONS FOR SAMUEL

Roughly fifteen minutes, in this order. None of it is engineering.

1. **Generate the dataset.** Put the private intake workbook where the builder expects it,
   then:
   ```bash
   npx tsx scripts/research/build-master-offerings.ts .local/research/master-offerings/private-intake.json
   npx tsx scripts/research/verify-master-offerings-dataset.ts .local/research/master-offerings/generated/member-safe-master-offerings.generated.json
   ```
   The second command prints the real counts and fails if the file disagrees with itself.
   **This answers "is it really 1,121 and 1,181".**
2. **Decide the manual purchase CTA copy.** `RESEARCH_MASTER_OFFERINGS_MANUAL_PURCHASE_REQUESTS=true`
   is what business priority 7 is asking for: a useful order path instead of a dead card. It
   is off only because it promises a person will pick the request up.
3. **Confirm Kris's allowlist value** from the Pack 02 artifact, for
   `RESEARCH_FULL_CATALOG_MEMBERS`.
4. **Everything else waits on the legal critical path** and on `FINAL_EA_FAST_FOLLOW_BASE`.

Nothing here requires reading terminal history. The handoff carries the file list and the
evidence; `PACK03_RECREATION_PACKET.md` carries the replay; the constraint register carries
the quantity work other lanes owe.

---

## NEXT MILESTONE

Recreation onto `FINAL_EA_FAST_FOLLOW_BASE` the moment it exists, then re-prove the four
commands in the recreation packet, then hand to the composition-root owner. Until then the
lane has no unblocked work that would not be speculation: the remaining items all wait on a
dataset, a base, a binding, or a human gate.
