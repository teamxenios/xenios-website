# System Labs — reference pattern analysis

Source class: **E. External reference.** Observed read-only on 2026-09-26: public homepage and treatments index at systemlabs.com, plus third-party review summaries found by web search. No intake was started, no account created, no payment attempted. Individual treatment detail pages were **not** observed (linked, e.g. `/treatments/nad`, not rendered in the fetch); anything said about detail pages below is marked NOT OBSERVED.

Reconciliation 2026-09-26: a written findings document **does** exist — `Downloads/System_Labs_Super_Mega_UX_UI_Audit.pdf` (36 pages, audit date 2026-07-24; scope homepage, marketing pages, intake entry, login, FAQ, contact, legal and all eight treatment pages). It is summarized in §Written audit findings below (paraphrased; no text copied). The file name `SYSTEM_LABS_REFERENCE_FINDINGS_FOR_XENIOS_2026-09-26.md` named in CLAUDE_03 was not found; the PDF is treated as the equivalent.

The only internal mention of System Labs is Samuel's remark on the 2026-09-25 Compass call that it is "the same exact path" as Xenios's clinical side, with a funding figure and a patient count. **Neither figure may appear on any Xenios page** (they describe another company and are unverified here).

## What they do well (patterns — adapt)

| Dimension | Observed pattern | Why it works | Xenios adaptation |
| --- | --- | --- | --- |
| Category statement | One short line naming *what* (the product class) and *who guides it* (clinicians). | Visitor knows the offer in one read. | Write our own line; it may only name what is true for Xenios's Care and Research pathways today (see `CLAIM_LEDGER.csv` C-001, B-2). |
| Header | 3–4 nav items (Treatments, FAQs, Contact), **Login** always visible, one primary CTA repeated. | Returning users never hunt; new users have one obvious action. | Header keeps **Sign In** persistent at every width and one primary CTA (**Start Care**). |
| Hero | Headline + one primary CTA + a small live-availability note. | No competing choices above the fold. | One primary (**Start Care**), one secondary (**Explore Products**); the audience selector sits *below* the hero, not inside it. |
| Product presentation | Grid of ~6 treatment cards: image, name, 2–4-word purpose, price (regular and first-month), one CTA per card. | Price visible before commitment; one action per card. | Product card contract in `PAGE_SPECIFICATIONS.md` §P-03: exact product + variant, plain purpose, **price or honest price state**, pathway badge, one CTA. No introductory-discount mechanics unless Samuel approves a real offer. |
| Process | Three numbered steps (intake → clinician review → treatment ships). "Get Started" after the steps. | Reduces fear of the unknown. | Three-step Care explainer; separate three-step Research-order explainer. Steps must match our real lifecycle (request → human review → secure clinical handoff), not theirs. |
| Trust | Clinician/advisor section, testing criteria callout, press logos, reviews carousel, compliance seal in footer. | Stacks social proof and safety. | We may only show what we can prove: documented lot/COA process (where records exist), clinician *decision independence*, legal entity. No reviews, press logos, patient counts, named clinicians, seals, or testing lists until each is verified and approved. |
| CTA vocabulary | Few verbs, repeated: "See if you qualify", "View Treatment", "Get Started", "Login". | Each verb means one thing. | Controlled vocabulary in `05_COPY_DECK.md` §1. |
| FAQ | Linked from header; disclaimers in footer. | Answers objections without cluttering the hero. | Header "How It Works" + a real FAQ page; regulated disclaimers adjacent to the claim they qualify, not only in the footer. |
| Category landing | Footer groups products by outcome category (performance, longevity, weight). | Lets a visitor start from a goal. | **Do not adopt now.** Outcome-category landing pages are regulated-claim-adjacent; deferred to a later, counsel-reviewed phase (H-02). Group by *pathway* (Care / Research / Assisted) instead. |
| Mobile | Single-column cards, sticky header with Login + CTA. | Same hierarchy at every width. | 390px spec keeps Sign In + primary CTA in the header without opening a menu. |

## What we must not copy

- Any paragraph, headline wording, visual asset, layout-specific artwork, source code, or icon set.
- Reviews, testimonials, star ratings, press logos, patient counts, funding figures.
- Clinician names/credentials, pharmacy statements, testing parameter lists, LegitScript-style seals.
- Pricing mechanics ("first month" discounts), shipping promises ("two-day", "temperature-controlled"), "no insurance needed", state coverage.
- Outcome language (energy, recovery, metabolism, healthy aging) — Xenios has no clinical review of such claims.

