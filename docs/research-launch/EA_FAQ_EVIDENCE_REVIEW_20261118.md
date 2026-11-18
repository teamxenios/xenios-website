# Early Access FAQ and company-quality source handoff

Task `EA-FAQ-EVIDENCE-20261118`; owner `codex-ea-faq-evidence-20261118`.
Base `41636562590aec1789e435c5e3609a3e3013c7ba`.
Branch `codex/ea-faq-evidence-20261118`, isolated worktree `C:/xenios-wt/ea-faq-evidence-20261118`.

This document is for engineering/content review. It is not imported into the application, exposed as a public document, or a clinical/legal approval. Root owns integration and release. No policy acceptance, customer submission, provider, Auth, role, SQL, mail or deployment action belongs to this change.

## Accepted inputs and scope

- Samuel's November 18 Master build brief, attachment `dba97317-da42-4a02-bdc6-ae010625fa81/Pasted text.txt`, especially sections 12–13.
- KAN-225 comment 13368: company confirmation of U.S. manufacturing, independent third-party testing and accredited U.S. laboratories. The exact approved line is preserved: **U.S.-manufactured. Independently tested by accredited U.S. laboratories.** This confirmation is not being reopened.
- Comment 13371: current offering/CTA language, Enter details → Browse and select → Submit Request → Team review and next steps.
- Comment 13370: CLAUDE-2's record inventory; it is a supplied inventory, not this author's independent inspection of the raw supplier files.
- Comment 13375: CLAUDE-3's limits: no documented accreditation from the two sample reports; compound listings retain company attribution; physician-led pathway credentials are a separate evidence item; research-only classifications remain visible.

The public FAQ now covers thirty operational questions in all fifteen requested groups. It replaces the old eighteen-answer accordion's unsupported present-tense promises of a broad clinical formulary and included/paid lifestyle services with current navigation and request behavior. It preserves the existing nonclinical Care request, Research separation and support destinations.

Every public answer records ID, category, audience, product scope, concise answer, expanded detail, sources, reviewer, reviewedAt, sourceCheckedAt, publishingState and CTA. A null reviewer/reviewedAt means no qualified review is recorded; it is never replaced with the engineering source-check date. The company-confirmation answer identifies Samuel's confirmation and date without calling it independent document review. No hidden draft-answer collection exists in the client bundle.

## Public coverage

| Group | Answer IDs | Limits and next action |
| --- | --- | --- |
| Getting started | what-is-early-access; who-is-early-access-for; available-today | Current intake/catalog/request steps; no clinical or stock guarantee; Infinity in development |
| Requests | after-submission; request-not-order; track-correct-withdraw | Existing reference/confirmation; same-attempt retry; support for correction/withdrawal; no invented action button |
| Intake/privacy | why-contact-address; required-details; information-retention | Required/optional labels; existing policy destinations; no invented retention period or deletion guarantee |
| Clinical care | clinical-assessment; clinical-location | Separate nonclinical Care access request; qualified assessment and location questions are routed, not answered medically |
| Research | research-intended-buyer; research-treatment-separation | Legitimate nonclinical laboratory use; no human/veterinary use or personal administration guidance |
| Product basics | product-category-basics; personal-goals | Category/variant comparison and professional routing; peptide definition stays in the private draft below |
| Quality | company-sourcing; who-tested-item; coa-scope | Exact company-attributed copy; approved exact product/lot records; test scope/limits |
| Credentials | credential-records | Ask for named records; accreditation, licensing and approval are not interchanged |
| Availability | held-items; listing-stock | Hold/variant limits; no stock reservation inferred |
| Images | image-types | Captions/Details and proposed-render limits; no invented packaging/maker/seal |
| Handling | storage-handling | Exact supplied documentation; no universal protocol |
| Quotes/payment | pricing-quotes; quote-expiry-payment | Separately confirmed pricing/actual terms; request does not collect payment; online quote/payment capability not promised |
| Delivery/refunds | shipping-cancellation-refunds | Actual applicable terms and support; no universal date, return period or cancellation guarantee |
| Support | get-help; receipt-missing-email; account-access | Existing contacts, original confirmation, reset path; no inbox-arrival/monitoring or response-time claim |
| Product concerns | report-product-concern | Operational concern to support; individual clinical concerns to licensed professional; no support triage/treatment promise |

The public route remains `/research/faq`. Local search intersects all whitespace-separated terms with the selected category. It reads questions, summaries and detail only. It sends no request, persists no query, adds no analytics and introduces no admission or category-query parser. Stable item IDs preserve button/panel relationships while filtering. Collapsed panels remain in the DOM with `hidden`; their links leave the keyboard and accessibility tree.

## Reused authorities and destinations

