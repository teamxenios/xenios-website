# Product image style guide v3

## Current status

The founder v3 prompt is missing. This guide records safety and review constraints; it is not permission to generate more pixels. The ten existing files are quarantined pre-v3 candidates and have no publication approval.

## Visual language

Candidate fallbacks use a restrained studio system:

- warm off-white seamless background
- cool gray and brushed silver material accents
- muted deep green used sparingly
- soft diffused light and a subtle grounding shadow
- centered 1:1 composition with generous crop-safe margins
- realistic material rendering without decorative clutter
- no embedded words, numbers, labels, logos, dose, strength, barcode, certification, or promotional claim

Delivery candidates are 1024 by 1024 WebP. Any later card or detail component must reserve the 1:1 geometry and default to `object-fit: contain` unless a reviewed crop says otherwise.

## Generic physical forms

- Vial: the current pre-v3 candidate visibly contains clear liquid. Restrict it to generic liquid-vial contexts. It is not eligible for any lyophilized row. A future v3 vial candidate must be dry or content-neutral, with no printed label, needle, or syringe.
- Bottle: matte white neutral container; no visible capsules, ingredient, count, or supplement claim.
- Spray: compact capped pump; no spray plume, body part, or administration scene.
- Topical: blank airless pump; no skin, application gesture, outcome, or beauty claim.
- Liquid candidate: sealed amber bottle; no dropper, spoon, syringe, or administration cue. Do not assign it from a generic `Liquid` or `Solution` form alone; require reviewed container evidence.
- Accessory: generic empty research arrangement; no needle, syringe, biological sample, or medical-use claim.

These candidates depict a broad form only. They must never be labeled as a product photo, actual packaging, exact item, official brand image, or supplier image.

## Forms that stay neutral

Use the empty form-neutral candidate when exact packaging or container form is not established. This includes the 27 unresolved `Form not stated` rows and, until an appropriate candidate exists, troche, ODT, tablet, listed unit, included supply, injectable solution container, and supplement unit packaging.

Two source rows are controlled identity exceptions. Founder-reviewed reconciliation keeps GRP-0425 for Oxytocin 10 mg and GRP-0426 for Hexarelin 5 mg as lyophilized vial identities. The superseded GRP-0407 and GRP-0402 records are provenance, not visual selectors. Because the current vial candidate contains visible liquid, these kept identities still receive the form-neutral candidate until a suitable v3 vial is approved.

## Non-product treatments

- Care: an empty consultation setting. No clinician, patient, product, prescription cue, or medical equipment.
- Request or quote: an abstract review checkpoint. No currency, signature, accepted quote, or approval mark.
- Held: an empty form-neutral pedestal plus runtime held copy or badge. Never call it Coming soon.
- Coming soon: if a real future row later exists, use the neutral visual plus distinct runtime Coming soon copy. Never reuse that wording for a hold.
- Unknown form: an empty pedestal with no container or dosage-form clue.
- Shipping service: an abstract route tile or unbranded transit symbol. FedEx is a fee, not merchandise.

Pixels never contain the status text. Current server and catalog policy remain the status authority.

## Third-party and claim-sensitive items

Reject fabricated packaging for Pregnyl, Kyzatrex, ZOFRAN, Versabase, Magtein, UltraBiotic, or any other marked third-party item. Use only generic form or form-neutral candidates until official packaging, identity, rights, and approval evidence exists.

Do not add partner logos or packaging for Superpower or Mito Health. Claim-bearing names such as hair restoration, anti-aging, and libido products receive form-only art. Alt text keeps the canonical product identity and a literal scene description; the scene description must not amplify the name into an outcome claim.

## Rejection criteria

Reject a candidate if it contains or implies:

- a real supplier, brand, partner, or carrier without rights evidence
- a strength, count, fill volume, concentration, package, or SKU not supplied by approved evidence
- lot, expiry, COA, purity, testing, pharmaceutical-grade, certification, pharmacy, or sourcing claims
- dosing, administration, treatment, result, before-and-after, or efficacy claims
- stock, availability, price, discount, cart, checkout, or purchase state
- readable AI-generated label text
- a person, hand, body part, or setting that creates an unsupported clinical claim

## Approval record

A valid approval names the reviewer and UTC time, identifies the exact bytes by full SHA-256, states the identity scope, cites prompt and rights evidence, and records the illustrative notice. `Team approved`, a status-only row, or an approval tied to different bytes is insufficient.
