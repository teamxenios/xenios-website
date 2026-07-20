# Optional SMS and Telegram Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-012 |
| Title | Optional SMS and Telegram Consent |
| Audience | applicant and member (both channels optional at every stage) |
| Required member state | optional; SMS may be offered from application onward; Telegram linking requires an active member account |
| Trigger | unchecked-by-default SMS opt-in at application and in the member account; Telegram linking flow in the member account |
| Route | /research/apply (optional SMS opt-in); /research/member/account (SMS preferences and Telegram linking) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; opted-out numbers retained on a suppression list to honor the opt-out; TCPA consent records [COUNSEL: confirm period, at least the limitations period] |
| Acceptance event | SMS: unchecked-by-default checkbox + timestamp + document version + subject reference recorded server-side. Telegram: member-initiated one-time linking code redeemed in the member account, recorded with timestamp and account reference |
| Withdrawal supported | yes; SMS: reply STOP to any message or use the account toggle; Telegram: unlink in the member account at any time (or block the bot); each is recorded as a new event |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-004, XR-PUB-011, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FCC TCPA consumer guides; FTC telemarketing guidance |
| Review date | 2026-07-19 |

## 1. What this consent is

Xenios Research offers two optional message channels: SMS text messages to your
verified mobile number, and Telegram for member questions and support. Both are
opt-in. Neither is required. You can be reviewed, approved, activated, and fully
served as a member using email and the member website alone.

Consent to receive SMS or to link Telegram is not a condition of applying, of
membership, or of purchasing anything.

## 2. SMS consent

### 2.1 Consent language presented at the opt-in (draft)

```text
Optional: check this box to agree that Xenios Research may send text messages to the
mobile number you provided, including application and membership status updates, plan
and Review Week notifications, and account alerts. Consent is not a condition of
membership or of any purchase. Message frequency varies. Message and data rates may
apply. Reply STOP to stop, HELP for help.
```

This is express written consent in the TCPA style. [COUNSEL: confirm the final consent
language, whether any planned message class is marketing rather than informational and
needs prior express written consent with the E-SIGN disclosure, and the state
mini-TCPA overlay.]

### 2.2 What we send by SMS

Informational messages tied to your application or membership: application status,
activation steps, plan publication and Review Week notices, order and shipping
updates, and security alerts where SMS is your chosen factor or contact. Marketing by
SMS is not planned at launch; if it is ever introduced it will require its own
separate opt-in [COUNSEL: confirm separate consent capture for any future marketing
SMS].

### 2.3 Opt-out and help

- Reply STOP to any message to stop all SMS. We send one final confirmation of the
  opt-out and nothing further.
- Reply HELP for help, or contact research@xeniostechnology.com.
- You can also turn SMS off in your member account at any time.
- Opted-out numbers go on a suppression list used only to honor the opt-out.

### 2.4 Quiet hours and frequency

We do not send routine SMS during quiet hours: [CONFIG: quiet hours window, working
default 9:00 pm to 8:00 am in the recipient's local time zone]. Security alerts that
protect your account may send at any time. Message frequency varies with your
activity; there is no fixed cadence.

### 2.5 Costs and carriers

Message and data rates may apply under your mobile plan. Carriers are not liable for
delayed or undelivered messages. Keep your number current; if you give up a number,
tell us so we do not text its next owner [COUNSEL: confirm reassigned-number database
screening obligations].

## 3. Telegram consent

### 3.1 What Telegram is used for

Telegram is the member support channel: questions by text or voice notes up to 60
seconds, 24/7 intake, with a normal response target of approximately 12 hours, plus
optional plan-notification pings. There are no public queue numbers and no
self-mark-urgent control. If your message contains emergency language, the channel
directs you to emergency services (911 in the US); Telegram support is not an
emergency service and not medical care.

### 3.2 How linking works

Linking is member-initiated: you generate a one-time code in your member account and
send it to the Xenios Research Telegram bot. The link is recorded with a timestamp and
your account reference. Nobody can link a Telegram account to your membership without
that code, and the code expires after [CONFIG: code expiry, working default 10
minutes] or one use.

### 3.3 What never moves over Telegram

Telegram is never the system of record. Regardless of who asks, the following are
never sent or accepted over Telegram: passwords, password reset tokens, identity
documents, plan PDFs, raw health media, payment card or bank data, and detailed
assessment content. Plan documents are delivered only through the secure Document
Center; Telegram may carry the notification that a document is ready, never the
document. Support staff will never ask you for a password or code over Telegram.

### 3.4 Revoking the link

Unlink Telegram in your member account at any time; the bot stops messaging you
immediately. Blocking the bot in Telegram has the same practical effect. Revocation is
recorded as a new event. Message history already exchanged remains in our support
records under the retention schedule. Telegram the platform has its own terms and
privacy policy that govern your Telegram account itself.

## 4. How consent is recorded

Each opt-in, opt-out, link, and unlink is recorded server-side as an append-only
event: what you agreed to, the version of the text you saw, and when. The current
state is the latest event. This is how we prove we respected your choices.

## 5. Contact

Questions: research@xeniostechnology.com. This consent does not waive rights that
cannot be waived under applicable law, and it does not relieve Xenios of duties
imposed by law.

## Open items for counsel

- [COUNSEL: confirm the final SMS consent language, the informational versus marketing
  classification of each planned message class, and the state mini-TCPA overlay]
  (section 2.1).
- [COUNSEL: confirm separate consent capture for any future marketing SMS]
  (section 2.2).
- [COUNSEL: confirm reassigned-number database screening obligations] (section 2.5).
- [CONFIG: quiet hours window, working default 9:00 pm to 8:00 am recipient local
  time]; counsel to confirm state quiet-hour rules that are stricter (section 2.4).
- [CONFIG: code expiry, working default 10 minutes] for the Telegram one-time linking
  code (section 3.2).
- [COUNSEL: confirm period] for the retention baseline and for TCPA consent-record
  retention (metadata table).
- Confirm whether security alerts may bypass quiet hours in all states (section 2.4).
- Confirm Do Not Call registry and telemarketing analysis if any voice calling is ever
  added; this consent covers messaging only.
- Reconcile with the earlier draft docs/security/CONSENT_REGISTRY.md (append-only
  consent events, one-time-code Telegram linking) so the recorded consent kinds match
  this document at publication.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
