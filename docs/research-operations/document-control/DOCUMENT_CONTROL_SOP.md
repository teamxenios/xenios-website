# Document Control SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-REG-008 |
| Title | Document Control SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | governs every change to every registered document |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Permanent while the program operates; superseded versions archived per Document Control SOP (XR-REG-008) |
| Acceptance event | n/a (internal control document) |
| Withdrawal supported | No (internal control document) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-REG-002, XR-REG-006 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This standard operating procedure (SOP) governs the entire Xenios Research document library: every document listed in the document register, in every series, at every stage of its life. It defines the source of truth, how document keys are issued, how versions are numbered, how status changes, how acceptance is captured, who may change what, how a document is published, and how superseded material is retained.

No document in the library becomes effective through this SOP alone. Publication always requires the gate in section 9.

## 2. The register is the source of truth

1. The machine-readable register at `docs/research-legal/00-register/document-register.json` (XR-REG-002) is the single source of truth for the existence, identity, metadata, and status of every document in the library.
2. The human-readable register `docs/research-legal/00-register/DOCUMENT_REGISTER.md` (XR-REG-001) is GENERATED from the JSON register. It is never hand-edited. Any change discovered only in the Markdown register is a defect: correct the JSON and regenerate.
3. If a document's own metadata table and its register row disagree, the disagreement is a defect that must be fixed in the same change. Neither side "wins" silently; the editor determines the intended value, corrects both, and records the correction.
4. A document that exists on disk but has no register row is unregistered and must not be presented to anyone. Registering it (or deleting it) is the required fix.

## 3. Document keys and series

1. Every document carries exactly one key of the form `XR-<SERIES>-<NNN>`, where NNN is a zero-padded three-digit number.
2. The series are: XR-PUB (public and applicant surfaces), XR-MEM (member agreements and notices), XR-TRK (tracker and media), XR-COM (commerce and product), XR-AFF (affiliate and distribution), XR-FUL (fulfillment and suppliers), XR-POL (internal policies), XR-QTM (Quantum placeholders; no commerce documents while Quantum is Coming Soon), XR-REG (register and document control).
3. A new key is issued by taking the next unused number in the correct series, as shown by the JSON register at the moment of issue. Keys are issued only together with a new register row.
4. Keys are never reused. A withdrawn or superseded document keeps its key forever. If a document was registered in error, its row is marked withdrawn; the number is still consumed.
5. A document is never renumbered. If a document truly belongs in a different series, a new key is issued in the correct series, the old document is marked superseded with a pointer to the new key, and the old key remains in the register.

## 4. Versioning

1. Documents use semantic versioning: MAJOR.MINOR.PATCH.
2. Until counsel approval, every version is `0.x.y-draft`. The `-draft` suffix is mandatory in this range and signals that the document has no legal effect.
3. The first counsel-approved publication of a document is version `1.0.0`. The `-draft` suffix is removed at that moment and never before.
4. After 1.0.0, changes are classified as follows:
   - PATCH (x.y.Z): typo, formatting, broken link, or wording fix that changes no meaning, right, obligation, price, or data practice. No re-acceptance. Counsel notice is not required, but the change still passes the validation suite and updates the register.
   - MINOR (x.Y.0): clarification, added explanation, or a new provision that does not reduce any member right, does not add any member obligation, and does not change price, billing, or data practices. Counsel review is required before publication. Re-acceptance is not required unless counsel directs it.
   - MAJOR (X.0.0): any change that reduces a member right, adds or expands a member obligation, changes pricing or billing, changes cancellation or refund treatment, changes data collection, use, sharing, or retention, or changes dispute terms. Counsel review is required. [COUNSEL: confirm which MAJOR changes require affirmative re-acceptance by existing members versus prospective-only application with notice, and the required notice period.]
5. Default rule pending counsel guidance: every MAJOR change to a member-accepted document (any document whose acceptance event is a recorded member action) is presented for fresh acceptance before it applies to that member, and applies prospectively only. Notice-only documents are re-presented with a change summary.
6. A version number is never reassigned. If a published version is defective, the fix is a new version.

## 5. Status lifecycle

1. The document status field moves through this lifecycle only, and only forward except where noted:
   `draft -> counsel_review -> counsel_approved -> published -> superseded` or `-> withdrawn`.