## Where Xenios is structurally different (do not force-fit)

1. **Two pathways, not one.** System Labs is Care-only. Xenios has Care (clinician-governed, via a secure clinical system) **and** Research ordering (research-use acknowledgment, human-verified manual payment, no clinical relationship). The site must show the difference in one glance; System Labs never needs to.
2. **Businesses are a first-class audience.** Practices, partners, suppliers and candidates have no equivalent on System Labs.
3. **Our Care intake is not on the website.** The public form collects routing details only; clinical intake happens after human review in a secure system. "See if you qualify" would overpromise; our verb is **Start Care**, and the confirmation must say this is not medical intake.
4. **Prices are not generally public today.** Only 34 SKUs have a founder-approved price book; public storefront is dark; September retail prices are unapproved candidates. We adopt *price visibility as a principle* and implement it only where C-2 approves.

## Proposed category statement — evaluation

The phrase "Premium peptides, guided by licensed clinicians" was proposed as a *concept*. Word-by-word test against Xenios today:

| Word | True for Xenios today? | Evidence / gap |
| --- | --- | --- |
| "Premium" | Unsupported superlative. | No comparative quality evidence; zero vendor COA responses recorded (`docs/production-completion/catalog/README.md`). |
| "peptides" | Partly. | 242 Care-pathway clinical formulations + 135 research peptide materials exist in catalog data; none have approved public copy. Also invites Care/Research conflation. |
| "guided by licensed clinicians" | Only for the Care pathway, and only after secure handoff. | `PROVIDER_READINESS.md` shows no clinician/pharmacy provider marked ready; meeting names three directors (unverified; C-006). Research orders are explicitly **not** clinician-guided. |

Verdict: **do not use as written.** Recommended (B-2, revised 2026-09-26): the neutral line *"Care and research products, clearly separated."*; "Clinician-guided" only after C-004 is verified. Final wording is a founder decision after clinical/counsel review of "clinician-guided".


## Written audit findings (System Labs audit PDF, 2026-07-24) and what they change for Xenios

The audit scored System Labs 61/100 overall: strong brand and visual direction, weaker pricing clarity (48), content accuracy (45) and clinical transparency (54). Its own register is a list of mistakes Xenios must not repeat.

| SL finding (paraphrased) | Severity there | Xenios rule it creates | Where enforced |
| --- | --- | --- | --- |
| Treatment copy written for one delivery method reused on pages for another (wrong route-of-administration text) | Critical | Product copy is per-product and approved; no shared template paragraphs about administration; format field shows only the verified variant label | C-1, C-017, C-047; PAGE_SPECIFICATIONS P-04 |
| Subscription/renewal/cancellation inconsistent across pages | Critical | Price shown = the price the customer pays; no first-month or renewal mechanics; payment terms appear only in the quote | C-2; copy deck §5 |
| Same testimonials repeated across unrelated treatments | High | No testimonials or reviews at launch | CLAIM_LEDGER C-014 |
| Testing claims prominent, evidence not exposed | High | No testing badge or claim until lot evidence exists; Quality page explains process and lot lookup | D-2, C-008, C-009 |
| "2-minute, no appointment" contradicts detailed intake/consultation | High | Care steps must match the real lifecycle (request → human review → secure visit); no time-to-complete claim | D-1; copy deck §6 |
| No public medical-team/provider page | High | Xenios has the same gap; a Medical team page is deferred until clinicians are verified and approved (H-07) rather than faked | D-2 |
| Benefits stated without evidence hierarchy | High | No benefit/outcome language on product cards; "What this is" only | B-2, C-1 |
| Index navigation exposes fewer items than exist | Medium | Product index shows every published product; filters, not a partial nav | P-03 |
| Duplicate homepage path | Medium | Redirect map with 301s; one canonical per page | IA redirects; U-110 |
| Copy defects / duplicated labels | Medium | Controlled-vocabulary and claim lint tests | U-G03, U-G04 |
| Cookie-preferences link missing vs privacy policy | Medium | Footer legal links must match what policies reference | U-G06 (extend to policy-referenced links) |
| Login page has no recovery/support context | Medium | Sign In page carries reset, activation, Care-patient note and support | P-15 |

Its recommended funnel ("choose goal or product → short comparison with price → review clinician/pharmacy credibility → timed intake → decision → plan and cost before payment → portal") validates our order: price and pathway visible before any submission; credibility shown only when verifiable.
