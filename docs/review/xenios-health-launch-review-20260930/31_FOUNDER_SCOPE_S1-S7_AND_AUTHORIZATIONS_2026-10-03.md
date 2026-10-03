# Founder scope S1–S7, D/E source-only schema, implementation corrections and calibration re-render (record)

## Source

Samuel stated this in the Claude review session on 2026-10-03, about the Execution Sprint v2 pack. Quoted verbatim:

> S1–S7 confirmed.
> Use those scope choices as binding implementation and review criteria for every successor. Please record them
> durably next to the A–E founder decision record.
> I also authorize source-only schema/migration work for D/E where needed to support variant identity, width, height,
> and content hash, but it must remain unregistered and unapplied. No managed migration or hosted database mutation
> is authorized.
> Incorporate the three non-blocking implementation corrections you identified:
>
> * Core must scope assisted-order CTA styling so admin-only surfaces are unchanged.
> * Timeline treatment should remain neutral or restrained teal rather than becoming uniformly purple.
> * D/E should use "An approved product image is not available." for the fallback, without `role="img"`, and place
>   "Illustrative image" outside the image pixels.
>
> I authorize re-rendering only the private calibration studies 03 (topical), 04 (Care state) and 05 (held/quote-only
> state) under the approved 1:1 framing gate and truthfulness rules. No Batch 1 product renders, no publication, no
> Core wiring, no production use.
> After recording this, remain the single independent acceptance reviewer. Do not become an implementation writer.
> Review each exact-SHA handoff as it arrives.

**Pack provenance** (local copy `Xenios_Execution_Sprint_2026-10-03_v2`, SHA-256):

| File | SHA-256 |
| --- | --- |
| `reference/FOUNDER_SCOPE_S1_S7.md` | `ac157bafd314504f37fe3a14a570627d6e41c6b61701029b6049760d6f8136a2` |
| `reference/AUTHORIZATIONS.md` | `bd9d6c0cc7ed8e26258769ef08b071a2b75b0591d388ac75b37a7b82805ce01c` |
| `reference/LANE_OWNERSHIP.md` | `0d77a2a848cf1bc46ec0369b58eef819a4ad7250f409731e7143d0a88974e45f` |
| `prompts/01_CORE_ABC_PREMIUM_SHELL.md` | `5f4d464b70618d1910be90a42ddb28ec02e15aa32b2849102def4d6a19514e01` |
| `prompts/04_IMAGERY_CALIBRATION_AND_BATCH1_PREP.md` | `9db004688e79091874175c289a5f375b3b46d8a5d8d638556fd9d112f08a6cd0` |
| `prompts/05_DE_MEDIA_FOUNDATION.md` | `5bbdc2769ff9e4c7cd07083f873df299d0f45b189f561fc00598112ed3c25f66` |
| `prompts/06_CLAUDE_COORDINATOR_MAX.md` | `a3b2527fc28d2664196b7b765642ad1e9bbb4564de0de886fedb488097f31c7d` |

## 1. Founder scope S1–S7 (confirmed; binding for implementation and review)

Copied verbatim from `reference/FOUNDER_SCOPE_S1_S7.md` (sha256 `ac157baf…`).

**S1, Health experience scope.**
- Use `Xenios Health` on every public-facing route that renders the shared public Navbar/Footer shell.
- This includes public Care, public Research and public B2B/corporate/legal pages that use that same shell.
- Exclude authenticated member/admin/operational chrome unless it already inherits the public shell.
- Do not resurrect `/health` as a separate microsite in this implementation slice.

**S2, Brand extent.**
- Slice 1 changes visible Navbar/Footer branding only.
- Do not change page-title suffixes, SEO/JSON-LD names, PWA text, offline page, site.webmanifest, OG raster or
  Wordmark.tsx yet.
- Those become a separate brand-hygiene slice after exact protected-file review.

**S3, Care naming.**
- Keep `Xenios Care` as the Care pathway/sub-brand under the global `Xenios Health` public brand.
- Keep `Xenios Research` where it identifies the Research pathway.

**S4, CTA scope.**
- Apply black rectangular CTA language to customer-facing public/member/assisted-order actions.
- Exclude admin-only queue/detail/status controls from this visual pass.
- Primary = black rectangle.
- Secondary = outlined rectangle.
- Tertiary = underlined/text action.
- Preserve current accessible control heights; never reduce below 44px.
- Do not globally compact `.btn`.

