# Marketing Email Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-011 |
| Title | Marketing Email Consent |
| Audience | applicant |
| Required member state | optional at any stage; offered at application and again in the member account; never required |
| Trigger | unchecked-by-default checkbox on the application form; communication preferences in the member account |
| Route | /research/apply; /research/member/account |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; unsubscribed addresses stay on the suppression list indefinitely to honor the opt-out |
| Acceptance event | unchecked-by-default checkbox + timestamp + document version + subject reference recorded server-side; withdrawal recorded the same way as a new event, never an edit |
| Withdrawal supported | yes; unsubscribe link in every marketing email, member account toggle, or email to research@xeniostechnology.com; honored promptly and within the CAN-SPAM deadline |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-003, XR-PUB-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC CAN-SPAM Act compliance guide for business |
| Review date | 2026-07-19 |

## 1. What this consent is

This consent covers marketing email from Xenios Research only. It is optional, off by
default, and separate from everything else you agree to. Declining it never affects
your application, your review outcome, your plans, or any part of your membership.

Consent text presented at the checkbox (draft):

```text
Yes, send me Xenios Research email updates (new Guides, product availability, and
program news). Optional. You can unsubscribe at any time, and saying no does not
affect your application or membership.
```

## 2. Marketing email versus transactional email

Two kinds of email exist in this program, and this consent governs only the first:

- Marketing email (this consent): program news, new or restocked product
  announcements, new Guide highlights, waitlist-adjacent updates framed as marketing,
  and offers. Sent only if you opt in.
- Transactional and relationship email (sent regardless of this consent, because the
  program cannot run without it): application status messages, verification steps,
  agreement and payment confirmations, receipts, subscription and renewal notices,
  order and shipping updates, plan publication notices from the Document Center,
  security alerts, and privacy or policy notices.

If a message mixes content, we classify it by its primary purpose
[COUNSEL: confirm the primary-purpose classification approach and review borderline
templates, for example waitlist restock notifications, before launch].

## 3. What we promise in every marketing email

Consistent with the CAN-SPAM Act:

1. Honest headers and subject lines. The sender is identified as Xenios Research, and
   the subject reflects the content.
2. Sender identity and postal address. Every marketing email identifies Xenios
   ([ENTITY]) and includes a valid physical postal address [CONFIG: postal address for
   marketing email footer; counsel to confirm a commercial mail receiving agency
   address is acceptable if used].
3. A clear unsubscribe. Every marketing email contains a working, one-step unsubscribe
   link that does not require login or a fee. It works for at least 30 days after the
   email is sent.
4. Prompt honoring. Opt-outs take effect promptly, and no later than the CAN-SPAM
   deadline of 10 business days. Our internal target is faster:
   [CONFIG: internal opt-out processing target, working target 72 hours].
5. No advertising claims outside the approved lane. Marketing email follows the same
   claims rules as the website: no disease claims, no outcome guarantees, no dosing,
   and research products are described within their reviewed classification lane.

## 4. Suppression list

When you unsubscribe, your address moves to a suppression list whose only purpose is
making sure we do not email you marketing again, including after any future
reapplication or list import. Suppression entries are kept indefinitely for that
purpose and are not used for anything else, shared for others' marketing, or sold.
Transactional email continues, because it is part of running your application or
membership.

## 5. How consent is recorded

Your opt-in is recorded server-side as an event: the checkbox state, a timestamp, the
version of this consent text you saw, and your applicant or member reference.
Withdrawal is recorded as a new event rather than editing history, so the record shows
what you agreed to and when. The current state is always the latest event.

## 6. Your choices

- Opt in at application, or later in your member account. Opting in later is never
  required.
- Opt out any time: the unsubscribe link in any marketing email, the member account
  toggle, or an email to research@xeniostechnology.com.
- Opting out of marketing does not opt you out of transactional email, and it does not
  affect the optional SMS and Telegram channel consent (XR-PUB-012), which is separate.

## 7. Contact

Questions about email practices: research@xeniostechnology.com. This consent does not
waive rights that cannot be waived under applicable law, and it does not relieve
Xenios of duties imposed by law.

## Open items for counsel

- [ENTITY]: exact legal entity name for the email footer (section 3).
- [CONFIG: postal address for marketing email footer]; counsel to confirm whether a
  commercial mail receiving agency address satisfies CAN-SPAM if used (section 3).
- [CONFIG: internal opt-out processing target, working target 72 hours] (section 3).
- [COUNSEL: confirm the primary-purpose classification approach and review borderline
  templates] (section 2).
- [COUNSEL: confirm period] for the retention baseline in the metadata table, and
  confirm indefinite suppression-list retention is the correct posture.
- Confirm state-law additions on top of CAN-SPAM, if any apply to email at our
  volumes.
- Reconcile with the earlier drafts docs/privacy/PRIVACY_PROGRAM.md and
  docs/security/CONSENT_REGISTRY.md (marketing_email consent kind, unchecked-by-default
  rule, append-only consent events); this document is written to match them, counsel to
  confirm which controls at publication.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
