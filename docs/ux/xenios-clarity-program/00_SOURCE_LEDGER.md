# 00 — Source ledger

Every material input to this program, its reliability class, and what it may and may not be used for.

Classes: **A** current repository authority · **B** current audit evidence · **C** founder decision · **D** stakeholder input · **E** external reference · **F** inference / recommendation (this lane) · **G** requires verification.

Rule: a D, E or F source never becomes public copy on its own. Any factual public statement must trace to A/B (or to a C decision backed by A/B) and appear in `CLAIM_LEDGER.csv` with an approved status.

## Sources found and used

| # | Source | Location | Class | Used for | Must not be used for |
| --- | --- | --- | --- | --- | --- |
| S01 | Runtime source @ `c4ea8a9` (via worktree `049dfd9`) | `client/`, `server/`, `shared/` | A | What exists: routes, nav, copy, forms, endpoints, gates, statuses | Claiming anything is deployed |
| S02 | Master offerings dataset (420 products, all copy `draft`) | `server/research/master-offerings/data/member-safe-master-offerings.generated.json` | A | Product identity, family, variant labels | Public copy (none approved) |
| S03 | Catalog reconciliation (513 units: 0 direct / 124 assisted / 242 Care / 147 unavailable) | `docs/production-completion/catalog/` | A (dry-run reconciliation; not a production write plan) | Pathway state per product, candidate prices and their status | Treating candidate prices as approved |
| S04 | Founder price book (39 SKUs) + 2026-08-19 price release (34 member prices) | `docs/research-launch/FOUNDER_PRICE_BOOK_2026-08-16.json`, `PRICE_RELEASE_2026-08-19.*` | A/C | Evidence that some member prices were founder-approved in August | Public pricing without D-05 |
| S05 | Provider readiness | `docs/research-launch/PROVIDER_READINESS.md` | A | Pharmacy/clinician/billing readiness (none marked ready) | — |
| S06 | Affiliate program config / draft schedule | `shared/research/affiliate-program/config.ts`, `server/research/affiliates/v2/draft-schedule.ts` | A (draft, inactive) | Evidence of intended economics and conflict (7.5% vs 15% repeat) | Publishing any rate |
| S07 | `.xenios` corpus (MASTER_CORPUS, FULL_VISION, ownership, sessions) | `.xenios/` | A | Platform direction, persona list, ownership, "rebrand only when explicitly authorized" (FULL_VISION l.773) | — |
| S08 | Adversarial audit packet (release NOT ACCEPTED) | `docs/ux/xenios-adversarial-audit-20260924/` | B | Route inventory (222 declarations), 3,910-control inventory, AUD-001..003, contact repair semantics, production read-only health 2026-09-26 | Treating inventory rows as exercised journeys |
| S09 | UX account/notifications candidate reports | `docs/ux/xenios-ux-account-notifications-20260924/` | B | Sign-in/access chooser, partnership form on `/api/contact`, live-UAT repair | — |
| S10 | Founder admin matrix | `docs/ux/xenios-founder-admin-matrix-20260924/` | B | Admin surfaces, guard, unsupported surfaces | — |
| S11 | XENIOS Full Website UX Source of Truth (18 tabs) | `Downloads/XENIOS _ Full Website UX Source of Truth + End-to-End Journey Map _ 2026-09-24.docx` (local copy predates the audit's 2026-09-26 tab updates; live Google Doc id `1qogOnIU…` was updated by the audit lane) | B/F (source-centric analysis + recommendations) | P1-01..P1-07, Seth case study, Care status vocabulary, "four actions never share a CTA" rule | Its own admission: it under-tested first-time-user states |
| S12 | XENIOS_FULL_THREAD_ARCHIVE_2026-09-24.md | `Downloads/` | C/D (reconstruction by ChatGPT; founder directives quoted) | Founder directives: sign-in obvious, mobile sticky CTA not Care-only, founder admin, "treat every link as a user promise"; second-user dead end (closed application + tokenless status) | Production facts newer than 2026-09-24 |
| S13 | Shared execution brief | `Downloads/XENIOS_INFINITY_SHARED_EXECUTION_BRIEF.md` | C | Company architecture, audiences, header, homepage order, UX contract, product-state contract, practice contract | Treating "Eon Health" as a completed legal/brand change |
| S14 | Dual-agent handoff protocol | `Downloads/XENIOS_DUAL_AGENT_HANDOFF_PROTOCOL.md` | C | Artifact list, decision ownership, evidence levels | — |
| S15 | CLAUDE_01 prompt + Samuel's expanded 2026-09-26 continuation brief | `Downloads/`, chat | C | Required artifacts and page-spec fields; Model A–E; CTA vocabulary; brand/legal transition section | — |
| S16 | Stephen Toth / Samuel Boadu meeting, 2026-09-25 (Gemini notes + full transcript) | Google Drive doc `1zth0U-n2QvyeM0MJ3DQbqvk_0kz7Zjw3cN7JVinGK50` | D (machine-generated; checked against transcript) | Primary practice use case; Stephen found the site overwhelming; referral vs parent-account vs wholesale; liability concern; client ownership concern; dosing/reconstitution question | Any claim Samuel or Seth made on the call as a verified fact (see G items) |
| S17 | Seth partnership-inquiry episode (2026-09-24) | S11 tab 09, S12 §3 | D | Evidence that inquiry ≠ account is not understood | — |
| S18 | Second-friend closed-application dead end | S12 §11 | D + B (Render logs: no POST) | Evidence of dead-end states | — |
| S19 | System Labs public site | systemlabs.com homepage + treatments index, read-only 2026-09-26 | E | Pattern analysis (`SYSTEM_LABS_REFERENCE_ANALYSIS.md`) | Copy, assets, numbers, claims |
| S20 | Third-party System Labs reviews (web search) | onlinetherapistai.com, peptideclinicfinder.com, glp1evolution.com | E (secondary, unverified) | Context only | Anything published |
| S21 | This lane's IA, copy, models, specs | this directory | F | Recommendations for Samuel's decision | Implementation before D-items are approved |

## Sources named but missing

| Named input | Search performed | Result | Consequence |
| --- | --- | --- | --- |
| `Xenios_Current_Thread_Archive_2026-09-26(1).md` | Downloads (exact + prefix), Gmail | Exists only as an attachment on Samuel's 2026-09-26 self-sent email ("Xenios Current Thread Archive \| September 26, 2026"); not downloadable by this lane | Decisions made in chat on 2026-09-25/26 that are not in S13/S15/S16 are **not known**. Anything Samuel decided there must be re-stated in `02_DECISIONS.md` review. |
| "System Labs reference findings" | Repo, Downloads, Drive, Gmail | No such document exists | Replaced by S19 observation, limited to what was observed |
| `Steve Toth … Notes by Gemini(1).docx` | Downloads | Not present; the Drive original (S16) was used | None — same document |
| `XENIOS _ Full Website UX … (1).docx` | Downloads | Only the un-suffixed 2026-09-24 copy exists | Audit-lane tab updates of 2026-09-24/26 were not re-read here; audit packet S08 covers them |
| "Current product/catalog/pricing authority" as a single document | Repo | Split across S02–S06 | Documented per product in `08_PRODUCT_PATHWAY_MATRIX.csv` |

## G — items that require verification before any public use

| Item | Where it came from | Why it is unverified |
| --- | --- | --- |
| Catalog size (393 SKUs, 114 peptides) | S16 (Samuel on call) | Repo shows 420 canonical / 513 reconciled / 439 live variants; none of these equal 393 |
| Three named medical directors "signing off on orders" | S16 | No clinician provider marked ready (S05); named individuals' agreements not in repo |
| "Medical directors review and authorize all medical compound orders" | S16 notes (summary) | Transcript is narrower (providers approve Care/medical compounds); Research orders are explicitly not clinician-reviewed |
| Seven new suppliers and multiple pharmacies onboarded | S16 | Vendor RFQ has zero populated responses (S03) |
| Licensed U.S. compounding pharmacy dispenses/ships (live copy) | S01 `CarePublicPages.tsx:147`, `Gateway.tsx`, `Faq.tsx` | S05 shows pharmacy provider not ready |
| Ships within 72 hours of payment verification (live copy) | S01 `fulfillment-copy.ts:14-15`, emails | Supplier/fulfillment unverified (S03) |
| "Typically within one business day" (Care) | S01 | No SLA evidence |
| First-Month Foundations Plan $30/month (CSCS-created) | S01 `CarePublicPages.tsx:155-160` | No commerce/price authority |
| No cost to create an account / to use a provider | S16 (Seth, Samuel) | Care consult cost "right now" — not a durable policy |
| Commission: all sales from referred clients; monthly payout; weekly statements | S16 | Code: 20% first + 7.5% or 15% repeat, biweekly Friday, draft/inactive |
| Chatbot with 24/7 support "within a week" | S16 | Not built; dosing guidance boundary (brief §4.5) |
| Lifetime 50% discount + $500 credit for delayed customers | S16 | Operational remedy for specific customers; never public copy |
| Public brand "Infinity Health" / "Eon Health" | S16 vs S13 | No legal, domain or trademark change recorded (S07 FULL_VISION l.773) |
| Third-party testing "where applicable", COA per lot | S01 `TestingPage.tsx:31` | Zero vendor COA responses (S03) |
