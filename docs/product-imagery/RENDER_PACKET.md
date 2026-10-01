# Batch 0 v3 render packet

The active packet is `manifests/renderer-packet-v3.json`. It contains exactly 25 request-only class jobs. `manifests/batch-000-provenance.json` contains the audit fixtures and must not be passed to the renderer.

Batch 0 covers: peptide lyophilized vial, liquid vial, injectable solution vial, neutral solution container, nasal spray, neutral oral liquid, capsule bottle, tablet bottle, ODT container, troche container, cream pump, gel tube/pump, serum pump, generic supplement bottle, generic supplement tub, neutral supplement retail unit, accessory pack, neutral syringe supply pack, packaging-unverified proxy, form-neutral identity, Care pathway, held state, quote-only state, coming-soon offering, and shipping service.

Every request requires a square, warm-white, restrained studio visual with no visible text, label, logo, mark, claim, certification, person, administration, active dispensing, price, cart, carrier, partnership, availability, or other commercial cue. Named products, strengths, quantities, prices, and fixture IDs are absent from the renderer packet by construction and validation.

All 25 requests were rendered through built-in imagegen. The request packet's staging targets include compiled-prompt SHA prefixes; retained originals under `docs/product-imagery/evidence/batch0-render-candidates/` use immutable output-SHA filenames. `evidence/batch0-render-receipts.json` binds every final file to its request contract, and the hash-bound 5×5 contact sheet is recorded by `evidence/batch0-contact-sheet.json`. Outputs remain non-public and unapproved; rendering and initial inspection do not confer independent review, runtime, deployment, or production authority.

The old exact-variant queue is removed. Future exact-product batches may be prepared only after Batch 0 review, and must retain the same request/provenance separation and exact-hash approval chain.
