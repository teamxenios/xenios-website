# Xenios product imagery v3 correction status

Generated from primary base `49234f8a2dd804845245a18056a73904b320158a` (tree `36e1db47986916c3a96c82324ba43fbcec6e7861`). This is evidence and source-only imagery work; it is not a production deployment or a commerce-state authority.

## Corrected catalog accounting

| Measure | Count |
| --- | ---: |
| Reviewed workbook rows | 426 |
| Canonical variants after reviewed merges | 424 |
| Customer-exposed target after shipping exclusion | 423 |
| Currently mounted canonical / exposed | 420 / 419 |
| Care rows | 242 |
| Structured formulation holds | 1 |
| Price-on-request rows | 2 |
| Catalog coming-soon rows | 0 |
| Separate coming-soon offers intended | 2 |

The reviewed 424-row target is **not materialized** in the runtime catalog yet. Runtime image wiring remains blocked until catalog/binding regeneration and independent image approval.

## Identity correction

- GRP-0425 / `mov_c26ef47dfbbe46f7e090` is the reviewed Oxytocin owner. GRP-0407 and its current Product Control identity are forward aliases only.
- GRP-0426 / `mov_3c8ca424d78153fd931a` is the reviewed Hexarelin owner. GRP-0402 and its current Product Control identity are forward aliases only.
- Superseded manifest owners: 0.
- Exact current Product Control bindings on reviewed identities: 415; target bindings not yet materialized: 9.

## Batch 0

| Measure | Count |
| --- | ---: |
| Sanitized class jobs | 25 |
| Rendered, non-public | 0 |
| Pending renders | 25 |
| Independently approved | 0 |
| Public | 0 |

Renderer payloads contain no canonical product name, mark, strength, quantity, price, label, claim, or visible text. Fixture identity is stored in a physically separate provenance section. The old 423/419-style named prompt queue has been removed; the only queue is the 25-item Batch 0 class packet.

## Image classes represented by the 424 reviewed variants

| Class | Rows |
| --- | ---: |
| capsule_bottle | 110 |
| cream_tube_or_pump | 28 |
| gel_tube_or_pump | 2 |
| injectable_solution_vial | 3 |
| liquid_vial | 84 |
| nasal_spray | 5 |
| neutral_product_identity | 27 |
| odt_container | 1 |
| oral_liquid_neutral | 1 |
| packaging_unverified | 2 |
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
