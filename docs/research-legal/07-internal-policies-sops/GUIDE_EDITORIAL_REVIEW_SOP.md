# Guide Editorial Review SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-015 |
| Title | Guide Editorial Review SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Runs for every Guide from idea through published, and again on every correction or withdrawal. |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for Guide revisions, review records, and correction history] |
| Acceptance event | n/a (internal SOP; adoption recorded by founder approval with version and date) |
| Withdrawal supported | No. Internal versioned SOP; a later approved version supersedes this one. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-014, XR-MEM-009, XR-MEM-025 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

Guides are the member-only evidence library of Xenios Research: educational documents about ingredients and blends, served at /research/member/guides. This SOP defines how a Guide moves from idea to published, who reviews it, what evidence standards apply, and how corrections and withdrawals work.

Guides are education, not medical care and not selling copy. The Research and Education Disclaimer (XR-MEM-009) and the Guide Library Terms (XR-MEM-025) govern what members are told about them. Any Guide statement reused in a selling context becomes a claim under the Claims Approval SOP (XR-POL-014).

## 2. Roles

1. AI drafting agent: researches and drafts. AI cannot publish. AI cannot approve. AI output enters the workflow as a draft and nothing more.
2. Scientific reviewer: checks that every statement matches its cited evidence and grade. [CONFIG: named scientific reviewer(s); founder acts until appointed.]
3. Claims reviewer: checks the claim table against XR-POL-014, including implied claims.
4. Quality reviewer: checks quality and documentation statements (what testing exists, what a COA does and does not show).
5. Legal or regulatory reviewer: engaged where required, particularly for regulatory status sections. [COUNSEL: define which Guide categories require counsel review before publication.]
6. Founder reviewer and publisher: Samuel Boadu. He is the only person who can move a Guide to approved and the only person who can publish. Publication is a founder action, recorded with name and date, every time.

## 3. Workflow

Every Guide is always in exactly one state:

```text
idea
researching
draft
scientific_review
claims_review
quality_review
legal_review
founder_review
approved
published
correction_pending
withdrawn
```

| State | Exit requires |
| --- | --- |
| idea | Founder accepts it into the production plan (Section 8) or member demand justifies it (Section 7). |
| researching | Source plan and source registry complete; claim table drafted with grades. |
| draft | Full draft against the template (Section 5) with every claim mapped to a source. |
| scientific_review | Named reviewer confirms statements match evidence and grades; contradictions file updated. |
| claims_review | Claim table cleared against XR-POL-014; no PROHIBITED claim present in any wording. |
| quality_review | Quality and documentation section verified against actual supplier documents, not assumptions. |
| legal_review | Completed where required by category; regulatory status section confirmed and dated. |
| founder_review | Samuel reads the full Guide and either returns it with notes or approves. |
| approved | Publication by Samuel, with version number and date. |
| published | Moves to correction_pending on any identified error, or withdrawn by founder decision. |
| correction_pending | Correction drafted, re-reviewed at the affected review stages, republished with version history entry. |
| withdrawn | Terminal for that revision. The member-visible page states that the Guide was withdrawn; history is preserved. |

No state may be skipped. A Guide edited in any substantive way after a review stage returns to that stage.

## 4. Evidence grades

Each claim inside a Guide carries one grade:

```text
A Established
B Supported Human
C Early Human
D Preclinical
E Supplier Reported
F Traditional
G Unverified
PROHIBITED
```

Rules:

1. Grade claims, not products. A Guide never presents a compound as globally "graded B". Each individual statement carries its own grade, visible to the member.
2. PROHIBITED marks wordings that must never appear (disease treatment promises, dosing, outcome guarantees). The claim table records them so drafters do not rediscover them.
3. Evidence for individual ingredients does not prove a blend. Blend Guides grade blend-specific evidence separately; where only ingredient-level evidence exists, the Guide says so plainly.
4. Supplier-reported (E) statements are labeled as such; a supplier document is a supplier statement, not independent evidence.

## 5. Per-Guide working files and template

Every Guide maintains this working file set through production:

```text
SOURCE_PLAN.md
SOURCE_REGISTRY.md
CLAIM_TABLE.md
CONTRADICTIONS.md
GUIDE_DRAFT.md
FAQ_DRAFT.md
QUALITY_AND_DOCUMENTATION.md
REGULATORY_STATUS.md
EDITORIAL_REVIEW_CHECKLIST.md
```

The published Guide follows the standard template: one-minute summary, what it is, why interest exists, terminology, proposed mechanism, human evidence, preclinical evidence, limitations, quality, safety categories, interactions, regulatory status, uncertainty, questions for a qualified professional, sources, version history.

Template rules:

1. The regulatory status section is dated. It states the status as of a specific date and that the status can change. An undated regulatory statement fails review.
2. The "questions for a qualified professional" section replaces advice: the Guide equips the member to talk to their own professional; it never substitutes for one.
3. The limitations and uncertainty sections are mandatory and substantive. A Guide that reads as uniformly positive fails scientific review.

## 6. Content rules (hard)

1. AI cannot publish. Only the founder publishes.
2. Original text only. No copied passages, no lightly reworded source text. Sources are cited, not reproduced.
3. No dosing. No dosing instructions, protocols, schedules, or "commonly used amounts", anywhere, including the FAQ. A member question about dosing is answered with the professional-referral language, never a number.
4. No automatic clinical recommendations. No Guide, and no system built on Guides, generates personalized clinical advice.
5. Sources traceable: every claim in the claim table maps to an entry in the Guide's source registry, and Guide sources must satisfy the sourcing rules of the central source registry (00-register/SOURCE_REGISTRY.md). No invented citations, no dead-end references.
6. Version history: every published revision is numbered, dated, and preserved. Members can see that a Guide changed and when.
7. No selling inside Guides: product availability, pricing, and checkout stay out of the educational body. Product linkage is a structured reference only, and any commercial wording routes through XR-POL-014.

## 7. Guide requests from members

1. Members may submit Guide requests and follow existing requests.
2. Demand is shown as anonymous counts only. No member identity is ever exposed on a request.
3. When a requested Guide is published, followers are notified by email and, where linked, Telegram. Notification contains the Guide title and link, nothing clinical, consistent with the Telegram content limits (no plan PDFs, no health detail over Telegram).

## 8. Production plan

Production follows the approved plan: Wave 1 validates the template on GHK-Cu, BPC-157, and PT-141. Wave 2 completes all 20 individual compound Guides. Wave 3 completes the six blend Guides. Wave 4 connects product-specific pages (exact supplier composition, format, quality, and Guide status) under the Product Publishing SOP (XR-POL-016). The plan does not stop after five Guides; every offered ingredient and blend gets one.

## 9. Corrections and withdrawal

1. Anyone (member, reviewer, founder) can flag a suspected error. The Guide moves to correction_pending immediately; the flagged passage is annotated pending resolution. [CONFIG: whether the published page shows a visible "under correction" notice, recommended yes.]
2. Corrections re-run the review stages the error touches, then republish with a version history entry describing what changed and why.
3. Material errors (an evidence grade overstated, a safety-relevant omission) are escalated to the founder to decide member notification. [COUNSEL: define when a Guide correction requires proactive member notice.]
4. Withdrawal is a founder decision. A withdrawn Guide's page says it was withdrawn; the revision history is retained per XR-POL-005.

## 10. Records

Every state transition, review, approval, publication, correction, and withdrawal is recorded with actor and time. The record must be able to show, for any past date, exactly what members could read and who had approved it.

## Open items for counsel

- Retention period for Guide revisions and review records (metadata table).
- Which Guide categories require counsel or professional review before publication (Sections 2 and 3).
- When a Guide correction requires proactive member notice (Section 9).
- [CONFIG: named scientific reviewer(s)] (Section 2) and [CONFIG: visible under-correction notice] (Section 9).
- Confirm the boundary between Guide educational content and commercial claims, and that the XR-POL-014 routing in Sections 1 and 6 is the right control.
- Reconcile with XR-MEM-025 (Guide Library Terms) so the member-facing description of corrections, withdrawal, and version history matches this internal process exactly.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