**S5, Accent/focus.**
- Use solid accessible purple `#7C3AED` for focus/selected states.
- Use teal `#14B8C7` as supporting accent.
- Purple-to-teal gradients only for sparse dividers or deliberate selected emphasis.
- No gradient focus rings.
- Do not color missing-image fallbacks.
- Do not delete old gradient tokens in this slice.

**S6, Public images.**
- First runtime target surfaces:
  - existing Early Access/catalog cards where customer-visible;
  - assisted-order catalog presentation where appropriate;
  - member catalog;
  - member product detail.
- Do not create a new public product-detail route in the first D/E slice.
- Runtime approval authority = Product Control.
- Imagery receipts establish asset/hash identity, not commerce authority.
- Exact-variant identity is preferred.
- Class/illustrative renders must be labelled as illustrative.
- Restrictive states remain independent of imagery.
- Reserve a full 1:1 neutral fallback slot.

**S7, Square media.**
- Enforce square geometry at approval/render boundaries.
- Master may remain 1254x1254.
- Initial delivery asset target = 1024x1024.
- No srcset derivatives in v1.
- Runtime descriptor should carry mediaId, variantId, altText, width, height, contentSha256, sourceVersion, policy,
  illustrative, expiresAt.
- Primary image only in v1, not galleries.
- Same delivery bytes/hash on card/detail in v1.

## 2. D/E source-only schema and migration authorization

- **Authorized:** source-only schema and migration work for D/E, where needed to support variant identity, width,
  height and content hash.
- **Constraint:** it must remain **unregistered and unapplied**.
- **Not authorized:** any managed migration apply, hosted database mutation, migration registration or production
  effect.
- **Review criterion:** a D/E successor may add a migration source file and verifier proven on a disposable local
  database only. Any registration in a managed ledger, or any apply, is a rejection.

## 3. Implementation corrections (binding review criteria)

| # | Lane | Correction | How Claude will verify |
| --- | --- | --- | --- |
| IC-1 | Core A/B/C | Assisted-order CTA styling must be scoped so **admin-only surfaces are unchanged**. `AdminAssistedOrderDetail.tsx`, `AdminAssistedOrderQueue.tsx` and `AdminAssistedOrderSession.tsx` currently share `.xenios-order-button` and `.xenios-order-page`. | Computed styles of admin controls are byte-for-byte unchanged against the baseline in browser evidence, and the selector scoping is shown in the diff. |
| IC-2 | Core A/B/C | The status **timeline treatment stays neutral or restrained teal**. It must not become uniformly purple; today it uses `assisted-order.css:131`, `border-left: 3px solid var(--accent)`. | The timeline border colour is neutral or teal in computed styles, not `#7C3AED`. |
| IC-3 | D/E | The fallback copy is exactly **"An approved product image is not available."** (existing Core wording). The fallback is **not** `role="img"`. **"Illustrative image" sits outside the image pixels**, never overlaid on the image. | Source and DOM check, plus a pixel-occlusion check showing no overlay inside the image box. |

## 4. Private calibration re-render authorization

> I authorize re-rendering only the private calibration studies 03 (topical), 04 (Care state) and 05 (held/quote-only
> state) under the approved 1:1 framing gate and truthfulness rules. No Batch 1 product renders, no publication, no
> Core wiring, no production use.

- **Covers:** re-rendering studies 03, 04 and 05 only, as private calibration assets.
- **Framing gate,** for a square of side S:
  - subject height 0.61–0.75 S, target about 0.68 S;
  - horizon 0.521–0.575 S;
  - top margin 0.163–0.179 S;
  - centred, with no edge contact;
  - kernels scaled with S.
- **Does NOT cover:**
  - the 25 Batch 1 product candidates;
  - publication or Product Control wiring;
  - Core wiring or production use.

## 5. Reviewer role (unchanged)

Claude remains the single independent acceptance reviewer and does not write implementation code. Each exact-SHA
handoff is reviewed as it arrives, against:
- this record;
- the A–E record (`a4e647e`, doc 28);
- the protected-baseline authorization (`bfec2d8`, doc 30);
- the impact map (`10c40cd`, doc 29).

**Standing gates:**
- no manifest re-cut before exact-byte review and Samuel's approval of each old→new hash pair;
- GATE-01 stays open;
- production stays NOT READY until the release blockers close and an exact release candidate qualifies.
