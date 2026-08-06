# CODEX-PEP-IMAGES handoff

## Scope

This collision-free slice provides a media-only plan for the 86 exact rows on the
verified peptide sheet, two generated blank container bases, deterministic Renew 360
and Raw Peptides review templates, exact label overlays, and a fail-closed approval gate.
It does not edit Product Control, catalog/UI wiring, commerce, routes, migrations,
feature flags, environment, or the Samuel configuration queue.

## Source and reconciliation

- Workbook: local controlled evidence only; not committed.
- Workbook SHA-256: `df317a28374c9e194f3379a2b276c8533016dc84aa906af9d48b49db46bf53d5`.
- 86 unique SKUs: 69 vial, 2 capsule bottle, 3 sterile solution, 12 source-vial rows.
- Source website actions: 16 held, 52 request access, 18 unavailable.
- Checkout eligibility remains 0/86. This slice cannot change it.
- No supplier identity, wholesale/cost, source notes, lot, COA, purity, sterility,
  endotoxin, inventory, fulfillment, or customer data is copied into the plan.

## Provenance and approval

The two PNG bases are text-free AI-generated renders, recorded as
`xenios_generated_render` / `generated_product_render`; they are never supplier
photography. All final text is code-written. Review SVGs remain under `content/`, outside
web roots. Approval requires exact variant/SKU/strength/presentation/workbook-hash match,
transparent catalog/detail/cart coverage, no unverified claim field, a named approver,
and a valid UTC approval timestamp. Raw Peptides output additionally requires rights
evidence. No sample in this PR carries an approval.

## First vertical deliverable

- Renew 360 and internal Raw Peptides proofs for
  `R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL`, exact strength
  `5 mg / 5 mg / 5 mg`.
- Renew 360 capsule-bottle proof for `R360-DIHEXA-10MGX60-CAP`, exact strength `10 mg`.
- Every proof visibly says it is not approved for publication or is rights-review pending.

## Verification

- Focused Vitest: 4 files, 11 tests passed.
- Targeted strict TypeScript check: passed for the factory, generator, and tests.
- Both 1254×1254 RGBA bases have transparent corners; their SHA-256 values are
  `35125eb3d56783319da9c1ce791605858148dfc3a7e632a4ab22cbc8421e1289` (vial) and
  `0907e67c81da928a1424c09d3178446824a3be169002c8438fa4bb17d5ac25fc` (bottle).
- All three SVG proofs parsed as XML, passed the forbidden-claim scan, rendered at
  1024×1024 in a headless browser, and were visually inspected for label fit.
- The repository-wide `tsc --noEmit` produced no diagnostic before its bounded
  timeout; a complete repository-wide pass is therefore not claimed.

## Release-manager seam request

None in this slice. After independent media approval and PR #229 architecture review,
the release manager may choose a separately leased Product Control/media-linkage seam.
Until then, do not copy these files into a public root or attach them to a product record.

Configuration-queue row: none required. Rights evidence and media approval are business
records, not a secret or runtime configuration value.
