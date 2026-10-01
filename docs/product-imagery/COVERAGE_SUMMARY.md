# Xenios product imagery v3 correction status

Generated from primary base `49234f8a2dd804845245a18056a73904b320158a` (tree `36e1db47986916c3a96c82324ba43fbcec6e7861`). This is evidence and source-only imagery work; it is not a production deployment or a commerce-state authority.

## Corrected catalog accounting

| Measure | Count |
| --- | ---: |
| Reviewed workbook rows | 426 |
| Canonical variants after reviewed merges | 424 |
| Customer-exposed target after shipping exclusion | 423 |
| Imagery branch baseline before HL-11 | 420 / 419 |
| Observed core HL-11 candidate canonical / customer | 424 / 423 |
| Observed core new canonical identities awaiting binding | 6 |
| Care rows | 242 |
| Structured formulation holds | 1 |
| Price-on-request rows | 2 |
| Catalog coming-soon rows | 0 |
| Separate coming-soon offers intended | 2 |

The reviewed 424-row / 423-customer target is materialized in the observed core HL-11 candidate at source commit `4cba24af1d42ad59fe44856859cc1721846e6df5` (tree `6395273fc4370b7df713a2b72b019785f547d1fb`), with qualification records at `c73da35cc223a2253ce8074948ed9ff063012748`. It is not merged into this imagery branch, independently Claude-accepted, deployed, or image-approved. Runtime image wiring remains blocked on independent core-candidate acceptance, exact-SHA per-asset review, media/commerce decoupling acceptance, and a coordinated shared UI lease.

## Identity correction

- GRP-0425 / `mov_c26ef47dfbbe46f7e090` is the reviewed Oxytocin owner. GRP-0407 and its current Product Control identity are forward aliases only.
- GRP-0426 / `mov_3c8ca424d78153fd931a` is the reviewed Hexarelin owner. GRP-0402 and its current Product Control identity are forward aliases only.
- Superseded manifest owners: 0.
- Imagery-branch baseline exact Product Control bindings on reviewed identities: 415; baseline target bindings not materialized: 9.
- Observed core HL-11 retains 415 Product Control bindings, archives 2, and leaves 6 new canonical identities unbound without inventing price or UUID authority.

## Batch 0

| Measure | Count |
| --- | ---: |
| Sanitized class jobs | 25 |
| Rendered, non-public | 25 |
| Pending renders | 0 |
| Independently approved | 0 |
| Public | 0 |

Renderer payloads contain no canonical product name, mark, strength, quantity, price, label, claim, or visible text. Fixture identity is stored in a physically separate provenance section. The old 423/419-style named prompt queue has been removed; the only queue is the 25-item Batch 0 class packet.

## Image classes represented by the 424 reviewed variants

| Class | Rows |
| --- | ---: |
| capsule_bottle | 110 |
| cream_tube_or_pump | 28 |
| injectable_solution_vial | 3 |
| liquid_vial | 84 |
| nasal_spray | 5 |
| neutral_product_identity | 27 |
| odt_container | 1 |
| oral_liquid_neutral | 1 |
| packaging_unverified | 4 |
| peptide_lyophilized_vial | 112 |
| serum_dropper_or_pump | 1 |
| shipping_service | 1 |
| solution_container_neutral | 5 |
| supplement_retail_unit_neutral | 20 |
| syringe_supply_pack_neutral | 1 |
| tablet_bottle | 15 |
| troche_container | 6 |

## Quarantine and public status

All 10 pre-v3 WebPs were removed from `client/public` and retained under non-public evidence paths. They remain permanently nonapprovable. No Batch 0 candidate is publishable without exact-hash, named independent approval.

## Runtime integration status

The pure resolver accepts exact canonical, Product Control, forward, and legacy Featured identities, then chooses only among separately supplied approved public assets. Business state is an external input; the resolver does not derive price, action, workflow, availability, Care, hold, or purchase eligibility. With zero approved public assets, its expected result is intentional no-image.
