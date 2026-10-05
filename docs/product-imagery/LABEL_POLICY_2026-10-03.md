# Sprint v2 label and class-visual preparation policy

Scope: imagery preparation only. This is not an exact-asset, Product Control,
publication, commerce, or production approval.

## Label decision

Use report 27 option (a): reuse a blank-label class visual instead of rendering
22 nearly identical Featured vials. The 22 canonical identities stay in the
coverage plan with their own immutable catalog identifiers; they are not 22
new product-render jobs. Proposed reuse is subject to the remaining asset and
runtime gates. No existing private preview selection changes in this slice.

Every class render defaults to a blank label with no generated words, symbols,
strength, quantity, logo, brand, certification, or efficacy claim. The visual
is illustrative, not a representation of verified supplier packaging. Exact
catalog name and strength remain external UI identity, not verified package
text. Never let the image generator write the label.

Verified package text may only be considered later with an authoritative
supplier package-text source, exact text, source reference, content hash and
independent verification for that exact product/variant. Catalog copy alone
is insufficient. Deterministic text compositing is not selected or authorized
by this preparation policy. All current candidates have blank labels.

## Candidate repairs

- Remove former candidate 25, GRP-0366 Annatto Pro 125, from the render plan.
  It is third-party retail packaging; keep the neutral unverified identity
  treatment. Its catalog identity is not removed.
- Candidate 24, GRP-0362 Acetic Acid 0.6%, is a sealed diluent-vial form, never
  a dropper, tincture or oral bottle. This is a presentation correction only:
  the underlying catalog classification is preserved separately. Do not add
  a sterility claim or infer contents, fill level or supplier packaging.
  Neutral calibration-06 remains the existing private preview treatment.
- GHK-Cu candidates 6 and 7 keep opaque, contents-hidden glass. No visible
  cake, white powder, liquid, fill level or color claim is permitted. Proposed
  future class reuse does not change the current neutral preview selection.
- Care, held, quote-only and packaging-unverified status remain independent
  of image choice. Class reuse cannot unlock a pathway, price, cart, quote,
  fulfillment or Product Control binding.

## Framing and delivery

For square side S, measure subject height 0.61-0.75 S (target 0.68 S), horizon
0.521-0.575 S and top margin 0.163-0.179 S. Inclusive rounded pixel bounds
avoid falsely rejecting accepted 1254-pixel references at the decimal-band
edges. All blur radii, morphology kernels, sample positions and scan bounds
scale with S. The luminance threshold is dimensionless.

The horizontal-center tolerance of 0.05 S is explicitly an engineering
screening tolerance, not a newly approved founder specification. Record the
offset and require visual review. No edge contact is permitted. Raster
framing measurement never edits pixels, applies a crop/filter/tint or grants
an approval. Master 1254 and initial delivery target 1024 are compatible with
the same normalized gate; no derivatives are generated in this slice.

Historical study 06 retains its Claude visual ACCEPTABLE decision even though
it fails the newer prospective numeric top/horizon test. Record both facts;
do not silently turn that into rerender authorization. The requested private
calibration correction scope remains 03, 04 and 05 only.

## Closed gates

The v2 pack's example sentence alone was not authorization. A subsequent fresh
origin check found Samuel's exact private 03/04/05 authorization durably recorded
at `cd66f3c411e6164981295d81c2116e50343edc86`. Only those three private calibration
corrections may now be rendered. Batch 1 product render, publication, runtime
integration, managed SQL and deployment remain false. An accepted Core A/B/C
successor is required before refreshing the frozen private preview.

Review inputs: report 27 at `96e06765dbec9063a7311f128d0ab8accf8588b5`,
fidelity PASS `316ca72c95262675dffef6aa4d858ae9c533605e`, and observed A-E
design record `a4e647eb69959eb91fc05dde8f211342d692b04c`. None approves product
assets or changes commerce authority.
