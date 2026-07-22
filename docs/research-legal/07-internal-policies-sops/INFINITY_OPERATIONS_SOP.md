# Infinity Operations SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-032 |
| Title | Infinity Operations SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applied to every Infinity event intake, alert, automation, and approval packet |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | event records, alerts, approval packets, and dead-letter entries per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-001, XR-POL-004, XR-POL-005, XR-POL-007, XR-POL-012, XR-POL-031, XR-POL-034, XR-COM-010, XR-COM-019 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What Infinity is, and is not

Infinity is Samuel Boadu's internal executive assistant: a governed alert and operations layer that watches Xenios Research systems, raises what needs attention, tracks deadlines, and prepares work for Samuel's decision. It is internal only.

Infinity is not a member-facing medical bot. It never talks to members, never appears on a member surface, never drafts a diagnosis, prescription, or dose, and never sends anything external on its own authority. Members interact with Xenios through the member site, email, and the Telegram support channel (XR-POL-031); Infinity sits behind all of them.

## 2. Trust boundary and event intake

Xenios Research systems communicate with Infinity only through signed internal events.

1. Service authentication: only registered Xenios services may submit events. Each service holds its own credential, stored encrypted, never in code, logs, or documents (per the secrets rules in the engineering standards).
2. Signature and replay protection: every event is signed; Infinity verifies the signature and rejects replays. An event that fails verification is dropped to the dead-letter queue and logged, never processed.
3. Validation: events must match the registered event contract (type, schema, severity fields). Malformed events go to the dead-letter queue.
4. Deduplication: repeated events for the same underlying fact collapse into one card with an occurrence count, so alert fatigue does not bury a real signal.
5. Rate limiting: a misbehaving source is throttled and flagged rather than allowed to flood the queue.
6. Revocation: any service credential can be revoked immediately, and revocation is itself an audited event.
7. Dead-letter review: the dead-letter queue is reviewed on a defined cadence [CONFIG: dead-letter review cadence], because a broken event source can silently hide real incidents.

## 3. Payload rules: minimum necessary, opaque references

Every event payload follows minimum-necessary discipline as classified under XR-POL-004:

1. Opaque member references only. Events carry an internal reference token, never a name, email, phone number, or address.
2. No raw health data, ever. No assessment content, tracker entries, media, or health descriptions in any event or alert.
3. No secrets. No passwords, tokens, keys, or payment data in any payload, card, or alert.
4. Safe fields only: event type, severity, timestamps, opaque references, order or question identifiers, and counts. If a human needs the underlying detail, they open the admin surface with their own authenticated, audited access; the alert is only the pointer.

## 4. Event catalog

The registered internal events, grouped by domain:

- Security: research.security.account_compromise, research.security.suspicious_login, research.account_access.blocked, research.password_reset.failure
- Privacy: research.privacy.possible_exposure
- Product safety: research.product_concern.received, research.adverse_event.reported, research.recall.opened
- Payments and messaging: research.payment.failure, research.subscription.failure, research.email.delivery.failure
- Review SLAs: research.review.sla_at_risk, research.review.overdue
- Member questions: research.question.response_due, research.question.overdue
- Commerce and fulfillment: research.large_order.review_required, research.fulfillment.exception, research.inventory.expiry_risk

New event types are added only through the event contract process with schema, severity mapping, and payload review; no service invents an ad hoc event.

## 5. Severity mapping and SLA timers

Infinity maps events to severity consistently with the Incident Response Plan (XR-POL-007): security and privacy events default high; anything suggesting exposure of member data is treated as Sev1 until ruled out. Infinity also runs the program's SLA timers and raises at-risk before overdue:

```text
Plan reviews: 48 elapsed hours, including weekends
Normal member questions: approximately 12 hours
Large order reviews: approximately 2 hours
```

The timers exist so a single-operator program does not silently miss a commitment. An SLA alert is a signal to the founder, never a message to a member.

## 6. What Infinity may automate

Without further approval, Infinity may:

- classify and deduplicate incoming events,
- summarize safe fields into a Command Center card,
- create an internal task,
- create a calendar reminder or follow-up,
- queue a card for Samuel's review,
- monitor SLA timers and raise at-risk and overdue alerts, and
- prepare a response draft for human review.

Everything in this list is internal, reversible, and content-safe. A response draft is a draft: it goes nowhere until a human sends it under section 7.

## 7. What requires Samuel's approval

The following never execute on Infinity's own initiative:

- sending any non-template external response,
- changing a member's account, status, or data,
- issuing a refund,
- approving an order (including large orders under XR-COM-010),
- changing a subscription,
- activating a product,
- publishing a Blueprint or plan,
- exporting data, and
- any destructive action.

Approval mechanics: each proposed action is presented as an approval packet naming the exact action, the exact target, the systems and data affected, the risk, the expected result, and the rollback or compensation plan. Approval uses a single-use token bound to that exact packet; a changed target or payload voids it. Model output never authorizes an action; only Samuel's explicit approval does. Approved actions are executed with idempotency protection so a retry cannot run twice, and the packet, approval, execution, and verification are all audited.

## 8. Telegram alerts to Samuel

Infinity may alert Samuel on Telegram. These founder alerts follow the same payload rules as events: opaque member references, no raw health data, no secrets, no member content. The alert names the event type and severity and points to the Command Center; the substance stays on Xenios surfaces. This is deliberate: the founder's Telegram is protected, but it is still a third-party platform, and the hard rule that sensitive content stays on Xenios surfaces (XR-POL-031) applies to staff-facing traffic too. Loss of the founder device is handled as a security incident (XR-POL-007) and Infinity's Telegram channel is revoked server-side.

## 9. Audit and records

Every event, verification failure, dedup decision, card, alert, task, approval packet, approval, rejection, execution, and revocation is written to the audit log under XR-POL-012 and retained per XR-POL-005. The audit trail must be able to answer, for any consequential action: what was proposed, who approved it, exactly what ran, and what the verified result was.

## 10. Failure model

1. Infinity down: member-facing flows do not depend on Infinity. Applications, orders, questions, and cancellations proceed; only the alerting layer degrades. The operational queues on the admin surface remain the source of truth.
2. Alert delivery failure: undelivered alerts remain as queued cards; the Command Center, not Telegram, is the system of record for open items.
3. Event source failure: a silent source is itself an alertable condition [CONFIG: heartbeat or liveness checks per source].
4. Nothing fails into member contact: no failure mode may cause Infinity to message a member.

## Open items for counsel

- [COUNSEL: confirm the retention period for event records, approval packets, and dead-letter entries under XR-POL-005]
- [COUNSEL: confirm that founder Telegram alerts with opaque references and no health content are acceptable under the applicable privacy analyses (XR-POL-008, XR-POL-009), or whether alerting must move fully onto Xenios surfaces]
- [CONFIG: dead-letter review cadence (section 2)]
- [CONFIG: heartbeat or liveness checks per event source (section 10)]
- [COUNSEL: whether approval packets and audit records for refunds and member changes need specific retention or evidentiary handling for payment-dispute defense]
- Reconcile with the earlier drafts docs/risk/THREAT_MODEL.md and docs/security/SECURITY_PROGRAM.md where they describe internal alerting; counsel to confirm this SOP governs the Infinity layer.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
