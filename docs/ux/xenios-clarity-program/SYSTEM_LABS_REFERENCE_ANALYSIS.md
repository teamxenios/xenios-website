# System Labs — reference pattern analysis

Source class: **E. External reference.** Observed read-only on 2026-09-26: public homepage and treatments index at systemlabs.com, plus third-party review summaries found by web search. No intake was started, no account created, no payment attempted. Individual treatment detail pages were **not** observed (linked, e.g. `/treatments/nad`, not rendered in the fetch); anything said about detail pages below is marked NOT OBSERVED.

A written "System Labs reference findings" file was named as an input but does not exist in the repository, Downloads, Drive or mail; this document replaces it and is limited to what was actually observed.

The only internal mention of System Labs is Samuel's remark on the 2026-09-25 Compass call that it is "the same exact path" as Xenios's clinical side, with a funding figure and a patient count. **Neither figure may appear on any Xenios page** (they describe another company and are unverified here).

## What they do well (patterns — adapt)

| Dimension | Observed pattern | Why it works | Xenios/Eon adaptation |
| --- | --- | --- | --- |
| Category statement | One short line naming *what* (the product class) and *who guides it* (clinicians). | Visitor knows the offer in one read. | Write our own line; it may only name what is true for Eon today (see `CLAIM_LEDGER.csv` C-001, D-03). |
| Header | 3–4 nav items (Treatments, FAQs, Contact), **Login** always visible, one primary CTA repeated. | Returning users never hunt; new users have one obvious action. | Header keeps **Sign In** persistent at every width and one primary CTA (**Start Care**). |
| Hero | Headline + one primary CTA + a small live-availability note. | No competing choices above the fold. | One primary (**Start Care**), one secondary (**Explore Products**); the audience selector sits *below* the hero, not inside it. |
| Product presentation | Grid of ~6 treatment cards: image, name, 2–4-word purpose, price (regular and first-month), one CTA per card. | Price visible before commitment; one action per card. | Product card contract in `PAGE_SPECIFICATIONS.md` §P-03: exact product + variant, plain purpose, **price or honest price state**, pathway badge, one CTA. No introductory-discount mechanics unless Samuel approves a real offer. |
| Process | Three numbered steps (intake → clinician review → treatment ships). "Get Started" after the steps. | Reduces fear of the unknown. | Three-step Care explainer; separate three-step Research-order explainer. Steps must match our real lifecycle (request → human review → secure clinical handoff), not theirs. |
| Trust | Clinician/advisor section, testing criteria callout, press logos, reviews carousel, compliance seal in footer. | Stacks social proof and safety. | We may only show what we can prove: documented lot/COA process (where records exist), clinician *decision independence*, legal entity. No reviews, press logos, patient counts, named clinicians, seals, or testing lists until each is verified and approved. |
| CTA vocabulary | Few verbs, repeated: "See if you qualify", "View Treatment", "Get Started", "Login". | Each verb means one thing. | Controlled vocabulary in `05_COPY_DECK.md` §1. |
| FAQ | Linked from header; disclaimers in footer. | Answers objections without cluttering the hero. | Header "How It Works" + a real FAQ page; regulated disclaimers adjacent to the claim they qualify, not only in the footer. |
| Category landing | Footer groups products by outcome category (performance, longevity, weight). | Lets a visitor start from a goal. | **Do not adopt now.** Outcome-category landing pages are regulated-claim-adjacent; deferred to a later, counsel-reviewed phase (D-14). Group by *pathway* (Care / Research / Assisted) instead. |
| Mobile | Single-column cards, sticky header with Login + CTA. | Same hierarchy at every width. | 390px spec keeps Sign In + primary CTA in the header without opening a menu. |

## What we must not copy

- Any paragraph, headline wording, visual asset, layout-specific artwork, source code, or icon set.
- Reviews, testimonials, star ratings, press logos, patient counts, funding figures.
- Clinician names/credentials, pharmacy statements, testing parameter lists, LegitScript-style seals.
- Pricing mechanics ("first month" discounts), shipping promises ("two-day", "temperature-controlled"), "no insurance needed", state coverage.
- Outcome language (energy, recovery, metabolism, healthy aging) — Eon has no clinical review of such claims.

## Where Xenios is structurally different (do not force-fit)

1. **Two pathways, not one.** System Labs is Care-only. Xenios has Care (clinician-governed, via a secure clinical system) **and** Research ordering (research-use acknowledgment, human-verified manual payment, no clinical relationship). The site must show the difference in one glance; System Labs never needs to.
2. **Businesses are a first-class audience.** Practices, partners, suppliers and candidates have no equivalent on System Labs.
3. **Our Care intake is not on the website.** The public form collects routing details only; clinical intake happens after human review in a secure system. "See if you qualify" would overpromise; our verb is **Start Care**, and the confirmation must say this is not medical intake.
4. **Prices are not generally public today.** Only 34 SKUs have a founder-approved price book; public storefront is dark; September retail prices are unapproved candidates. We adopt *price visibility as a principle* and implement it only where D-05 approves.

## Proposed category statement — evaluation

The phrase "Premium peptides, guided by licensed clinicians" was proposed as a *concept*. Word-by-word test against Eon today:

| Word | True for Eon today? | Evidence / gap |
| --- | --- | --- |
| "Premium" | Unsupported superlative. | No comparative quality evidence; zero vendor COA responses recorded (`docs/production-completion/catalog/README.md`). |
| "peptides" | Partly. | 242 Care-pathway clinical formulations + 135 research peptide materials exist in catalog data; none have approved public copy. Also invites Care/Research conflation. |
| "guided by licensed clinicians" | Only for the Care pathway, and only after secure handoff. | `PROVIDER_READINESS.md` shows no clinician/pharmacy provider marked ready; meeting names three directors (unverified; C-006). Research orders are explicitly **not** clinician-guided. |

Verdict: **do not use as written.** Recommended default (D-03): a pathway-honest line such as *"Clinician-guided Care and research-grade products — clearly separated."* Final wording is a founder decision after clinical/counsel review of "clinician-guided".
