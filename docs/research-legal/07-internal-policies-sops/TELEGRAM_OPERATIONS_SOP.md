# Telegram Operations SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-031 |
| Title | Telegram Operations SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applied to every Telegram intake, reply, linking, and revocation event |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | support conversation records, linking and revocation events, and triage logs per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent; member-side revocation of the Telegram link is covered by XR-MEM-023) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-023, XR-MEM-024, XR-PUB-012, XR-PUB-013, XR-POL-004, XR-POL-005, XR-POL-007, XR-POL-012, XR-POL-032 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP tells Xenios staff how to operate the Telegram support channel. The member-facing rules live in the Telegram Support Terms (XR-MEM-023); this document is the internal counterpart and must never drift from it. If the two disagree, stop, fix the conflict, and record the correction.

It covers intake, triage, response, the prohibited-content list, account linking and revocation, voice notes, emergencies, staff conduct, and records. During the founding phase, the operating staff is Samuel Boadu; the SOP is still written as a staff document so it holds when help is added.

## 2. What Telegram is in this program

Telegram is an intake and notification convenience, not the system of record. The member website and the secure Document Center are the system of record. Telegram runs on a third-party platform Xenios does not control, which is why the hard list in section 4 exists. Every support interaction of record is stored server-side on Xenios systems under the Logging and Redaction Standard (XR-POL-012), not in a chat scrollback.

## 3. Intake and triage (24/7 intake, triaged response)

1. Intake is always open. Members may send text messages and voice notes up to 60 seconds at any hour. Intake being open does not mean answering is instant, and staff must never promise otherwise.
2. Every inbound message enters the same question system as questions submitted on the member site (XR-MEM-024). One queue, same statuses, same rules, regardless of channel.
3. The normal response target is approximately 12 hours. It is a service target, not a guarantee. Do not quote a firmer commitment to any member.
4. Triage priority order, applied by staff and mirrored by the Research Answer Queue:
   1. security and privacy issues,
   2. product concerns and possible adverse events,
   3. account blocking or lockout,
   4. anything at SLA risk,
   5. oldest first within the same priority.
5. There are no public queue numbers. A member sees the status of their own questions only. Never disclose queue depth, another member's position, or volume figures.
6. There is no self-mark-urgent. A member writing "urgent" does not change triage. True emergency language is handled under section 7, not by queue priority.
7. During the founding phase, Samuel Boadu personally reviews outbound answers before they are sent.

## 4. The hard list: never over Telegram

The following never travel over Telegram, in either direction, even when the member asks, even when it would be faster:

- passwords,
- password-reset links or reset tokens,
- identity documents or images of them,
- plan PDFs (Blueprint, fitness, nutrition, or any Document Center file),
- raw health media (progress photos, exercise videos, or their originals),
- payment card numbers or any payment data, and
- detailed assessment answers.

Staff handling when a member sends prohibited content anyway:

1. Do not act on the content over Telegram. Do not confirm card digits, read back health details, or process anything from it.
2. Reply with the standard redirect: name the correct secure surface (member site, Document Center, or email to research@xeniostechnology.com) and why.
3. Record the event in the question system with a prohibited-content flag. Do not copy the sensitive content into the note; describe the category only (XR-POL-012).
4. Where the platform allows and policy permits, delete the message from the Xenios side. [COUNSEL: confirm purge versus retain for member-sent prohibited content, given retention duties (also flagged in XR-MEM-023)]
5. Never ask a member for a password, recovery code, reset token, identity document, or payment detail over Telegram, for any reason. A staff message that asks is a policy violation and a security incident (XR-POL-007).

## 5. Sensitive responses stay on Xenios surfaces

Telegram may say that something is ready. It must not carry the thing itself. Apply the notification-only pattern to every response that involves:

- health specifics (assessment content, plan content, tracker data),
- account, login, or security matters beyond generic guidance,
- payment, order, or refund specifics beyond order-placed style notices,
- privacy rights requests (XR-MEM-027 workflow runs on the member site and email),
- product concerns and adverse events (XR-COM-019 intake runs on Xenios surfaces).

Correct form: "Your answer is ready in your member account." Incorrect form: pasting the answer content into the chat. If a reply cannot be written without sensitive content, it belongs on the member site, and the Telegram message is only the pointer.

