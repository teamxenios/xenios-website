# Early Access legal package: decision matrix

Lane: Session 4, legal identity and signing bridge.
Base contract SHA: `bee5cf27af674be3de592b98b00bee0d90cd13a3`.
Package: `docs/legal/xenios-research/v1.0.0`, semver `1.0.0`, effective `2026-07-22`,
jurisdiction Texas.

This document does not choose the package. It states, exactly, what the existing
counsel-approved manifest contains, which parts the existing signature engine can
record, and therefore which decision is still owed by a named human. Selecting the
documents an Early Access purchase requires is a legal act. The code refuses to
default it: `resolveDesignatedPackage(null)` returns `designation_missing`, and an
unconfigured deployment sells nothing.

Everything below is read from `MEMBER_FACING_IMPORT_PLAN` in
`server/research/membership-activation/legal-import.ts`. No document, requirement,
order or stage was authored here.

## The manifest, in the package's own signing order

`Signable` means the manifest entry maps to a `DocumentCategory`, so a version can be
published and an immutable `SignatureRecord` can bind to it. `Additional` means the
entry maps to no category: it is real, required paper that `registerLegalPackage`
never persists as a document version, so the signature engine has nowhere to record it.

| # | Doc | Title | Stage | Req | Sep ack | Signing path |
|---|---|---|---|---|---|---|
| 1 | XR-LEGAL-01 | Electronic Records and Signature Consent | activation | required | no | signable (`electronic_record_consent`) |
| 2 | XR-LEGAL-02 | Privacy Policy | activation | required | no | signable (`privacy_notice`) |
| 3 | XR-LEGAL-03 | Identity Verification and Government ID Consent | activation | required | no | signable (`identity_age_verification_consent`) |
| 4 | XR-LEGAL-04 | Founding Membership Agreement | activation | required | no | signable (`founding_membership_agreement`) |
| 5 | XR-LEGAL-05 | Private Membership Confidentiality and Nondisclosure Agreement | activation | required | no | signable (`confidentiality_covenant`) |
| 6 | XR-LEGAL-06 | Research Use and Acceptable Use Agreement | activation | required | no | signable (`research_education_disclaimer`) |
| 7 | XR-LEGAL-07 | No-Medical-Advice and Assumption-of-Risk Acknowledgment | activation | required | no | signable (`assumption_of_risk_acknowledgment`) |
| 8 | XR-LEGAL-08 | Individual Arbitration, Class-Action Waiver and Jury-Trial Waiver | activation | required | **YES** | signable (`arbitration_agreement`) |
| 9 | XR-LEGAL-17 | Release, Waiver, Covenant Not to Sue, Limitation of Liability and Indemnification | activation | required | **YES** | signable (`membership_covenant`) |
| 10 | XR-LEGAL-09 | Manual Payment and Verification Terms | activation | required | no | signable (`manual_payment_bridge_terms`) |
| 11 | XR-LEGAL-10 | Membership Renewal Policy | activation | required | no | signable (`recurring_membership_authorization`) |
| 12 | XR-LEGAL-11 | Cancellation and Refund Policy | activation | required | no | signable (`immediate_cancellation_acknowledgment`) |
| 13 | XR-LEGAL-12 | Website Terms of Use | activation | required | no | **additional, not signable** |
| 14 | XR-LEGAL-15 | Payment Evidence Upload Consent | payment_evidence_upload | required | no | **additional, not signable** |
| 15 | XR-LEGAL-13 | Product Purchase Terms | product_checkout | required | no | **additional, not signable** |
| 16 | XR-LEGAL-14 | Shipping, Claims and Replacement Policy | product_checkout | required | no | **additional, not signable** |
| 17 | XR-LEGAL-16 | Cookie and Tracking Notice | cookie_notice | optional | no | **additional, not signable** |

## The blocker this lane exists to surface

**The documents an Early Access purchase most obviously requires are the four
documents the engine cannot record.**

- `product_checkout` is exactly XR-LEGAL-13 and XR-LEGAL-14. Both are required. Both
  are additional. Neither can be signed.
