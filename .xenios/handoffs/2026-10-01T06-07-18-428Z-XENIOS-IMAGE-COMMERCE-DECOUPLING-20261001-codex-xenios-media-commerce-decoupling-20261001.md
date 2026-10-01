# Product imagery and commerce decoupling

Date: 2026-10-01

Branch: `codex/xenios-media-commerce-decoupling-20261001`

Base Health source: `67d75c968085ca0d8256636f6cf46aebcaa1a597`

Pushed source checkpoint: `f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5`

Source tree: `16cf34926565cfc58542d28f0af9f1c64636f4e9`

## Result

The application source now treats product imagery as presentation metadata. A
missing, rejected, expired, ambiguous, unsigned, or otherwise unusable image
does not decide product existence, catalog inclusion, price, ordering pathway,
cart eligibility, quote eligibility, or fulfillment eligibility.

The database equivalent is provided as a source-only candidate. It has not been
registered as a managed migration and has not been applied to a hosted or
production database.

## Authority boundary

Three required-input tuples remain commerce authority for a product:

- `products.sku`
- `products.family`
- `product_content.storage_information`

The exact `product_content.primary_image` tuple is presentation-only. Unknown or
malformed non-image `blocks_display` rows continue to fail closed. Product,
variant, audience, price, inventory, lot, COA, quality, and domain readiness
authorities are unchanged.

## Application changes

- Shared contracts separate commerce-required bindings from presentation
  bindings while retaining the old combined binding export for compatibility.
- New cart selections omit media. Readers tolerate and strip the legacy
  top-level `media` field so old wire payloads do not become a second identity.
- Server and browser cart validators require exactly three input versions and
  the exact two readiness domains.
- Persistent cart put and claim payloads canonicalize media away before command
  hashes, idempotency comparisons, snapshots, and selection hashes are written.
- Member catalog projection derives availability from commerce inputs, price,
  inventory, and the existing activation authority. Approved media remains a
  best-effort presentation enhancement.
- Missing or unsafe media becomes `null`; cards and details remain present.
- A thrown, rejected, or error-returning signed-media request is isolated to the
  presentation field and cannot abort the catalog response. Non-media source
  failures still propagate.
- Product Control release gates ignore only the exact image tuple. Admin copy
  explicitly identifies the image as optional presentation metadata, including
  when legacy canonical copy still says it is required.
- Early Access eligibility was audited and is already image-independent. Its
  legacy `IMAGE_PENDING` vocabulary remains readable for compatibility, but the
  canonical projector does not derive that state from imagery.

## Database candidate

Files:

- `supabase/candidates/20261001060000_research_media_commerce_decoupling.sql`
- `supabase/candidates/20261001060000_research_media_commerce_decoupling.rollback.md`
- `supabase/verification/research_media_commerce_decoupling_local.mjs`

Normalized candidate SHA-256:
`1866fa8696aa6fdca470d9f2c5677fb079ce6d5eedb130b3142a812bc873024e`

The candidate is transactional and fail-closed. It verifies exact predecessor
function bodies, security-definer configuration, `search_path`, forced RLS, and
an empty four-table persistent-cart boundary. It refuses drift, replay, or any
existing cart history. It then:

- removes the exact primary-image tuple from readiness hashes and counts;
- reclassifies that tuple as informational with an immutable audit entry;
- refuses to change readiness semantics while `product_content` is public;
- invalidates the old product-content manifest and both approval pairs, with a
  version increment and audit, so canonical manifest approval and a separate
  launch transition are required before the domain becomes public again;
- requires exactly three non-image cart input versions and two domain versions;
- removes media table and media-state checks from cart selection currency;
- strips legacy media before put and claim command identity is calculated; and
- restores the existing private-helper, service-only RPC, forced-RLS, and
  direct-table ACL boundaries.

After any commit, exact rollback is unsupported because the artifact does not
capture the complete pre-apply governance and ACL state. Recovery must disable
the calling feature, preserve cart and audit records, and use a separately
reviewed roll-forward repair. Before commit, the transaction can be rolled back.

## Verification

Application proof under Node 20.19.0:

- 9 changed-path Vitest files passed, 89 tests passed.
- 2 canonical Early Access eligibility/catalog files passed, 73 tests passed,
  confirming that image presentation state is separate from purchasability.
- TypeScript no-emit check passed.
- SQL verifier syntax check passed.
- `git diff --check` passed.
- Production build passed. The permanent no-em-dash gates scanned 1,339 source
  files and 225 built files with zero forbidden forms. Existing mixed-import and
  large-chunk warnings remained non-fatal.

Disposable database proof:

- PostgreSQL 17.11 passed.
- PostgreSQL 16.14 passed.
- The proof reproduced the predecessor coupling before applying the candidate.
- Public product-content readiness, nonzero-cart history, predecessor drift,
  unexpected function/table ACLs, and a non-BYPASSRLS installer refused
  atomically.
- Candidate replay refused.
- Required JSON object/array/type/cardinality checks, null expected versions,
  empty expiry aliases, and put/claim null-concurrency mutations refused.
- Image payload, media row, image state, blocker metadata, and superseded-count
  changes did not change commerce eligibility or product-content readiness.
- SKU, family, storage information, unknown non-image rows, product, variant,
  price, audience/member, domain, inventory, COA, and quality gates remained
  fail-closed.
- Put and claim proofs wrote media-free hashes, replays, snapshots, and selection
  hashes.
- Helper privacy, service-only RPC execution, forced RLS, and direct-DML denial
  remained intact.
- Governance invalidation, canonical manifest approval, and the separate release
  transition were proved in order.
- Each disposable container and tmpfs database was removed. No hosted database
  was contacted.

Independent SQL review found no remaining P0, P1, or P2 issue in the frozen
candidate. Residual P3 notes are that owner policy is capability-pinned rather
than pinned to one literal role name, predecessor body fingerprints use MD5 only
for non-security drift detection, and the disposable verifier uses mutable
PostgreSQL major-version image tags rather than registry digests.

## Promotion requirements

Current core Health checkpoint at freeze time:

- runtime: `3da909542a152552331074176f966f820600e948`
- tree: `e644ab4368c01e0a75ac5a89c6c09dbf8f8e7f2d`
- records: `8de6c81d88d7f66ea6dc07f4006b9a8fc4a7de97`

The core changes after this slice's merge base overlap only the continuity JSON
files, not the application, test, SQL candidate, verifier, or report paths in
this slice. Integration must still preserve the core continuity records rather
than taking this branch's older JSON wholesale.

This slice is not production authority. Promotion still requires:

1. independent exact-SHA review by the Health and Claude review lanes;
2. reconciliation onto the current core Health source;
3. managed migration and DAG registration by the owning release lane;
4. a fresh exact-environment preflight, including the zero-cart precondition;
5. Samuel's current explicit approval for any managed database or production
   mutation; and
6. post-apply commerce and catalog smoke checks with a documented rollback or
   roll-forward decision.

No image asset was approved, published, wired to the public website, or used to
change a product state in this slice.
