# Member catalog and product detail presentation `e0a7d47` / `9737db7`: bounded delta review against doc 35

**SOURCE: REVISION REQUIRED.** The successor is confined to its four presentation files and adds no price, purchase,
mutation, network or eligibility behaviour. Most of what it claims hand-simulates correctly:
- filters reconciled to the supplied collection;
- query and sort kept across failed reads;
- locale-pinned tie-breaks;
- a selection that belongs to the current product;
- facts shown, or "Not provided".

Most of its new tests would fail on the predecessor, so they test the change.

But changing the product-unavailable title breaks two assertions in an unchanged subscription test. That test belongs
to the 17-file set that doc 35 accepted, sits outside this owner's lease, and the records do not disclose the break.
Two of the packet's copy claims are also not true of the rendered surfaces. Everything is NOT RUN.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (board task
`CATALOG_DETAIL_PRESENTATION_REVIEW_20261008` r1, acknowledged at `9e6b601`).

Method:
- three read-only lenses, each with an adversarial verifier: the catalog component; the detail component; tests,
  scope and records;
- a completeness check;
- my own confirmation of the blocking defect against the source.

Every verifier upheld every lens finding. The subject was never executed. Lens output archived as
`hl12/56_catalog_detail_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `e0a7d4787071140a25a984edc4c0a49f0d7c22ab`, tree `340248360ac85f50f10ed5890624401616f792fd` ("fix: reconcile catalog filters and exact product detail presentation"), parent `20a2305` (records-only lease narrowing) |
| Delta | exactly `MemberCatalogExperience.tsx`, `MemberProductDetailExperience.tsx` and their two test files under `client/src/research/products-diagnostics/`; nothing in `server/`, `shared/`, `supabase/`, packages, scripts or protected paths |
| Records | `9737db71014d1073ec5ffe9a78b2a1c491220813`; the owner has since added records-only `0dbfaf5`, whose lease no longer covers the four source paths (D-9) |
| Predecessor | `756a906`, accepted in doc 35 |
| Hashes | blob ids and raw SHA-256 of all four files recompute equal to the coordinator checkpoint and `source-bindings.json` |
| Authority | directive `94485a6`, section 4 (Workstream B); the changes fall inside it, apart from D-2 |

## 2. What holds (inspected source, NOT RUN)

**Catalog.**
- **One collection.** Facets, counts and cards come from the same supplied collection, so an item in a category the
  server list omitted is now reachable.
- **Filter reset.** An invalid filter resets only after a successful read and never comes back.
- **Kept state.** Query and sort survive failed reads.
- **Sort ties.** Ties break by slug, then id, under a fixed `'en'` collation.
- **Clear filters.** The button now also covers a sort-only change.

**Detail.**
- **Selection.** It belongs to the current product. A removed variant does not silently reappear, and another
  product's SKU, price or media is not shown.
- **Facts.** Supplied strength, form, size and presentation are shown; absent facts read "Not provided".
- **Status.** Catalog status and variant availability are separate.

**Both.**
- **No commercial or clinical additions.** No new price, availability, eligibility, purchase or clinical claim, and no
  new network call, mutation or retry.
- **Unchanged.** Price formatting, media handling, the read boundary and the supplied retry are unchanged.

## 3. Blocking defect (P1, verified)

| ID | Defect | Smallest correction |
| --- | --- | --- |
| D-1 | `MemberProductDetailExperience.tsx` changes the unavailable title from "This product is not available." to "Product information is unavailable.". `pages/member/product-subscribe.test.tsx` is unchanged. Through `ProductPage`, which renders this component, it still asserts the old text at lines 117 and 183, on the unavailable path and the slug-mismatch path. Both assertions would fail. That file is in doc 35's accepted 17-file subscription set (`integration-subscription17-run1-start.json` at `38c7239`, 401 passed). It is outside this owner's lease, and the packet and records do not mention it. Accepting the source as-is would reopen an accepted closure. | Either keep the route-level title in this slice and leave the change to the ProductPage owner, or update lines 117 and 183 under recorded authority from that file's owner, keeping the assertions that nothing is substituted. In either case, record the affected test set. Preferably choose wording that also fits a definitive not-found (D-5). |

## 4. Other findings (verified)

**P2, fix before release qualification:**
- **D-2. Two copy claims are not true of the rendered nontransactional surfaces.** These strings are still rendered:
  - "Pricing shown after clinical review" (detail lines 26 and 225; catalog lines 86-87);
  - the supplier-pending panel, "Supplier confirmation pending" and "Awaiting documentation", on lanes that cannot have
    variants;
  - "Price on request" on every program card.

  A new catalog test (line 376) and an existing detail test (line 323) pin the pricing string, against directive
  lines 252-253. All of this is carried from the predecessor, not introduced. Either get your copy decision for
  nontransactional and clinical lanes and then fix the copy inside the four paths, or narrow claims (6) and (7) and
  record the copy as held.

**P3, may be carried as limits:**
- **D-3. Client copy diverges from the server.** The new clinical copy overrides the server's canonical
  nontransactional summary on the catalog card. The detail page's "clinical pathway information... require separate
  confirmation" presumes a path the catalog wording avoids. Align both with the server's "Research catalog pathway"
  framing, or record approved copy.
- **D-4. Link names can still collide.** "Distinct accessible names" fails by construction for program items. The
  adapter names every one "Research program", so two cards share a link name. This is still better than before.
- **D-5. Not-found reads as a load failure.** The new unavailable body also appears for the server's definitive
  `product_not_found` and for inactive-membership denials. It reads as a failed load, with no retry and no way back.
- **D-6. Status pairing.** In the live projection, catalog status is never "Available". A stocked item therefore shows
  "Catalog status: Unavailable" beside "Variant availability: Available". This needs a presentation decision.
- **D-7. Focus after clearing.** "Clear filters" removes itself when activated, so focus falls to the page body. The
  sort-only path is new.
- **D-8. Tests and claims.** Several tests do not discriminate, or use fixtures the adapter would reject. Two test names
  still say "keyboard". The layout and announcement claims are markup-only; no browser, zoom, forced-colors or
  screen-reader evidence exists at this commit.
- **D-9. Records.** The records list doc 35's holds only in part, omit the before/after copy table the directive
  requires, and the four paths are no longer leased at `0dbfaf5`.
- **D-10. Carried, outside the four paths.** A zero price under an "Available" badge, and an adapter-accepted
  malformed currency that would throw on render.

## 5. Disposition

- Subject: `e0a7d4787071140a25a984edc4c0a49f0d7c22ab` (tree `34024836…`), records `9737db7`.
- **SOURCE: REVISION REQUIRED** on D-1. No P0.
- **What does not change:**
  - Doc 35's acceptance of `756a906` and its holds stand.
  - Doc 54's PS-R4 wording acceptance stands; it concerns other strings.
- **Smallest next action for the same owner:**
  1. Re-lease the four paths.
  2. Resolve D-1 by one of the two routes above.
  3. Narrow or fix the D-2 claims.
  4. Amend the records: affected test set, literal before/after copy table, doc 35 holds listed in full.
  5. Return the exact successor here.

  The P3 items may travel as limits.
- **Before release qualification, under fresh authority:**
  - the two changed tests, the 17-file and 36-file sets, the Products and ProductPage route tests, the typecheck, the
    no-em-dash gate and the build;
  - browser, keyboard, focus and screen-reader qualification of both routes at 320, 375, 767 and exact 768 pixels,
    native 200% and 400% zoom, and forced colors;
  - your copy decisions;
  - every doc 35 hold.