- `payment_evidence_upload` is exactly XR-LEGAL-15, required before any evidence
  upload, and it is additional too. Session 5's proof lane has a legal precondition
  that currently has no signing path.
- Even the pure activation stage cannot complete, because XR-LEGAL-12 (Website Terms
  of Use) is a required activation document that is also additional.

So there is no designation of any purchase-relevant stage that both satisfies counsel
and can reach `complete`. A designation that omits a required document is refused
(`required_document_omitted`); a designation that includes it cannot complete
(`document_not_signable`). The code fails closed in both directions rather than
reporting a customer as nearly finished. This is pinned by the test
`cannot complete even the activation package as counsel staged it`.

This is a state of the tree, not a defect introduced here. `registerLegalPackage` maps
5 of 17 documents to `{ kind: "additional_required_document" }`, and it has no
production caller at all: no admin publish route exists, so
`research_fm_document_versions` is empty in practice and every required category also
reports `no_published_version`.

## The decision owed, and the three ways to close it

A named human (founder or counsel) must designate the package. Nothing ships until
one of these is chosen and recorded as an `EarlyAccessPackageDesignation`.

1. **Give the checkout documents categories.** Extend `DOCUMENT_CATEGORIES` and
   `DOCUMENT_CATEGORY_REGISTRY` with slots for product purchase terms, shipping and
   claims, website terms and payment evidence consent, then import and publish them.
   This is the only option that makes the package genuinely signable and is the one
   this lane recommends. It touches the membership-activation registry, which no lane
   owns in this fusion, so it needs an explicit owner.
2. **Designate only the activation stage and treat the checkout documents as
   presented-not-signed.** Legally weaker: the customer is bound by terms they were
   shown but never signed, which is precisely the distinction the package's own
   signing sequence draws. Requires counsel to say so in writing.
3. **Keep the cart closed** until option 1 lands. The safe default, and the current
   effective state.

## What the code enforces once a designation exists

- The designation must name the exact package semver, or its ids are stale
  (`package_version_mismatch`).
- Every required document of every designated stage must be named
  (`required_document_omitted`).
- Arbitration and the release and waiver get their **own** refusal when dropped
  (`separate_acknowledgment_document_omitted`), so losing either can never blend into
  a general missing-document error.
- Unknown ids are refused rather than ignored (`unknown_document_id`), so a typo is
  never a silently smaller package.
- The designator must be a named human (`designator_unnamed`) with a counsel approval
  reference (`approval_reference_missing`).

## Completion is recomputed, never stored

`recomputePackageCompletion` reads immutable signature records and the versions
published right now. There is no stored `complete = true` anywhere in this lane. Three
tightenings over the membership gate:

1. **Separate acknowledgments are proven from the record.** For XR-LEGAL-08 and
   XR-LEGAL-17 the lane requires a `SignatureRecord` with
   `separateAcknowledgment === true`. A provider completion (`EsignAcceptance`) carries
   only `{ category, documentVersionId }` and no acknowledgment evidence, so it cannot
   stand in for those two. The membership gate currently accepts it, which is the gap
   this closes.
2. **Content hash drift blocks.** A record whose `contentHash` no longer matches the
   published version proves assent to different words.
3. **Timestamps are real.** `completedAt` is the latest `signedAt` across the
   satisfying records. It is never the current clock and never proof-upload time.

## Identity

An `eac_*` handle is a truncated sha-256 of a roster row id, a continuity cookie token
or a session id. It proves browser or roster continuity, not personhood.
`SignatureRecord.memberId` is the only identity a signature can carry and there is no
signing-on-behalf path. So a durable, verified binding is required before anything is
signed, and only `verified_link` (a credential the server verified) or
`admin_attested` (a named human, for the pre-existing founder checkout) may authorize
signing. Aliases are preserved on the binding, so verifying an identity never orphans
an earlier checkout, and a handle bound to a different member is refused rather than
rebound.

The founder checkout `XEC-E1703CC63BBE89E6839E24C1`
(`eac_d80e62ad2039e515b943d4d7cb6c2e32`) keeps its number, invoice and reference. It
acquires a binding through the `admin_attested` path with a named reviewer, which is
the only reason that path exists.
