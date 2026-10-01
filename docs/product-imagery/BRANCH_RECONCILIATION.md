# Prior imagery branch reconciliation

> Historical reconciliation record for the pre-v3 branch. Superseded for current counts, paths, and render authorization by `COVERAGE_SUMMARY.md`, `README.md`, and the v3 manifests.

Primary reconciled: `7600943f9ec7573f0a5cbfe7a7687ba851276a30`, tree `2fd41b918c8d77c5593319a6d921477f789b737e`.

The independent acceptance bar was read from `f4f899a7:docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md`. That review commit is divergent from primary, so only the document was used as evidence. No review-branch commit was cherry-picked.

## Decision

No whole commit from either prior imagery branch is safe to cherry-pick. Their useful safety ideas are carried forward manually; their ledgers, identities, actions, branding, and assets are not authorities for the current catalog.

## `claude/f5/product-image-media-system`

- tip: `1d4ee3d888e8953ad82060322b9f6e7911d04b17`
- commits: `9a4dfef7cbd6874ffbc2d30c432d6c241906a696`, then `1d4ee3d...`
- merge base: `b05534f12d29960af111be986ca9194a7b9be0eb`
- divergence from current primary: 1,397 primary-only commits, two branch-only commits
- scope: 16 additive files and a 1,179-row media manifest from an August 1 workbook

Reusable concepts:

- provenance derived from source type
- structured photographic rights evidence
- exact-variant and printed-strength checks for identity-bearing media
- checksums, alt text, size, orphan, and broken-file checks
- named approval required for publication
- the `1d4ee3d` constructor seal and read-path revalidation that make a generated-render-as-supplier-photo forgery unconstructible and reject forged persisted values

Rejected as current authority:

- the 1,179-row workbook ledger and old `SKU + human variant` key
- the parallel media public-state vocabulary
- old coverage counts and action assumptions
- an uncommitted source workbook that cannot be regenerated from the repository
- any rule that prevents explicitly declared shared form fallbacks while claiming to protect exact media

`9a4dfef` alone has the documented provenance-forgery hole; `1d4ee3d` depends on the files introduced by it. Neither commit is independently cherry-pickable, and the pair remains a stale parallel authority.

## `codex/pep-images-20260802`

- tip and sole branch commit: `35b4fa9068bfc4dca737929daea910be25538584`
- merge base: `824631ae64f627a3ddc6f150145ffbcaec92d6f1`
- divergence from current primary: 1,377 primary-only commits, one branch-only commit
- scope: 16 files, hard-coded 86-row peptide plan, two neutral PNG bases, three internal-review SVGs, and a partial SVG generator

Reusable concepts:

- deterministic XML escaping
- overwrite refusal
- forbidden-claim scan
- explicit held/internal review markings
- reviewer and UTC approval fields

Rejected as current authority:

- legacy `PEP-*`, `R360-*`, `PRH-*`, and `RAW-*` identities rather than `mo_*` and `mov_*`
- hard-coded old source actions and old branding
- caller-supplied provenance strings and weak rights evidence
- fixed SVG/template names without current checksum/evidence records
- three held proofs that print legacy branding and SKUs
- incomplete form coverage and an incomplete generator
- the declared cart context, because fallback imagery must never become a cart or commerce gate

Only 14 of the 86 old SKUs occur in the current legacy alias evidence, and those now map through canonical `mo_*`, `mov_*`, and `GEN-GRP-*` identities. The old Dihexa 10 mg key is concretely ambiguous between a capsule and research-material row in the current catalog.

The two old neutral PNGs are visual references only. This lane did not import their bytes. Its separate generated batch has explicit prompts, provenance, checksums, web optimization, and a canonical coverage ledger, but remains quarantined because the founder v3 prompt was not attached.

## Current reconciliation result

- canonical source rows: 420
- customer projection: 419
- Product Control-bound rows: 417
- exposed unbound rows: BAM15 and Syringes & Alcohol Swabs
- excluded row: FedEx Standard Overnight, a fulfillment fee rather than merchandise
- current coverage key: `offeringVariantId` (`mov_*`)
- Featured identity convergence: 22 PEX/R360 aliases resolve to 22 canonical `mov_*` and GEN-GRP bindings
- approved exact media at the read-only production observation on 2026-09-30: zero
- approved generated fallback media: zero
- runtime surface references: zero

The manually retained safety rules live in the current contract and validator without reviving either older branch as a second authority.
