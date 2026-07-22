# Retention and Deletion Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-005 |
| Title | Retention and Deletion Schedule |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption at program launch; re-review on every new record class, on counsel feedback, and before any retention automation ships |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending, including tax, consumer protection, and health-record rules (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | This schedule itself is a governance record: retain all superseded versions permanently [COUNSEL: confirm] |
| Acceptance event | n/a (internal policy) |
| Withdrawal supported | no (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-003, XR-POL-004, XR-POL-006 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC guidance on subscription and negative option records; IRS business recordkeeping guidance |
| Review date | 2026-07-19 |

## 1. Purpose and principles

This schedule states how long each class of Xenios Research records is kept, what event starts the clock, and how deletion happens.

1. Keep records only as long as a stated purpose or legal duty requires.
2. Legal retention always wins over deletion preferences. Cancellation never overrides legal retention: a member's cancellation ends access immediately, but transaction, payment, agreement, safety, security, and audit records are retained under this schedule.
3. Privacy rights survive cancellation. Deletion requests are honored per XR-POL-006, except where a retention duty in this schedule applies, and the requester is told which duty applied.
4. Every period below is a proposal until counsel confirms it. No automated deletion runs before counsel confirms the numbers.

## 2. Retention table

Clocks run from the trigger event stated. All periods are [COUNSEL: confirm] unless noted.

| Record class | Contents | Clock starts | Proposed retention |
| --- | --- | --- | --- |
| Applications (not approved, expired, withdrawn) | Application content, review notes, decision | Final status | [COUNSEL: confirm; proposed 12 months], then delete or de-identify |
| Applications (approved, became members) | Application of record | Membership end | Held with departed-member records below |
| Agreements and acceptances | Accepted document version, checkbox timestamp, member reference, signature records for partner agreements | Membership or contract end | [COUNSEL: confirm; long enough to prove the agreement through any limitation period] |
| Identity and age verification results | Provider reference, result, age result, timestamp, method, minimal failure code (XR-POL-003); no raw ID media retained unless separately approved | Verification result | [COUNSEL: confirm both the live-membership record and any post-membership minimum] |
| Orders and fulfillment | Orders, split-fulfillment records, tracking numbers, shipping charges, large-order review outcomes | Order completion | [COUNSEL: confirm; must support disputes, chargebacks, recalls, and product traceability] |
| Payment and tax records | Charges, refunds, replacements, store credit, chargeback evidence, tax records | Transaction or tax year end | [COUNSEL: confirm; tax records commonly require multi-year retention under IRS rules] |
| Audit and security logs | Append-only action audit, access audits, login history, security alerts, incident records | Event | [COUNSEL: confirm; proposed minimum 12 months online, longer for incident records] |
| Complaints and support records | Support threads, quality complaints, Telegram-derived records moved into the system of record | Case closure | [COUNSEL: confirm] |
| Adverse events and product concerns | Possible and serious adverse event reports, intake records, allocation of dietary-supplement serious-adverse-event responsibilities | Report | [COUNSEL: confirm; regulatory minimums apply and must be identified per lane] |
| Recall records | Recall decisions, notices, lot traceability, destruction records | Recall closure | [COUNSEL: confirm; regulatory minimums apply] |
| Media | Progress photos, video, voice messages and their access audits | Membership end or member deletion | Delete on verified member deletion request unless a hold applies; otherwise [COUNSEL: confirm post-membership period] |
| Tracker and assessment data | Assessment answers, tracker entries, wearable and integration data | Membership end or member deletion | Delete on verified member deletion request unless a hold applies; otherwise [COUNSEL: confirm post-membership period] |
| Affiliate and Research Rep records | Agreements, identity and tax records, commission ledgers, content-monitoring records, termination records | Relationship end | [COUNSEL: confirm; tax and FTC-compliance evidence must survive termination] |
| Marketing suppression | Unsubscribe and consent-withdrawal records | Withdrawal | Keep the suppression record itself for as long as sending could resume; stop sending immediately |
| Waitlist and interest lists | Notification preferences, Quantum interest list | List removal or launch | [COUNSEL: confirm; proposed short period after removal] |

## 3. Cancellation and departed members

1. Confirmed cancellation ends member access immediately and forfeits remaining paid access (no prorated refund unless applicable law requires one; policy subject to counsel review). Before confirming, the member is told to download desired plans and data first.
2. Cancellation is not deletion. The record classes above keep running on their own clocks. A former member who wants deletion uses the privacy rights process (XR-POL-006) through the limited non-member receipt and privacy workflow, which remains available after cancellation.
3. Departed-member personal data not covered by a specific duty above is retained [COUNSEL: confirm; proposed 24 months] after membership end, then deleted or de-identified.

## 4. Deletion procedure

1. Deletion today is a manual, named-human act by the super administrator, executed per verified request (XR-POL-006) or per this schedule, with step-up authentication and an audit entry.
2. A complete deletion covers the primary database rows, media objects and their signed-URL paths, outbox and notification rows, and any export copies. Referral rows and affiliate attributions referencing the person are de-identified rather than silently altered in financial ledgers.
3. Audit preservation: deletion removes personal data, not the evidence that governance happened. A minimal tombstone (internal reference, the fact and date of verified deletion, no name or content) is retained. Where an append-only record must be kept for legal defense, identity is redacted and the event skeleton kept, [COUNSEL: confirm what must be preserved versus deleted].
4. Vendor copies: platform backups age out on the vendor's cycle and cannot be purged on demand; email and infrastructure providers retain their own delivery logs under their terms. State this honestly in any deletion confirmation.
5. Legal holds: an active dispute, chargeback, suspected fraud, safety investigation, recall, or litigation preservation need pauses deletion for the affected records. Holds are recorded, reviewed on a schedule, and released in writing.

## 5. Automation

When retention automation ships, it enforces section 2 with a dry-run mode, per-run audit output, and a feature flag defaulting to off. Until then, this schedule plus the manual procedure is the policy, and a periodic manual review [CONFIG: interval, proposed quarterly] checks for records past their proposed clocks.

## 6. Relationship to the earlier engineering draft

The worktree contains docs/privacy/RETENTION_POLICY.md, an engineering draft covering the currently built application-layer tables with proposed 12 and 24 month targets, a manual deletion procedure, and an audit-tombstone rule. This schedule supersedes it in scope: it adds the commerce, tax, adverse event, recall, media, tracker, and affiliate classes the program requires. The two documents propose consistent member-data targets. Counsel is asked to reconcile them and designate this schedule as the single controlling retention document once confirmed.

## Open items for counsel

- Reconcile with docs/privacy/RETENTION_POLICY.md and designate a single controlling retention document.
- [COUNSEL: confirm every retention period in the section 2 table, per record class and per applicable state and federal rule.]
- [COUNSEL: confirm tax record retention against IRS and state requirements.]
- [COUNSEL: confirm adverse event and recall record minimums per product lane, including dietary-supplement serious-adverse-event responsibilities allocated in writing.]
- [COUNSEL: confirm the no-proration cancellation posture and its disclosure, as referenced in section 3.]
- [COUNSEL: confirm the audit-tombstone approach: what must be preserved versus deleted after a verified deletion request.]
- [COUNSEL: confirm whether superseded versions of this schedule must be kept permanently.]
- [CONFIG: manual retention review interval, proposed quarterly.]
- [ENTITY]: confirm the record-owning legal entity.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