2. Definitions:
   - draft: being written or revised. Not effective. Carries the draft banner.
   - counsel_review: submitted to counsel. Frozen except for changes counsel requests. Carries the draft banner.
   - counsel_approved: counsel has approved the text. Still not effective and still bannered until the publication gate (section 9) completes.
   - published: effective, live on its route, banner removed, effective date set.
   - superseded: replaced by a newer published version or a different document. Retained per section 11.
   - withdrawn: removed from use without a successor. Retained per section 11.
3. Backward movement: counsel_review returns to draft when counsel requests changes. counsel_approved returns to draft when any edit other than the approved text is made. published never returns to draft; a revision starts as a new draft version while the published version stays live until the new one publishes.
4. The counsel_status field carries one of: `not_reviewed`, `submitted`, `in_review`, `changes_requested`, `approved`. counsel_status describes counsel's position; status describes the document's position. Both live in the register row and must be updated in the same change that moves either.

## 6. The draft banner

1. Every document that is not published carries, immediately after its H1 title, the exact two-line banner:

   ```text
   DRAFT — NOT LEGAL ADVICE
   COUNSEL REVIEW REQUIRED
   ```

2. The banner is removed ONLY at publication, as part of the publication gate in section 9, and by no other change. Removing the banner in any other change is a defect and reverts.
3. If a published document is later revised, the working draft of the revision carries the banner; the live published version does not.

## 7. Acceptance events and the consent registry

1. Every document whose register row defines an acceptance event must have that event captured server-side before the document is treated as accepted. The minimum record for a checkbox acceptance is: the checkbox action, a server timestamp, the exact document key and version presented, and the member reference (or applicant, partner, or supplier reference as the audience requires).
2. Signature-based documents (partner and supplier agreements) record the signature event, the document version signed, the date, and the counterparty reference.
3. Notice-only documents record presentation: the document key and version displayed, where, and when, without an acceptance action.
4. All acceptance and presentation records flow into the consent registry, the server-side system of record for who accepted what version of what document and when. The earlier draft `docs/security/CONSENT_REGISTRY.md` describes this registry; section 12 governs its reconciliation with this SOP.
5. Client-side records, screenshots, and chat messages are never acceptance evidence on their own. Telegram is never the system of record.
6. Acceptance records are retained per the Retention and Deletion Schedule (XR-POL-005), minimum [COUNSEL: confirm period], and survive membership cancellation as required records.

## 8. Change control

1. Who may edit: Samuel Boadu (Founder) and editors he explicitly designates. Counsel may propose or require text. Drafting agents and contractors edit only under an assigned scope. No one else edits library documents.
2. Every change to any registered document, in one change set, must:
   - update the document file;
   - update the document's register row in `document-register.json` so the metadata table and the row match exactly;
   - regenerate `DOCUMENT_REGISTER.md` from the JSON (never hand-edit it);
   - run a dependency impact check: review every document that lists the changed key in its dependencies (see the Document Dependency Graph, XR-REG-003) and confirm each is still accurate, updating any that are not in the same change set or opening a tracked follow-up;
   - pass the validation suite (section 10);
   - record what changed and why (commit message or change log entry).
3. Review requirements by change class: PATCH changes need one editor other than the author to confirm the no-meaning-change classification, or Samuel's own confirmation. MINOR and MAJOR changes need counsel review before publication. Any change touching pricing, billing, cancellation, refunds, data practices, or dispute terms is treated as MAJOR unless counsel classifies it lower.
4. No change may lower a safety, disclosure, or legal-posture standard to make another change easier. Disagreements about classification escalate to Samuel, then to counsel, and are logged in Open Counsel Decisions (XR-REG-006) when unresolved.

## 9. Publication gate

A document (or a new version of one) becomes published only when ALL of the following are true, verified in order, and recorded:

1. Counsel approval of the exact text being published (counsel_status = approved for that version).
2. Samuel's explicit approval to publish.
3. The effective date is set in the register row and in the document.
4. Acceptance wiring is verified: the route presents the correct document version; the acceptance event (checkbox, signature, or presentation log) records key, version, timestamp, and counterparty reference server-side; and a test acceptance has been performed and found in the consent registry.
5. The draft banner is removed in the same change, and the status moves to published.
6. Any predecessor version or document is marked superseded in the same change.

If any check fails, the document stays in counsel_approved status and the banner stays on.

## 10. Validation suite (required pre-merge)

Every change set that touches the library must pass all of the following before merge:

