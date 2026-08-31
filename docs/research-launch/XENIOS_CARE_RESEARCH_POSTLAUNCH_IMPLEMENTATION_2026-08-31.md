# Xenios Care + Research post-launch implementation report

Date: 2026-08-31
Base: `1fd84ad2b3320dada4da7f58012d4311e5cd1639`
Branch: `codex/xenios-care-research-postlaunch-20260831`

## Scope and authority

- Founder state: State A, active Care pathway.
- Public brand: Xenios Care + Research, with Care presented first and the two authorities kept separate.
- Canonical member-catalog authority: the existing server-side Product Control catalog projection.
- Canonical price authority: the existing current-price and authoritative-price resolvers. No browser price book was added.
- The approved workbook was used only as a private reconciliation input. Its customer-safe generated output provides education and exact-row coverage, but it does not authorize transactions or replace the server-side catalog and price authorities.
- The implementation diff adds no route, API, migration, database write, checkout behavior, payment behavior, or deployment-configuration change. Production deployment is recorded separately below.

## Input and education coverage

The approved workbook SHA-256 is `53161ae8c18a2c44b3dfc0c241bd3db489a2ed35267b42002f261bad27e7a95a`.

| Coverage item | Result |
| --- | ---: |
| Workbook source rows | 426 |
| Customer-safe represented rows | 426 |
| Unmapped education rows | 0 |
| Duplicate exact source identities | 0 |
| Canonical product-plus-channel education bindings | 226 |
| Exact source variants represented | 426 |
| Research rows | 127 |
| Clinical/provider rows | 244 |
| Classification-pending rows | 32 |
| Supplement rows | 20 |
| Nonclinical/topical rows | 3 |
| Current informational products receiving a profile | 420/420 |
| Current informational variants receiving a profile | 420/420 |
| Missing education profiles | 0 |
| Ambiguous cross-lane merges | 0 |
| Supplier/cost leakage findings | 0 |

Every detail profile preserves the runtime product lane and selected variant identity. Guide-covered compounds receive guide-grounded context and an approved evidence label. Other provider, supplement, topical, support, or unclassified records receive a product-specific limitation rather than invented benefits, mechanisms, indications, or regulatory claims. `What remains unknown` and `What this does not prove` always render.

## Price reconciliation

No numeric workbook price was copied into the client bundle. No source-authoritative server price was changed because this isolated offline worktree could not prove an exact current Product Control record, publishable unit/package basis, and active pricing gate together. Existing exact server-supplied prices continue to render unchanged.

| Required price report item | Result |
| --- | ---: |
| Workbook rows | 426 |
| Exact product + formulation + pathway matches in the current informational projection | 397 |
| Research prices updated | 0 |
| Clinical prices imported into a server-authoritative record | 0 |
| Clinical rows kept as review-only pricing | 243 |
| Supplement rows held for MSRP/MAP verification | 20 |
| Classification holds | 32 |
| Re-source holds | 10 |
| Price-on-request rows | 2 |
| Product-specific review rows | 3 |
| Exact projection mismatches left unchanged | 29 |
| Zero-price rows | 0 |
| Supplier/cost leakage findings | 0 |

Runtime presentation rules now preserve an exact positive server price, show `Pricing shown after clinical review` when a clinical patient/package price is absent, show `Price on request` for a request-only informational entry, and never use `$0` as a missing-price substitute.

### Exact projection mismatches left unchanged

These approved workbook identities are represented in the education reconciliation, but they do not exactly match the current checked-in informational projection by normalized product, formulation, and pathway. They were not fuzzily reclassified and no price was changed.

