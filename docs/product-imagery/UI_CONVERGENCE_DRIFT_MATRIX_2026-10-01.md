# Founder preview UI-convergence drift matrix

This matrix compares the prior private prototype at
`8b06da560978c8c4b1ce325da8813373bffbc845` with the frozen Core UI reference at
`c0e25c73a0d789829ea213e2ee040c68e06f0a75` and the corrected private preview.
The final narrow correction responds to Claude review
`893e32c93031705ebbe94531a0d9a8110967fb16`, which reviewed source
`797b064d9c07012b95133e588222b2b2293ff341` / tree
`e5108ca4e038e420b0effe680f7f815db05002a8` at records commit
`8dcba8ff14ce553445bbb28ca430dabe667c73e0`.

`CURRENT CORE` means actual captured Core behavior or exact source-verified
component behavior with the evidence limitation stated. It never means a
preview reconstruction. `PROPOSED XENIOS HEALTH` means a private founder
decision study only.

The row-complete A/B/C record is
`docs/product-imagery/UI_CONVERGENCE_THREE_WAY_MATRIX_2026-10-01.json`. It
preserves all 207 Claude review rows: 111 material drift, 38 minor drift, 25
allowed explorations, and 33 Core-internal inconsistencies. Every row names the
surface, actual Core behavior, old preview behavior, proposed Health delta,
accidental-versus-intentional classification, and required action.

| Area | Prior 8b06da5 drift | Corrected private preview | Residual authority |
| --- | --- | --- | --- |
| Global shell | Separate cream/taupe site and custom chrome | Dominant public Clarity shell, white/soft-gray bands, Core container tokens | None for the private mirror |
| Header | Nonsticky 78px custom header | 68px sticky Core header; name hides below 520px, condensed nav begins at 1024px, full nav begins at 1280px | `Sign In`, `Start Care`, and the mark remain visible at every required width; Core remains unchanged |
| Wordmark | Orb plus uppercase `XENIOS HEALTH` | Core's actual `currentColor` CSS-mask mark plus `Xenios` | `Xenios Health` shown only as founder option A; no new logo |
| Primary navigation | Home, Featured, Products, Care, Status, QA | Current Core labels and ordering | Preview-only destinations moved to a separate private subnav |
| Header actions | One pill `Explore catalog` | `Sign In`, rectangular `Start Care`, and Menu behavior at exact Core breakpoints | The assisted-order action remains a separately labelled Current Core sample, not a `Legacy` claim |
| Footer | Custom prototype footer | Core-style brand, disclosure, and link grouping | Mobile footer name leak remains documented, not silently fixed |
| Typography | Helvetica/Arial fallback and custom type ladder | Bundled Inter Tight 400/500/700/800/900 and JetBrains Mono 500/600 | Core's undefined `body-xs` and synthetic weights remain documented |
| Containers | Four unrelated content edges | 16, 20, 24, 28, 32, 40, 48, and 56px Core gutters at the matching breakpoints | Assisted-order wide layout remains documented |
| Responsive breakpoints | Only 1120/840/600 | Core-aligned 375, 390, 768, 820, 1024, 1280, and 1440 rules | Evidence also covers 834, 430, 360, and 320 |
| Buttons | Large pills and inconsistent light/ghost language | Current assisted-order sample preserves `#183d2d`, 44px, pill radius, Inter Tight 750; proposed sample remains black and rectangular | Founder option B offers keep-current or later scoped convergence |
| Card radius | 22 to 32px product cards | 4px product cards, 18px informational comparison panels only | Core radius inconsistency remains listed |
| Hero | Full black gradient-led visual system | White Core-style hierarchy with one small information panel | No giant gradient headline remains |
| Purple-to-teal | Large decorative gradient language | Restrained divider appears only inside the proposed C column | Keep-current remains explicit; founder option C is required before any broader use |
| Product catalog | Invented four-column image-led storefront | Core-style search, filters, result count, card hierarchy, and responsive grid | Imagery is explicitly labeled proposal-only |
| Current public card policy | Missing | Faithful text-only `EarlyAccessProductCard` anatomy shown for Research, Care, held, quote-only, binding-pending, and packaging-unverified; restrictive states have no action or quantity control | Founder option D required |
| Proposed public card policy | Treated as the whole prototype | Shown side by side with current text-only policy | No publication or runtime integration authority |
| Existing member media | Not represented | Optional 4:3 `contain` behavior is labelled source-verified component behavior, not a live/observed render | No stronger runtime or publication claim is made |
| Proposed media geometry | Square plus `cover` and visual effects | Square 1:1, `contain`, exact source pixels | Founder option E required |
| Product detail | Invented public PDP | Labeled private comparison; actual public unavailable behavior remains in Core evidence | Core public route stays unchanged |
| Image identity continuity | Same job generally used, but CSS changed visible pixels | Card/detail expose the same SHA-256 and use `contain` | Exact assets remain provisional |
| Saturation and contrast | CSS `saturate(.82) contrast(.98)` | No image filter declaration | Corrected |
| Vignette | Inset pseudo-element overlay | No image overlay or vignette | Corrected |
| Forced crop | Card/detail `object-fit: cover` | All preview media and QA thumbnails use `object-fit: contain` | Corrected |
| Safe fallback | Every slot received a substitute visual | Explicit `Approved image unavailable` state with no borrowed asset | Production fallback policy still requires Core work after option D/E decisions |
| Care | Invented dark product pathway | Preview-authored Care copy is explicitly labelled `PROPOSED XENIOS HEALTH`; Actual Core remains a separate captured column | Images and copy remain proposal-only |
| Held state | Available only as a generic detail | Dedicated held surface plus current/proposed card pair | No order or price authority |
| Quote-only state | Available only as a generic detail | Dedicated quote-only surface plus current/proposed card pair | No direct order or implied price |
| Packaging-unverified state | Wrong witness (`GRP-0424`, actually binding-pending) | Authoritative packaging-unverified witness `GRP-0073` compares current no-image against reviewer-directed neutral calibration-06 media | No package form, third-party package, or package identity claim |
| Coming soon | Styled as part of the parallel site | Core-style text-only names, no logos, packaging, price, checkout, or partner claim | No launch authority |
| Account and status | Invented combined customer journey | Corrected proposal is shown beside exact-source dev-only Core account, order-history, and order-detail fixtures at 1440 and 390 | Fixtures bypass auth and prove UI presentation only; no credentials, live API, or commerce proof |
| Current-Core rendered evidence | Absent | Exact public screenshots plus exact-source synthetic member catalog, detail, account, order-history, and order-detail renders, all sourced from c0e25c73 | Synthetic behavior remains UI presentation evidence only |
| Three-way review | Core, old preview, and proposed delta were split across records | Six visual A/B/C triptychs plus the complete 207-row JSON matrix | Every proposal remains pending exact successor review |
| Calibration | Six studies used as global website art direction | Six files preserved byte-for-byte and used only for placement tests | Approval false; Batch 1 false |
| Truth/safety boundary | Present but visually subordinate | Repeated authority boundary plus zero-public-approval accounting | All production gates remain closed |
| Responsive proof | 45 captures at only 1440, 834, 390, and 320, some viewport-only | 144 full-page captures; 130 matrix captures over 13 surfaces and 10 widths | Browser receipt is authoritative for this private successor |
| Catalog QA | 423 covered through nine desktop pages | 423/423 covered again, with responsive QA page at all ten widths | Exact render count remains 0 |