1. Labels present: every non-published document contains the exact draft banner and a complete metadata table.
2. Unique keys: no key appears in more than one register row, and every document file's key matches exactly one row.
3. JSON parses: `document-register.json` is valid JSON with the required fields on every row.
4. Links resolve: every internal path and document-key reference points to a file or row that exists.
5. No secrets: no credential, API key, token, password, or recovery code appears in any document or register file.
6. Claims scan: no document contains prohibited claims language (no "FDA approved", no "clinically proven", no "HIPAA compliant", no guaranteed results, no diagnosis, prescribing, or dosing direction).
7. Register-document consistency: each changed document's metadata table matches its register row field for field.

A failed check blocks the merge. Checks are automated where possible; until automation exists, the editor runs them manually and records the result. [CONFIG: the validation suite implementation and its location in CI.]

## 11. Retention of superseded versions and the audit trail

1. Every superseded and withdrawn version of every document is retained permanently while the program operates: the exact text, its version, its register row history, and its effective window. Version control history satisfies this when it preserves exact text and dates.
2. The library must always be able to answer: exactly what did version X of document Y say, when was it effective, and who accepted it. Acceptance records in the consent registry are never deleted when a document is superseded.
3. The audit trail for the library includes: every change set, its author, its classification (PATCH, MINOR, MAJOR), counsel approvals, publication gate records, and validation results.
4. Disposal of any library record follows the Retention and Deletion Schedule (XR-POL-005) and applicable law, and never occurs for records tied to an open dispute, investigation, or legal hold.

## 12. Reconciliation duty for pre-existing documents

1. The repository contains earlier drafts outside the registered library, under `docs/compliance/` (HIPAA_APPLICABILITY_ANALYSIS.md, FTC_HBNR_APPLICABILITY_ANALYSIS.md, TEXAS_PRIVACY_ANALYSIS.md, MEMBERSHIP_COVENANT.md), `docs/privacy/` (PRIVACY_PROGRAM.md, DATA_CLASSIFICATION.md, DATA_FLOW_MAP.md, RETENTION_POLICY.md), `docs/security/` (SECURITY_PROGRAM.md, ACCESS_CONTROL_POLICY.md, IDENTITY_PROOFING_STANDARD.md, INCIDENT_RESPONSE_PLAN.md, CONSENT_REGISTRY.md, CURRENT_STATE_FACTS.md), and `docs/risk/` (THREAT_MODEL.md, VENDOR_RISK_STANDARD.md).
2. These files are not hand-deleted and not silently rewritten. For each one, the reconciliation outcome is one of: (a) register it with a new key and bring it under this SOP; (b) supersede it with a registered document that carries its substance forward; or (c) withdraw it with a recorded reason.
3. Until a file is reconciled, the registered library controls wherever the two overlap, and the conflict is logged in Open Counsel Decisions (XR-REG-006).
4. Reconciliation of the full list above is a tracked work item with a named owner (default: Samuel Boadu) and is a standing agenda item for counsel review until complete.

## 13. Periodic review

1. Every registered document carries a review date in its metadata table and register row.
2. Default cadence: every published document is reviewed at least annually, and sooner when law, a regulator action, a product change, or an incident touches its subject. [CONFIG: per-series review cadence, admin-configurable; counsel may set shorter cycles for high-risk series such as XR-COM and XR-TRK.]
3. A review confirms accuracy, dependency health, and legal posture, and either records "reviewed, no change" with a new review date or opens a change set under section 8.
4. Overdue reviews are surfaced in the register and reported to Samuel monthly.

## Open items for counsel

- [COUNSEL: confirm which MAJOR changes require affirmative re-acceptance by existing members versus prospective-only application with notice, and the required notice period.] (Section 4.)
- [COUNSEL: confirm the minimum retention period for acceptance and presentation records.] (Section 7.)
- [CONFIG: the validation suite implementation and its location in CI.] (Section 10.)
- [CONFIG: per-series review cadence, admin-configurable.] (Section 13.)
- Reconcile the pre-existing drafts listed in section 12 (docs/compliance, docs/privacy, docs/security, docs/risk) with the registered library: register, supersede, or withdraw each, and confirm which document controls in the interim. In particular, confirm whether `docs/security/CONSENT_REGISTRY.md` becomes the registered specification for the consent registry referenced in section 7, and whether `docs/privacy/RETENTION_POLICY.md` is superseded by the Retention and Deletion Schedule (XR-POL-005).
- Confirm the counsel_status vocabulary in section 5.4 matches counsel's preferred workflow.
- Confirm that version-control history is acceptable as the permanent archive mechanism for superseded document text (section 11), or specify a separate archive.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
