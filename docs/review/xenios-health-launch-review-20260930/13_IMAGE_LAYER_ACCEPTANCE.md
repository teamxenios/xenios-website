# Acceptance bar for the catalog image layer (review baseline at `3e47f92`)

**Prepared:** 2026-09-30, before any Codex image work exists.

**Method:**
- Three read-only traces: surfaces, infrastructure, truthfulness.
- Each was adversarially verified: 74 claims confirmed, 4 refuted.
- Claude re-checked the three plan-changing items at the cited lines, marked **(Claude re-verified)**.

**Scope:** the image layer is judged against this document when Codex lands it.

## A. Facts at `3e47f92` that change the plan

| # | Fact | Evidence | What the image layer must do |
| --- | --- | --- | --- |
| A1 | **There is an explicit "no product photography" policy, pinned by tests.** The Early Access card comment says "a wrong image on a research product is worse than none". The test asserts zero `img`, `picture` and `svg` elements, and no media placeholder. **(Claude re-verified)** | `client/src/research/early-access/EarlyAccessProductCard.tsx:198-204`; `EarlyAccessProductCard.test.tsx:389-404`. Similar no-img assertions: `EarlyAccessOrderSummary.test.tsx:193`, `EarlyAccessCustomerForm.test.tsx:241`, `PaymentMethodSelector.test.tsx:248`. | Reverse it **deliberately**. Cite the 2026-09-30 founder scope change in the code comment and the tests. Replace "no image" assertions with "right image or truthful fallback" assertions. Do not delete them silently. |
| A2 | **Product imagery rights and provenance are an open gap (GAP-024, S2).** The approved Product Purchase Terms say "Images may be illustrative." | GAP-024 record; Purchase Terms (verified by the truthfulness trace) | Every rendered asset records its provenance (generator, prompt, date, approver) and is presented as illustrative where the Terms apply. Do not publish generated images without an approval record. |
| A3 | **Two projections of overlapping products on the same storefront page.** Featured is built from legacy Product Control records (`PEX-*` products, `R360-*` variants). All products is built from the master-offerings dataset bound to `GEN-GRP-*`. **(Claude re-verified)** | `config/research/production-completion/catalog-live-identity-closure-20260922.json:93-94,113`; `EarlyAccessRoute.tsx:567-627`; `assisted-order/production-catalog.ts` | Resolve both projections through **one** crosswalk to one manifest key. There must be a test that one product never shows two different images, or an image in one place and a fallback in the other, on the same page. |
| A4 | **Identity is not uniform.** 417 rows are bound to Product Control UUIDs. BAM15 and Syringes are synthetic `unbound:mo_…` / `unbound:mov_…`. | `production-catalog.ts:63-79,175-179`; `master-offering-bindings.generated.json` | Key the manifest on the **offering variant id (`mov_`)**, with a crosswalk to Product Control ids. Never key on the Product Control product id alone (that misses quote-only rows) or on supplier SKU (the cart already exposes `supplierSku`, `shared/research/early-access-cart.ts:95-96`). |
| A5 | **Strict allowlist seams drop unknown fields, and drop rows that fail validation.** | `client/src/research/early-access/earlyAccessCatalogView.ts:87-154` (`toCardProduct`, rows go to `dropped`); `master-offerings` `readOffering` explicit field list | Thread image fields through every seam. An image field must **never become required**; a missing image must not remove a product from the catalog. |
| A6 | **A product image is a commerce gate in the member lane.** A missing or unapproved primary image blocks cart selection. **(Claude re-verified)** | `server/research/commerce/cart-product-selection.ts:96,104`; `server/research/catalog/member-catalog-projection.ts:362,460-461` | Keep image *display* separate from purchase authority (founder rule 2026-08-21: commerce uses structured facts only). The image manifest must not change what can be bought. There must be a test that adding or removing a manifest image changes no `workflowMode`, price or cart eligibility. |
| A7 | **Early Access already has `imageState` (`approved` / `pending` / `none`).** It is always `none` in production and is not a release gate (the claim that it gates release was refuted). | `storefront-view.ts:62-75,185-198`; `declared-facts-source.ts:632` | Reconcile `imageStatus` with this existing vocabulary rather than adding a second one. |

## B. Infrastructure constraints

| # | Constraint | Evidence | Requirement |
| --- | --- | --- | --- |
| B1 | Research, public and member pages send **no CSP** (helmet CSP disabled). Care pages have CSP `img-src 'self' data:`, pinned by an exact-equality test. | infrastructure trace IMG-01/02 | Serve product images **same-origin**, or from a pinned, reviewed storage origin, never arbitrary `https:` hosts. The discovery image validator accepts any `https` host and any `/…` path (`shared/research/master-offerings/presentation-contract.ts:260-271`), so tighten it to the manifest's allowed prefix. Any image shown on Care pages must satisfy `'self'`. |
| B2 | The service worker caches same-origin images **cache-first** until the PWA version changes. | IMG-03 | Asset URLs must be **content-hashed or versioned** (for example `…/<mov_>-<sha8>.webp`). A replaced image must never show stale. |
| B3 | Image-shaped missing paths under dynamic routes (for example `/products/:slug/...`) answer **200 text/html**, not 404, so a broken `<img>` is silent. No existing `<img>` has `onError`. | IMG-04, IMG-11 | Images come only from a manifest-validated prefix outside dynamic SPA routes. `onError` falls back to the category image. There must be a test that a missing file yields the fallback, not a broken icon. |
| B4 | Signed storage URLs expire after **5 minutes**, and cards lazy-load. | IMG-11 | Do not use expiring signed URLs for public catalog images, or refresh them before lazy load. There must be a test with a delayed load. |
| B5 | `client/public/**` is **protected** by the core-site manifest, apart from `client/public/hino/` and `client/public/research/`. There is no LFS and no `.gitattributes`. The current public raster total is about 3.8 MB. | IMG-08, IMG-17, IMG-18 | Put assets under `client/public/research/…` or a reviewed storage bucket. Set a per-asset size budget (for example ≤ 120 KB WebP at 1x) and a total budget. Add a `.gitattributes` binary rule if assets are committed. |
| B6 | The no-em-dash gate scans only code, JSON, HTML and CSS files. | IMG-09 | Keep alt text in a scanned format (`.json`/`.ts`), or add the manifest to the gate. Alt text is rendered copy. |
| B7 | The evidence audit checks only that `alt` is present, not that images load. | IMG-19 | Add a broken-image check (`naturalWidth > 0`) to the browser evidence. |

