# Application Status Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-010 |
| Title | Application Status Terms |
| Audience | applicant |
| Required member state | pre-application through approval (governs the period between submission and activation or denial) |
| Trigger | presented with the membership application; linked from the Application Status view at the entrance |
| Route | /research/apply; /research (Application Status) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | Checkbox + timestamp + document version + applicant reference recorded server-side with the application acknowledgments |
| Withdrawal supported | Partial. An applicant may withdraw a pending application at any time by request to research@xeniostechnology.com; records of the application and its handling are retained under the retention schedule. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-002, XR-PUB-008, XR-PUB-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

These terms explain what happens after you submit a Xenios Research membership application:
how review works, what the statuses mean, how you hear about decisions, and what your options
are if you are not approved. They govern the period between submission and either activation
or a final decision not to admit.

## 2. How review works

Every application is reviewed individually by a human. During the founding phase the founder,
Samuel Boadu, personally reviews every application. No application is auto-rejected by an
algorithm; automated signals may inform review, but a named human makes the decision.

Review relies on your application answers, which you certified as accurate (Application
Accuracy Certification, XR-PUB-009), including your 21+ attestation (XR-PUB-008).

Xenios does not publish a decision deadline. The Founding Membership has no numerical member
cap, but admissions continue at the founder's discretion, and review pace depends on real
review capacity.

## 3. Application statuses

The status view shows one of the following states. Exact on-screen labels are
[CONFIG: admin-configurable status labels]; their meanings are:

| Status | Meaning |
| --- | --- |
| Received | Your application was submitted and is queued for review. A pending-status email confirms receipt. |
| Under Review | Review of your application is in progress. |
| More Information Needed | Xenios needs something clarified before deciding. The request comes by email; the application waits on your reply. |
| Approved | You are invited to continue to identity and age verification, then agreements, then payment and security setup. Approval is not membership; activation is. |
| Not Approved | Xenios is not admitting you at this time. |
| Withdrawn | You asked to withdraw the application before a decision. |

There is no public queue number and no position indicator.

## 4. How status is communicated

- Email to your verified application email address is the channel of record for status
  changes and any requests for more information.
- The Application Status view, reached from the /research entrance, shows the current status
  on demand.
- Status is shown only to the applicant. No status, applicant identity, or application detail
  is shown to any referrer, and referral rewards never expose applicant information.

Keep your email address current; tell research@xeniostechnology.com if it changes.

## 5. No obligation to admit

Xenios Research is a private membership. Submitting an application, holding the entrance
password, being referred, or meeting the stated criteria does not create a right to
membership. Xenios has no obligation to admit any applicant and may decline without stating a
reason, subject to applicable law. Xenios does not discriminate on any basis prohibited by
applicable law. [COUNSEL: confirm the non-discrimination sentence and whether any state
private-membership rules apply.]

## 6. No formal appeal; retry allowed

There is no formal appeal process for a Not Approved decision or for a failed verification.
What is allowed is a retry: you may submit a new application with corrected or updated
information. The same rule applies at the identity and age verification step after approval:
no formal appeal, retry with corrected information allowed, and technical support available
for persistent verification problems. Identity and age requirements themselves cannot be
waived by anyone, including the founder.

[COUNSEL: whether a minimum waiting period between retries is needed, and whether repeated
retries should be rate-limited; proposed as [CONFIG: retry interval].]

## 7. After approval

Approval starts the activation sequence, in this order: identity and age verification, then
the required agreements, then the $50 activation payment and the $25 recurring monthly
membership authorization, then your personal password and mandatory multi-factor
authentication. Agreements are always presented and accepted before payment. Prices are
launch prices, admin-configurable, and changes apply prospectively with notice.

An approval that is not carried through activation does not remain open forever:
[COUNSEL: set an approval validity window, proposed as [CONFIG: approval expiry period],
after which a fresh application or a refreshed review is required.]

## 8. Your data during and after the process

Application data, status history, and decision records are handled under the program privacy
notice and retained under the Retention and Deletion Schedule (XR-POL-005), including for
denied and withdrawn applications. Withdrawal of an application stops review but does not
erase the record that an application was made and handled.

## 9. What these terms do not do

These terms do not waive rights that cannot be waived under applicable law and do not relieve
Xenios of duties imposed by law. They make no promise about decision timing or outcome, and
approval itself confers no member rights until activation completes.

## Open items for counsel

- [COUNSEL: confirm the non-discrimination sentence in section 5 and any state
  private-membership admission rules.]
- [COUNSEL: retry spacing and rate limits (section 6); values proposed as [CONFIG].]
- [COUNSEL: approval validity window before activation (section 7); value proposed as
  [CONFIG].]
- [COUNSEL: confirm retention periods for denied and withdrawn application records;
  reconcile with the earlier draft docs/privacy/RETENTION_POLICY.md.]
- [COUNSEL: confirm the status set and that "Not Approved" without stated reasons is the
  right posture in the operative states.]
- [ENTITY]: exact legal entity name and state of formation.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
