# Product imagery v3 acceptance trace

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Founder v3 spec attached exactly | Checked-in spec SHA-256 `e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c` | pass |
| Reviewed catalog accounting | 426 source rows, two reviewed merges, 424 canonical targets, 423 exposed after shipping exclusion | pass, target not runtime-materialized |
| Mounted truth distinguished | State audit reports current 420/419 separately from target 424/423 | pass |
| Hex/Oxy identity correction | GRP-0425 and GRP-0426 are owners; GRP-0407/0402 and Product Control identities are forward-only | pass |
| Business state outside imagery | Coverage rows contain no display state, price, workflow, action, Care, hold, cart, sellability, or inventory field | pass |
| Formulation hold | GRP-0422 is the sole reviewed structured hold in the state audit; imagery does not own it | pass |
| Coming-soon distinction | zero catalog coming-soon rows; Superpower and Mito Health recorded as two separate intended offers | pass |
| Pre-v3 public bytes removed | ten exact WebPs preserved outside public roots as permanently nonapprovable evidence | pass |
| Sanitized Batch 0 | 25 request-only generic class jobs; fixture provenance physically separate | pass |
| Prompt, receipt, and output binding | request staging name carries prompt SHA; 25 immutable evidence names carry output SHA; receipts bind spec, payload, prompt, contract, byte size, source identifier, timestamp, final path, and output hash | pass |
| Batch 0 visual evidence | 25/25 non-public originals plus hash-bound 5×5 contact sheet; initial inspection found no visible text, logos, certifications, people, or third-party marks | pass, independent approval still pending |
| Browser decode evidence | Chrome headless loaded all 25 exact evidence paths with `complete=true` and intrinsic 1254×1254 dimensions; full-page screenshot and machine-readable record are hash-bound | pass, not runtime integration |
| Ambiguous mixed topical form | the two `Topical Gel / Serum` rows use `packaging_unverified`; the tube render is retained only as an unassigned generic gel-class study | pass |
| Public/runtime assets | zero approved, zero public, zero runtime evidence references | pass, expected |
| Resolver safety | canonical/PC/legacy/forward convergence; restrictive external state first; unknown state and unsealed assets fail closed | source pass, not UI-wired |
| Independent named visual review | exact output hashes not yet independently approved | pending |
| Catalog/binding regeneration | reviewed 424 target not yet materialized | blocked outside this lane |
| Commerce/media decoupling | separate shared-source and forward-migration lease required | blocked outside this lane |
| UI/browser integration | waits on approved bytes and prior gates | blocked |
| Production mutation | none performed; current explicit approval required for any future mutation | pass |

Focused source gates are `node --test scripts/product-imagery/product-imagery.test.mjs` and `node scripts/product-imagery/verify.mjs`. A passing source gate does not substitute for independent pixel review, browser QA, catalog regeneration, release review, or production authorization.
