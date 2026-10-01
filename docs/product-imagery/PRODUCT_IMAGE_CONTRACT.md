# Product image contract v3

## Authority boundary

The image system is presentation-only. Catalog, Product Control, commerce, Care, availability, hold, price, action, workflow, cart, fulfillment, and audit systems remain authoritative for their own state. An image resolver may accept a closed presentation-state value from an explicit authority adapter, but it may not derive or persist business state. Missing, pending, rejected, ambiguous, or broken media must never change row inclusion or a customer action.

## Catalog and identity

The reviewed evidence is 426 source rows reconciled to 424 canonical variants. The customer-exposed target is 423 after excluding GRP-0364 as a shipping fee. The imagery branch baseline remains 420 canonical / 419 exposed. The observed core HL-11 candidate materializes 424/423 at source commit `4cba24af1d42ad59fe44856859cc1721846e6df5` (tree `6395273fc4370b7df713a2b72b019785f547d1fb`) with qualification records at `c73da35cc223a2253ce8074948ed9ff063012748`; it is not deployed, independently accepted, or an approval of price or pixels.

Every image entry is keyed by the reviewed `mov_*` identity. GRP-0425 / `mov_c26ef47dfbbe46f7e090` owns Oxytocin 10 mg; GRP-0407 and its current Product Control IDs are forward aliases only. GRP-0426 / `mov_3c8ca424d78153fd931a` owns Hexarelin 5 mg; GRP-0402 and its current Product Control IDs are forward aliases only. Superseded rows may never own manifests or pixels.

The resolver must converge canonical mo/mov, group/SKU, exact Product Control IDs, reviewed forward aliases, and legacy PEX/R360 aliases. Conflicting or ambiguous identities fail closed.

## Renderer boundary

The request-only packet contains 25 generic class jobs. A renderer payload contains no canonical name, maker, ingredient, formulation, strength, concentration, volume, count, price, label, logo, trademark, claim, certification, people, administration, purchase cue, or visible text. Fixture identities and alt text live in a physically separate provenance artifact that must never be sent to the renderer.

Each request staging filename is bound to its compiled-prompt hash. After rendering, the retained immutable evidence filename is bound to the output SHA-256. Asset receipts bind that final path and exact byte size to the founder-spec hash, renderer-payload hash, prompt hash, render-contract hash, source image identifier, observation time, and output SHA-256. The renderer is recorded as OpenAI built-in imagegen; model and request IDs are recorded as not exposed when the tool does not return them.

## Evidence and publication

The ten pre-v3 WebPs are permanently nonapprovable evidence and must stay outside public roots. Batch 0 sources are also non-public review evidence. A public derivative requires all of:

1. exact output SHA-256 and content-hashed same-origin path;
2. named independent approver, UTC time, and a content-hashed JSON review record whose parsed approver, time, decision, exact public-asset SHA, scope, image class, manifest key, source-receipt SHA, and source-output SHA all match the registry entry;
3. rights/provenance review and truthful identity scope;
4. positive intrinsic dimensions within the decoded-pixel budget and reviewed alt text;
5. a separately hashed derivative; and
6. all repository, release, and production gates.

Until then, the resolver returns intentional no-image. It may not trust a status string or arbitrary URL as approval.

The current exact-byte publication verifier accepts only content-hashed PNG paths because PNG is the only implemented decoder. Adding AVIF or WebP requires a format-specific decoder and equivalent intrinsic-dimension, decompression, hash, and byte-budget checks before the registry schema may admit that extension.

## State visuals

Restrictive externally supplied presentation states take precedence over an exact-product image: Care pathway, held, quote-only, and coming-soon. Unknown state values fail closed. HTML owns current name, status, and action copy; generated pixels remain text-free and do not assert availability or purchasability.

## Integration gate

Do not wire these candidates into customer surfaces until the frozen core candidate is accepted by its owning lane, each exact candidate hash receives independent approval, the separately leased commerce/media dependency is removed and accepted, and a coordinated shared UI lease is active. The six new canonical identities remain intentionally unbound; imagery may not invent Product Control UUID, SKU, price, or release authority for them. Any Supabase, Render, migration, storage, or production write requires Samuel's current explicit approval and is outside this source lane.
