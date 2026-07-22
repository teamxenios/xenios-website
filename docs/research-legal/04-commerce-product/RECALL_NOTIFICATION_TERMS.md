# Recall Notification Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-018 |
| Title | Recall Notification Terms |
| Audience | member |
| Required member state | active member (accepted before the first product purchase completes; obligations survive cancellation for products already purchased) |
| Trigger | first checkout attempt containing any physical product, before payment |
| Route | member checkout flow on /research member pages; also available from /research/member/account |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; recall records themselves are retained per the recall record rule [COUNSEL: confirm recall record retention] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | no (these are safety-notification terms tied to products you buy; they are not a marketing consent and recall notices are sent regardless of marketing preferences) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-017, XR-COM-019, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA adverse-event reporting for dietary supplements; FDA guidance-regulation for food and dietary supplements |
| Review date | 2026-07-19 |

## 1. Purpose

If a product you bought through Xenios is recalled, Xenios needs to reach you fast, and you
need to act on the notice. These terms explain how recall notices arrive, what they contain,
and what you are required to do.

## 2. What a recall notice is

A recall notice is a safety communication telling you that a specific product, usually a
specific lot, should no longer be used, and what to do about it. A notice may originate from a
manufacturer, a supplier, a regulator, or Xenios's own quality process (for example a
temperature excursion, a complaint pattern, or a supplier alert). Whatever the origin, Xenios
sends the member-facing notice for products bought through Xenios.

## 3. Your duty to keep contact information current

1. Keep your email address, mobile phone number, and shipping address current in your account
   at all times. This is a condition of buying physical products through Xenios.
2. Recall notices are sent to the contact details on file. If your details are stale, a notice
   may not reach you, and Xenios cannot act on information it does not have.
3. Update contact details self-service in your account. Changes take effect for future
   notices immediately.

## 4. How recall notices arrive

1. Email, from research@xeniostechnology.com, to your verified address. Email is the primary
   channel.
2. Member dashboard, as a prominent notice on your account until you acknowledge it.
3. Telegram, optionally, if you have linked Telegram. Telegram is a convenience copy, never
   the only channel and never the system of record.

Recall notices are safety communications, not marketing. They are sent regardless of your
marketing or notification preferences, including after unsubscribing from marketing email.

## 5. What a recall notice contains

Each notice is written to identify, at minimum:

- the product name and SKU,
- the affected lot number or numbers, and how to find the lot on your product,
- the reason for the recall, stated plainly,
- stop-use instructions: exactly what to stop doing, effective immediately,
- what to do with the product (hold, return, or dispose, per the notice),
- the remedy (replacement or refund, per the notice and the returns policy),
- how to confirm receipt and how to ask questions (reply email or Telegram),
- who is accountable: Samuel Boadu is the named accountable human for escalations.

## 6. Required member response

1. Read the notice promptly. Recall notices are time-sensitive.
2. Follow the stop-use instructions in the notice itself. The notice controls: these terms do
   not tell you how to use or stop using any product; the specific notice does.
3. Check your product's lot number against the notice before deciding it does not apply to you.
4. Do not use, consume, sell, give away, or transfer affected product.
5. Confirm receipt where the notice requests confirmation, so Xenios can close the loop and
   meet its own reporting obligations. [COUNSEL: confirm whether receipt confirmation is
   mandatory and what follow-up applies to non-responders.]
6. Follow the return or disposal instructions in the notice. Recalled or compromised product
   is never restocked.

## 7. Remedies

Where a recall notice applies to product you bought, the remedy stated in the notice applies:
full replacement or full refund for affected product, consistent with the returns policy and
subject to applicable law. Store credit is never forced in place of a legally required refund.

## 8. After cancellation

Cancelling your membership does not cancel recall safety notices for products you already
bought. Xenios retains transaction records under its retention schedule in part so it can
reach past purchasers of recalled product. The limited non-member workflow after cancellation
includes receiving recall notices at your last known contact details, which is one more reason
to keep them current until any product you hold is used up or disposed of.

## 9. Legal posture

These terms do not limit rights you have under applicable law and do not relieve Xenios of
duties imposed by law, including any regulatory recall obligations. Recall execution
responsibilities among Xenios, its brands and suppliers, and its fulfillment partner during
the split-fulfillment period are being allocated in writing.

## Open items for counsel

- Confirm the written allocation of recall responsibilities among Xenios, each supplement
  brand, peptide suppliers, and Mitch (fulfillment partner) during the approximately 60-day
  split-fulfillment period: `[COUNSEL: recall responsibility allocation]`.
- Confirm regulatory notification obligations (FDA and any state) that attach to Xenios as a
  reseller for each lane, and who files what.
- Confirm whether receipt confirmation is mandatory and the follow-up protocol for
  non-responders (repeat email, SMS, phone): `[COUNSEL: confirm]`.
- Confirm recall record retention period: `[COUNSEL: confirm recall record retention]` and the
  acceptance-record period under XR-POL-005: `[COUNSEL: confirm period]`.
- Confirm that sending recall notices to former members at last known contact details is
  correctly scoped under the privacy notices.
- Reconcile retention references with docs/privacy/RETENTION_POLICY.md in this repository.
- Confirm the exact legal entity name to substitute for `[ENTITY]` as the notifying party.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