- `/earlyaccess`: existing real intake/catalog/request entry; no consent or request is submitted by a FAQ interaction.
- `/care/schedule`: existing nonclinical Care request, not a promised clinical appointment.
- `/research/access-hub`, `/research/support`, `/research/reset-password`: existing public routing/help; reset grants no membership or staff authority.
- `/research/privacy`, `/research/terms`, `/research/policies`: existing policy source can be unavailable or marked draft. The FAQ does not upgrade its publication status.
- `/research/documents`, `/research/testing`, `/research/quality`: existing public documentation and exact lot lookup. No guessed lot code or private source-file URL is linked.
- Existing request-specific confirmation and support helpers remain untouched. A generic FAQ cannot create an authorized status link or infer a request from an email address.

`shared/research/quality/public-lot.ts`, its explicit metadata/download approvals, public API, source reader and generated document paths remain unchanged. `EvidenceProvenance` is a reusable presentation of the company confirmation, not a new evidence approval service, product badge or supplier-document publisher. It links into those existing authorities.

The current public-lot contract already records product/variant/lot, source, current status, publication revision, document issuer/source label, issue/review/status dates, approval IDs and test categories. It does not expose a maker/site, accreditation certificate/scope, pharmacy licence, method/result detail or named reviewer identity. Adding those public fields requires a separately reviewed contract/source projection and publication-rights check. This source increment does not fabricate them or claim that the full evidence-system extension is complete.

## Evidence provenance and outstanding records

The company-quality record has provenance `company_confirmed`, confirmation date `2026-11-18` and no independent-document-review receipt. The public panel preserves this distinction prominently. No per-listing badge is added, and research supplies/shipping are excluded from its stated scope. The 242 compounded listings are not relabeled as independently documented manufacturing; the company statement remains attributed. No statement of ingredient origin, ISO certification, sterility, endotoxin coverage, universal purity or FDA approval is added.

Record inventory supplied in 13370, not independently re-verified here:

| Scope | Inventory lead | Missing records and owner |
| --- | --- | --- |
| Research peptides/materials and research capsules | NAD+ 1000 mg lot 662310, Freedom Diagnostics Testing; retatrutide 20 mg lot 46647, DNA Healthcare Solutions | Research supplier: exact maker/site per listing, other product/lot reports, named lab accreditation certificates and method scopes, referenced supplier quality-process document |
| Clinical formulations | Pharmacy catalog describes 503A sterile compounding and BUD assignment | Pharmacy: licence, exact third-party formulation/lot reports, issuing laboratories and current accreditation scopes; terminology/record review for each compound |
| Supplements | No manufacturer/site/testing record located in the supplied inventory | Supplement maker: maker, manufacturing-site and product/lot testing records |
| Topicals/regenerative | RadiantXO maker-page lead only; Exosome Cream and GHK-Cu 30 mL maker unresolved | Makers/catalog owner: exact maker and documentation/rights/testing records |
| Research supplies and shipping | Outside the products described by the sourcing statement | No sourcing badge |
| Clinical pathway | Samuel's physician-led copy is distinct from the three sourcing facts | Clinical partner/Root: named organization, physician licensing and location/service scope; no invented credentials |

For a later product evidence record, preserve these fields separately:

| Field | Current treatment |
| --- | --- |
| Canonical product and variant ID | Must come from catalog projection; not invented from a report name |
| Relevant lot | Exact match required; the two inventory leads are not automatically mapped to live listings |
| Supplier/pharmacy/manufacturer and site/location | Missing where not verified; U.S. corporate location is not ingredient-origin evidence |
| Report issuer, issue date, method and measured results | Only from reviewed source; no inferred test attribute |
| Accreditation body/certificate/scope/current validity | Separate current record; two reports are not a substitute |
| Pharmacy licensing | Separate jurisdiction/current licensing record |
| Document link and publication rights | Existing approved document route only; no local Downloads path, private PDF or unapproved redaction |
| Reviewed scope, reviewer, review date, publication state | Actual receipt or null; company confirmation stays separate |

The NAD+ report lead contains no accreditation in CLAUDE-2's inventory and is sample-specific. The retatrutide report lead mentions ISO standards/registration associated with another performing laboratory, but the registration/certificate/scope is not independently checked. It limits representativeness of the sampled lot. Neither lead is used as a public accreditation proof or a blanket product-quality seal.

## Private medical/regulatory drafts — NOT FOR PUBLICATION

Qualified reviewer: **not assigned**. Review date: **null**. Publishing state: **draft**. Audience: patients/prospective clinical clients or laboratory buyers as stated. These are original draft explanations, not patient-specific advice. No dosing, preparation, injection or personal-use research recommendations are included. A qualified reviewer must check wording, scope and the exact product/service records before any later publication.