## 6. Linking and revocation operations

1. Linking starts from the member account area, never from an unsolicited message. The member requests a link, the site shows a one-time code, and the member sends that code to the Xenios bot from their own Telegram account. The code proves both accounts belong to the same person.
2. One member account links to one Telegram account. [CONFIG: whether re-linking to a new Telegram account requires step-up authentication]
3. Never process account-specific requests from an unlinked or unrecognized Telegram account. Reply with the generic linking instructions only.
4. Member-side revocation is self-service and takes effect immediately. After revocation, send nothing further to that Telegram account and treat messages from it as unlinked.
5. Server-side revocation is mandatory on suspected account compromise, membership termination, or cancellation. Cancellation revokes the link; the limited non-member workflow runs by email, not Telegram.
6. Every linking, failed linking, and revocation event is logged as an audit event (XR-POL-012). Suspected compromise also raises an Infinity event (XR-POL-032).

## 7. Emergencies

Telegram is not an emergency service and is not monitored in real time. When a message contains emergency language (medical distress, self-harm, danger to others), the response directs the person to emergency services (911 in the US) immediately and does not attempt remote care, diagnosis, or reassurance that delays that step. This routing is the first action, before triage, before any other reply. After routing, record the event, and where the message also describes a product concern or possible adverse event, open the XR-COM-019 workflow. This mirrors the member-facing Support and Emergency Boundary Notice (XR-PUB-013).

## 8. Voice note handling

1. Voice notes are capped at 60 seconds. For an over-limit or truncated note, ask the member to resend shorter or use text; do not guess at missing content.
2. A voice note is treated exactly like text for every rule in this SOP: same queue, same hard list, same emergency routing. A spoken password or card number is still prohibited content under section 4.
3. The Xenios-side record of the voice note is stored under the Media Handling SOP (XR-POL-033): validated, scanned, private storage, access audited.
4. Voice notes are not automatically transcribed at launch; the reviewer listens. [CONFIG: enabling automatic transcription; if enabled, the Voice Recording and Transcription Consent (XR-TRK-005) governs and must be in place first]
5. Never forward a member voice note to any external tool or person outside the approved processing path (see XR-POL-034 for AI tool restrictions).

## 9. Staff conduct

1. All member contact goes through the official Xenios bot. Staff never message members from personal Telegram accounts, and never move a support conversation to another chat app.
2. No diagnosis, no prescribing, no dosing instructions, no medication direction, in any message, however phrased.
3. No outcome promises and no guarantees. Support, plans, Guides, and the tracker are not medical care.
4. Calm, plain, truthful language. No hype. If the honest answer is "this needs review and will take time", say that.
5. Do not confirm whether someone is a member to a third party, and do not discuss one member with another.
6. Answers of record are written in the question system, not composed ad hoc in the chat window, so the record and the reply cannot diverge.

## 10. Records, audit, and Infinity events

Every inbound message, outbound reply, linking event, revocation, and prohibited-content flag is recorded server-side and retained per XR-POL-005. The channel emits internal Infinity events (XR-POL-032) for operational monitoring, including question response-due and overdue signals, using opaque member references and no message content. Telegram outage or bot failure does not close intake: email to research@xeniostechnology.com remains the fallback channel, and the outage itself is recorded (Sev3 under XR-POL-007 unless data exposure is suspected).

## Open items for counsel

- [COUNSEL: confirm the retention period for Telegram support records, triage logs, and linking events under XR-POL-005]
- [COUNSEL: confirm purge versus retain for member-sent prohibited content (section 4), reconciling deletion with retention duties; the same question is flagged in XR-MEM-023]
- [CONFIG: whether re-linking to a new Telegram account requires step-up authentication (section 6)]
- [CONFIG: automatic transcription of voice notes, and confirmation that XR-TRK-005 consent gating is sufficient if enabled (section 8)]
- [COUNSEL: review the emergency-routing script in section 7 for adequacy and any state-specific duties, consistent with XR-PUB-013 and XR-MEM-023]
- Reconcile this SOP with the earlier drafts docs/security/INCIDENT_RESPONSE_PLAN.md and docs/security/SECURITY_PROGRAM.md where they touch Telegram; counsel to confirm this SOP and XR-POL-007 supersede on channel operations.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