## C. Truthfulness rules for the visuals

**What labels and images must not show**
1. No lot, expiry, purity, COA, certification, "pharmaceutical grade", clinical-result, before/after, US-sourcing or pharmacy claims, in the image or in its alt text.
2. The existing label-system draft awaits founder confirmation. Until it is confirmed, labels stay **minimal**: product name and strength as recorded. Use no fill volume, concentration or unit count, because these are unknown for every peptide (GAP-003/004).
3. Claim-bearing names (for example "…HAIR RESTORATION SOLUTION", "…ANTI-AGING CREAM", "LIBIDO CREAM") must not gain any visual claim. The image shows the form only.

**Forms that must not be invented**
4. **"Form not stated" (29 classification-pending rows, including the GLP-class rows GLP-1 2 mg, GLP-3 12/24 mg and Survodutide) get a neutral, form-free visual.** No vial or bottle, because that would invent a dosage form. The legacy peptide label manifest records GLP-class rows as regulatory hold with "no artwork".
5. **GRP-0422 (CJC-1295 with DAC + Ipamorelin)** can never show a component split in its label. It gets the held treatment.

**Third-party products and brands**
6. Care rows whose names embed third-party marks (HCG Pregnyl, Kyzatrex, ZOFRAN, Versabase) must not receive **fabricated packaging**. The same applies to supplements with ingredient or product-line marks (for example Magtein, UltraBiotic). The UI guide says "preserve official packaging … do not create fake". Use form-only or category visuals until real, rights-cleared packaging images exist.
7. **Superpower / Mito Health:** a name-only Coming soon card. No partner logos or packaging. The diagnostics eyebrow "Diagnostics partner" (`DiagnosticsExperience.tsx:69`) is a partnership claim with no agreement behind it (`resellerAuthorization: not_evidenced`), so change it.

**Status treatments**
8. "Coming soon" is reserved for units that could genuinely be sold once released. It is **not** for regulatory or formulation holds. Held, quote-only, Care and Coming soon each need a distinct and truthful status treatment.
9. Syringes & Alcohol Swabs resolves as held / `availability_review` on the Assisted Order storefront, not as request-pricing. Its visual state must follow the server state, not the ledger label.

**Dosage-form coverage**
10. The proposed nine image types do not cover every actual form. Add types, or map explicitly, for:

    | Form | Rows |
    | --- | --- |
    | Topical Cream / Gel / Serum | 31 |
    | Troche | 6 |
    | Solution / Injectable Solution | 8 |
    | Listed Unit | 2 |
    | ODT | 1 |
    | Supplement Unit | 20 |

11. **Hexarelin 5 mg / Oxytocin 10 mg:** the kept rows (GRP-0426/0425) are lyophilized vials, while the superseded provenance rows say otherwise. Map by the kept canonical identity only.

## D. Review checks for the image-layer successor

1. **Coverage:** every exposed product on these surfaces renders a manifest image or a category fallback, never blank or broken:
   - Featured
   - All products (every page, including search and filter results)
   - member catalog, and its per-page access refinement
   - member product detail
   - `/research/member/supplements`
   - wizard review lines, if thumbnails are added
   - `/products/:slug` once it is mounted

   Measure it by walking the real 419-row customer projection. Report: counts by `imageStatus`, 0 missing, and 0 `naturalWidth = 0`.
2. **Mapping:**
   - One product maps to exactly one primary image on every surface; card, detail and Featured agree (A3).
   - A mutation test swaps two manifest entries and expects failure.
   - Manifest keys match `mov_` identities.
   - There is no orphan manifest entry and no duplicate key.
3. **Commerce isolation (A6):** image presence or absence changes no action, price, `workflowMode` or cart eligibility.
4. **Truthfulness (section C):** held, quote-only, Care, Coming soon and "Form not stated" treatments are verified in the browser. No forbidden claim appears in any alt text (screened with the existing forbidden-term list plus the section C terms).
5. **Fallbacks:** each of these yields a category fallback with meaningful alt text, and no dropped product:
   - missing file
   - missing manifest entry
   - unknown slug
   - slow or lazy load
   - expired URL
6. **Infrastructure (section B):** same-origin or pinned host, content-hashed URLs, size budget, gate coverage of alt text, and the protected-path review.
7. **Accessibility:**
   - Alt text names the product and form ("BPC-157 10 mg research vial, illustrative").
   - Decorative duplicates use `alt=""`.
   - There is no layout shift, because width and height or aspect-ratio are reserved.
   - Checked at 320, 390, 768 and 1440 px, and with keyboard.
8. **Provenance:** each asset records generator, prompt, date and approver, plus the illustrative notice (A2).