| Draft ID / question | Proposed answer and scope | Source / review dependency | CTA after review |
| --- | --- | --- | --- |
| MED-01: What is a peptide? | A peptide contains linked amino acids. The category name alone says nothing about whether a particular product is appropriate, authorized or effective for an individual. General definition only; not a benefit claim. | NCI definition below; named scientific/clinical reviewer and current product classification | Care request for personal questions; existing Details for identity |
| MED-02: Which offerings require assessment or a prescription? | A catalog cannot make this decision for a person. Requirements must be confirmed for the exact product and clinical pathway; a request is not a prescription. Do not publish an item-by-item classification without approved pharmacy/clinical records. | Qualified clinician/pharmacy reviewer; actual formulary/pathway and jurisdiction records, currently missing | Separate Care request |
| MED-03: What does clinician review cover? | An individual evaluation belongs to an appropriately licensed professional. Records, additional questions or a visit may be required under the actual service. Do not promise asynchronous-only care, an included plan, treatment approval or a specified assessment process. | Named clinical organization, service protocol, clinician authority and qualified reviewer; not supplied here | Authorized provider path when actually available |
| MED-04: How does state availability work? | Availability must be confirmed for the individual location and exact service. A catalog listing is not evidence that a clinician or pharmacy may serve every state. | Current clinician/pharmacy jurisdiction records and qualified legal/clinical review; no state list invented | Separate Care request |
| REG-01: How do accreditation, licensing and FDA approval differ? | Laboratory accreditation concerns competence for a defined scope; it is not product certification. A pharmacy licence and product approval answer separate questions. Compounded drugs are not FDA-approved; an accreditation mark or licence does not change that. No Xenios supplier accreditation or licence is asserted in this draft. | NIST and FDA below; actual certificates/scopes/licences plus qualified claims/legal review | Existing documentation/support |
| MED-05: What storage/handling instructions apply? | Use instructions approved for the exact product and supplied by its responsible pharmacy/manufacturer or laboratory supplier. This FAQ proposes no universal protocol. | Actual product-specific documentation, publication rights and relevant pharmacist/scientific reviewer | Exact approved document or appropriate supplier/provider |
| MED-06: How do I report a suspected adverse reaction? | Individual clinical concerns belong with a qualified professional, not Research Support. FDA has reporting routes for medical-product concerns, with different paths for some product categories; no single route is asserted for the full mixed catalog. A reporting form does not provide emergency treatment. | FDA MedWatch below; qualified clinical/safety reviewer must select the appropriate category-specific reporting and urgent-care wording | Approved category-specific safety route, not an invented portal |

Primary sources opened November 18, 2026; they are not evidence about Xenios suppliers:

- [FTC Health Products Compliance Guidance](https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance): assess express/implied objective claims and their substantiation before dissemination.
- [FTC Complying with the Made in USA Standard](https://www.ftc.gov/business-guidance/resources/complying-made-usa-standard): manufacturing/origin claims require a factual basis matching their scope; company location does not establish ingredient origin.
- [NIST Accreditation vs. Certification](https://www.nist.gov/nvlap/accreditation-vs-certification): laboratory accreditation and its scope differ from product certification.
- [FDA Understanding the Risks of Compounded Drugs](https://www.fda.gov/drugs/human-drug-compounding/understanding-risks-compounded-drugs): compounded drugs lack FDA approval and premarket review for safety, effectiveness and quality.
- [NCI peptide definition](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/peptide): molecular definition only, not clinical suitability or benefit substantiation.
- [FDA MedWatch](https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program): category-sensitive medical-product safety reporting; not a universal route for every catalog item.

## Verification and release limits

New meaningful DOM/content tests cover all fifteen groups/thirty IDs, search/category intersection, safe empty/reset states, stable native button/region relationships, current public destinations, no request/network/analytics while searching, company attribution, missing review receipts, and truthful unavailable operations. Existing public-brand accessibility/Care boundary tests and shared chrome/control conservation remain; only the FAQ's obsolete 18-button/3-link baseline is deliberately replaced by its new 31-button/67-link baseline. Quality tests preserve existing lookup, test-scope, approval and responsive/reduced-motion checks and add company-provenance assertions.

At source preparation: DOM tests, full typecheck/build, browser, accessibility and hosted CI are **NOT_RUN**. Root prohibited local heavy jobs; this author may perform pure Node syntax/static checks. Fill exact commands/results in the pushed-SHA handoff after execution, never by inference from a sibling branch. No qualified medical review or independent supplier-document review has occurred in this lane.

Root's next qualification: focused four suites (`Faq.test.tsx`, `quality-surfaces.test.tsx`, `public-brand-pages.test.tsx`, `care-research-postlaunch-conservation.test.tsx`); unchanged public-lot/route guards as affected; exact composed required CI; independent review and phone/desktop/320px/200% text keyboard/contrast render. Publishing, provider-backed request proof, inbox/reply proof and the separate 420-row admitted catalog capture remain Root/Website 2 responsibilities, not established by this static FAQ source.
