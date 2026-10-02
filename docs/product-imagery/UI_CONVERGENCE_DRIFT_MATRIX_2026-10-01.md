# Founder preview UI-convergence drift matrix

This matrix compares the prior private prototype at
`8b06da560978c8c4b1ce325da8813373bffbc845` with the frozen Core UI reference at
`c0e25c73a0d789829ea213e2ee040c68e06f0a75` and the corrected private preview.
It responds to Claude review
`ae5c410ab6e5c27df94c5bdc5b6533ab821b6d4c`.

`CURRENT CORE` means observed Core behavior. `PROPOSED XENIOS HEALTH` means a
private founder decision study only.

| Area | Prior 8b06da5 drift | Corrected private preview | Residual authority |
| --- | --- | --- | --- |
| Global shell | Separate cream/taupe site and custom chrome | Dominant public Clarity shell, white/soft-gray bands, Core container tokens | None for the private mirror |
| Header | Nonsticky 78px custom header | 68px sticky Core-style header | Core remains unchanged |
| Wordmark | Orb plus uppercase `XENIOS HEALTH` | Current header renders exact Core mark plus `Xenios` | `Xenios Health` shown only as founder option A |
| Primary navigation | Home, Featured, Products, Care, Status, QA | Current Core labels and ordering | Preview-only destinations moved to a separate private subnav |
| Header actions | One pill `Explore catalog` | `Sign In`, rectangular `Start Care`, and Menu behavior at Core breakpoints | Mixed legacy CTA island remains a Core inconsistency |
| Footer | Custom prototype footer | Core-style brand, disclosure, and link grouping | Mobile footer name leak remains documented, not silently fixed |
| Typography | Helvetica/Arial fallback and custom type ladder | Bundled Inter Tight 400/500/700/800/900 and JetBrains Mono 500/600 | Core's undefined `body-xs` and synthetic weights remain documented |
| Containers | Four unrelated content edges | 16, 20, 24, 28, 32, 40, 48, and 56px Core gutters at the matching breakpoints | Assisted-order wide layout remains documented |
| Responsive breakpoints | Only 1120/840/600 | Core-aligned 375, 390, 768, 820, 1024, 1280, and 1440 rules | Evidence also covers 834, 430, 360, and 320 |
| Buttons | Large pills and inconsistent light/ghost language | 4px black primary, outlined secondary, underlined ghost | Founder option B asks whether later Core work removes the green-pill island |
| Card radius | 22 to 32px product cards | 4px product cards, 18px informational comparison panels only | Core radius inconsistency remains listed |
| Hero | Full black gradient-led visual system | White Core-style hierarchy with one small information panel | No giant gradient headline remains |
| Purple-to-teal | Large decorative gradient language | Restrained 4px divider only on proposal examples | Founder option C required before Core use |
| Product catalog | Invented four-column image-led storefront | Core-style search, filters, result count, card hierarchy, and responsive grid | Imagery is explicitly labeled proposal-only |
| Current public card policy | Missing | Text-only current Core card shown for Research, Care, held, quote-only, and packaging-unverified | Founder option D required |
| Proposed public card policy | Treated as the whole prototype | Shown side by side with current text-only policy | No publication or runtime integration authority |
| Existing member media | Not represented | Current 4:3 `contain` behavior shown and source-attributed | Gated behavior is presentation evidence only |
| Proposed media geometry | Square plus `cover` and visual effects | Square 1:1, `contain`, exact source pixels | Founder option E required |
| Product detail | Invented public PDP | Labeled private comparison; actual public unavailable behavior remains in Core evidence | Core public route stays unchanged |
| Image identity continuity | Same job generally used, but CSS changed visible pixels | Card/detail expose the same SHA-256 and use `contain` | Exact assets remain provisional |
| Saturation and contrast | CSS `saturate(.82) contrast(.98)` | No image filter declaration | Corrected |
| Vignette | Inset pseudo-element overlay | No image overlay or vignette | Corrected |
| Forced crop | Card/detail `object-fit: cover` | All preview media and QA thumbnails use `object-fit: contain` | Corrected |
| Safe fallback | Every slot received a substitute visual | Explicit `Approved image unavailable` state with no borrowed asset | Production fallback policy still requires Core work after option D/E decisions |
| Care | Invented dark product pathway | Core-style Care hierarchy and explicit clinical boundary | Images remain proposal-only |
| Held state | Available only as a generic detail | Dedicated held surface plus current/proposed card pair | No order or price authority |
| Quote-only state | Available only as a generic detail | Dedicated quote-only surface plus current/proposed card pair | No direct order or implied price |
| Packaging-unverified state | Neutral substitute looked like a product | Safe text fallback is shown in the policy and detail comparisons | No package identity claim |
| Coming soon | Styled as part of the parallel site | Core-style text-only names, no logos, packaging, price, checkout, or partner claim | No launch authority |
| Account and status | Invented combined customer journey | Separate synthetic status, account, timeline, history, and support panels using Core hierarchy | No credentials, lookup, customer data, or hosted call |
| Current-Core rendered evidence | Absent | Exact public screenshots from Claude review plus exact-source synthetic member catalog/detail renders at 1440 and 390, all sourced from c0e25c73 | Synthetic member behavior remains UI presentation evidence only |
| Calibration | Six studies used as global website art direction | Six files preserved byte-for-byte and used only for placement tests | Approval false; Batch 1 false |
| Truth/safety boundary | Present but visually subordinate | Repeated authority boundary plus zero-public-approval accounting | All production gates remain closed |
| Responsive proof | 45 captures at only 1440, 834, 390, and 320, some viewport-only | 134 full-page captures; 120 matrix captures over 12 surfaces and 10 widths | Browser receipt is authoritative for this private successor |
| Catalog QA | 423 covered through nine desktop pages | 423/423 covered again, with responsive QA page at all ten widths | Exact render count remains 0 |

## Evidence result

- Responsive widths: 1440, 1280, 1024, 834, 768, 430, 390, 375, 360, 320.
- Responsive surfaces: home, Products, Featured, product-card comparison,
  product-detail comparison, Care, held, quote-only, Coming soon,
  account/status, founder decisions, and catalog QA.
- Full-page captures: 134.
- Responsive matrix captures: 120.
- Catalog IDs covered: 423 of 423.
- Broken images: 0.
- Horizontal overflow findings: 0.
- Severe browser console messages: 0.
- External network boundary violations: 0.

Machine-readable receipt:
`docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json`

Exact Core synthetic member catalog/detail receipt:
`docs/product-imagery/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic-catalog-detail-evidence.json`

The exact Core harness completed all four requested member catalog/detail
captures with `AUTOMATED_PASS`, then stopped on an out-of-scope account-persona
selector. The receipt records that later limitation explicitly; it does not
promote the partial full-journey run into authentication or live-backend proof.

Historical evidence under `docs/product-imagery/evidence/founder-preview/` is
retained as the prior 8b06da5 baseline and is not mixed into the corrected
receipt.