- Rows 402–421: the 20 supplement identities Annatto Pro 125; Brain Restore; Chondro Jointaide; Collagen Renew (Dynamic Multi); Fruits & Greens; GI Defend; Hydrate; Inflam-Eze (30-serving); Longevity Essentials NAD+; Magtein (Magnesium L-Threonate); Mito Recharge; Omega Pure EPA-DHA 2400; PRM Resolve; PeriMenopause Support; Rejuvenate+; Stress Essentials Balance; Stress Essentials Calm; UltraBiotic Akkermansia Plus; UltraBiotic Prebiotic; and Uplift+. Their approved supplement pathway differs from the current projection.
- Rows 422–424: Exosome Cream, GHKcu, and Radient XO Serum. Their approved nonclinical/topical pathway differs from the current projection.
- Row 425: Retatrutide, `RETATRUTIDE 60 mg`, new exact Research formulation.
- Row 426: CJC-1295 + Ipamorelin, `CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)`, new exact Research product identity.
- Row 427: MOTS-C, `MOTS-C 40 mg`, new exact Research formulation.
- Row 428: Glutathione, `GLUTATHIONE 600 mg`, new exact Research formulation.
- Row 429: Oxytocin, `OXYTOCIN 10 mg`, new exact Research formulation.
- Row 430: Hexarelin, `HEXARELIN 5 mg`, new exact Research formulation.

## Route and control conservation

| Route | Before | After |
| --- | --- | --- |
| `/research` | 55 links, 0 buttons, 0 forms | 55 links, 0 buttons, 0 forms |
| `/research/access-hub` | 53 links, 0 buttons, 0 forms | 53 links, 0 buttons, 0 forms |
| `/research/how-it-works` | 46 links, 0 buttons, 0 forms | 46 links, 0 buttons, 0 forms |
| `/research/about` | 43 links, 0 buttons, 0 forms | 43 links, 0 buttons, 0 forms |
| `/research/faq` | 42 links, 18 buttons, 0 forms | 42 links, 18 buttons, 0 forms |

Conservation result: 0 new routes, 0 removed routes, 0 net-new buttons, 0 net-new button-like CTAs, 0 new forms, 0 new API calls, 0 new database writes, and 0 new migrations.

## Verification

- Deterministic generator rerun: 426 represented rows, 226 product-plus-channel bindings.
- Focused Care, Tebra-authority, public-brand, catalog, product-detail, account-state, route-guard, accessibility, privacy-boundary, and conservation tests pass: 20 files and 327 tests.
- TypeScript no-emit check passes under the pinned Node 20.19.0 runtime.
- Client and built-output leakage scans report zero supplier identity, wholesale, margin, or internal pricing leakage.
- The production build passes under the pinned runtime.
- Focused local Chromium smoke passes 54/54 desktop, mobile, and 200% zoom-equivalent route/component runs, including the 11 changed public routes, an authorized member-catalog fixture, Research, clinical, blend, and topical detail fixtures, FAQ disclosure behavior, navigation reachability, single-main structure, and horizontal-overflow checks.

## Production deployment

Samuel's later explicit production command authorized deployment of the exact
reviewed successor only. Commit
`abe03ca3a836dffb10699c0c39883119e2a8f816` was deployed to the production
Render service as `dep-daaqncid0e5s739067tg` and became live at
2026-08-31T16:29:36.440651Z.

Post-deploy verification passed:

- 27/27 critical endpoint comparisons were `SAME`, with 0 regression and 0 human-review item;
- 22/22 rendered public-route cases passed across the 11 changed routes at desktop and mobile viewports;
- `/api/health` returned HTTP 200;
- `/api/research/early-access/assisted-orders/config` returned HTTP 200 with `enabled:true`;
- Render reported no application error log and no 5xx request from deployment start through 2026-08-31T16:39:59Z.

No environment variable, migration, database, pricing-authority, payment,
clinical, pharmacy, account, or invitation mutation accompanied the deploy.
The existing Care runtime remains fail-closed: production reports the Care
capability disabled and its Tebra portal/scheduling handoffs as
`care_unavailable`. The approved State A presentation is live, but this deploy
does not claim technical Care/Tebra activation.

The complete immutable deployment record is
`docs/research-launch/DEPLOY_RECORD_2026-08-31_CARE_RESEARCH_POSTLAUNCH.md`.