## Evidence result

- Responsive widths: 1440, 1280, 1024, 834, 768, 430, 390, 375, 360, 320.
- Responsive surfaces: home, Products, Featured, product-card comparison,
  product-detail comparison, Care, held, quote-only, Coming soon,
  account/status, three-way comparison, founder decisions, and catalog QA.
- Full-page captures: 144.
- Responsive matrix captures: 130.
- Catalog IDs covered: 423 of 423.
- Broken images: 0.
- Horizontal overflow findings: 0.
- Severe browser console messages: 0.
- External network boundary violations: 0.

Machine-readable receipt:
`docs/product-imagery/evidence/ui-convergence/corrected-preview/founder-preview-browser-evidence.json`

Exact Core synthetic member catalog/detail receipt:
`docs/product-imagery/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic-catalog-detail-evidence.json`

Exact Core synthetic account/order receipt:
`docs/product-imagery/evidence/ui-convergence/core-account-synthetic-c0e25c73/synthetic-account-order-evidence.json`

The account/order capture uses Core's development-only review document and
repository-owned synthetic fixtures. It covers overview, order history, and
order detail at 1440 and 390 with zero overflow, severe console messages,
failed responses, or network-boundary violations. It bypasses authentication
and is explicitly `UI_PRESENTATION_ONLY`; it does not prove a signed-in
session, route guards, live adapters, pricing, payment, or fulfillment.

Local review command:

`node scripts/product-imagery/serve-founder-preview.mjs 5178`

Open
`http://127.0.0.1:5178/founder-preview/index.html?view=three-way`.

Historical evidence under `docs/product-imagery/evidence/founder-preview/` is
retained as the prior 8b06da5 baseline and is not mixed into the corrected
receipt.
