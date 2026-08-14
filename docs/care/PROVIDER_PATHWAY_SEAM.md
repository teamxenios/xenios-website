# The provider pathway seam: how a Research catalog row relates to Care

Decision record, 2026-08-14, bottom-left lane (catalog/pathways), five-session build.
Grounded in the tree at train tip f2bfb5d and verified by inspection, not recalled.

## What exists on each side

Research (server/research/kris-launch-a): 243 catalog rows resolve to the
`provider_workflow` purchase mode. Each carries a pathway view (headline, honest
explanation, concierge-request descriptor) and no order entry; the mode derivation
makes `direct_eligible` unreachable for the `clinical_provider_only` channel.

Care (server/care): a governed clinical platform with its own front door. Intake
starts only behind `authorizeCareIntakeStart`: eligibility outcome must be
`intake_available`, the intake definition must be approved, and telehealth AND
privacy consent must be satisfied for the same patient. The intake model carries a
patient and their clinical responses. It has no product, SKU, or catalog concept
anywhere in eligibility or intake.

Between them: zero imports in either direction, now pinned by
`server/research/kris-launch-a/care-boundary.test.ts`.

## The decision

The provider-workflow pathway ends in a HUMAN-COORDINATED request, not a link into
clinical intake. No product context crosses the boundary in either direction.

Why, in one paragraph: Care intake having no product concept is load-bearing, not an
omission. A catalog row that could pre-select itself into a clinical intake would put
a purchase where a provider authorization belongs, and would let commerce pressure
shape a clinical record. The buyer's interest in a specific item is commercial
information, so it stays on the commercial side (the concierge request names the
item); the clinical pathway begins at Care's own front door, under its own
eligibility and consent gates, product-blind. A provider who authorizes treatment
does so from clinical judgment, and fulfillment against a specific catalog item is an
operations step AFTER authorization, not an input to it.

## The rules this fixes

1. No import crosses server/research/kris-launch-a and server/care in either
   direction (enforced by test).
2. No Research route deep-links into a Care intake with a product attached, and no
   Care surface renders Kris pricing or catalog rows.
3. The only artifact that crosses is a member-safe concierge request (item display
   name and specification, nothing else), handled by operations humans.
4. RUO items never enter Care at all; their pathway is Research-side only.
5. Phase 7 activation (real intake routing for provider items) requires clinical
   governance sign-off per the operating manual, and starts from THIS boundary, not
   from a relaxation of it.

## What would change this

A founder-plus-clinical decision to build product-aware provider ordering (a
provider-side catalog with clinical authority, distinct from member commerce). That
is a new system with its own review, not an edit to this seam.

-- BOTTOM-LEFT / Catalog, Product Control, Care & Operations (Fable 5)
