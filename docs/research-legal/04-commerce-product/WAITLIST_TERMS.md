# Waitlist Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-012 |
| Title | Waitlist Terms |
| Audience | member |
| Required member state | active member |
| Trigger | joining a waitlist for an out-of-stock or unavailable product |
| Route | /research/member/shop (product pages) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); waitlist entries deleted or anonymized within [CONFIG: period] after the member leaves the list or the product returns; minimum [COUNSEL: confirm period] |
| Acceptance event | join action (button) + notification preference + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | Yes. The member can leave any waitlist at any time from the product page or account, which stops related notifications. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-013, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What this document is

These terms govern product waitlists in the Xenios Research member catalog. When a
product is out of stock or otherwise unavailable, it stays visible in the catalog and an
active member can join its waitlist and choose how to be notified. This document explains
exactly what joining a waitlist does, and what it does not do.

## 2. Joining a waitlist

- Only active members can join a waitlist, because the catalog itself is member-only.
- Joining takes one action on the product page. The member selects a notification
  preference: email to the member's verified address, Telegram notification, or both
  [CONFIG: available notification channels].
- The member can view their waitlisted products and their status in their account.

## 3. What the member sees: anonymous position or status only

Waitlist standing is shown as an anonymous position (for example, a number in line) or a
status, and nothing more.

- No member ever sees another member's identity, and no other member sees theirs.
  Waitlist displays never expose names, initials, or any member information.
- Xenios does not display or promise inventory counts, restock quantities, or restock
  dates. A position or status is informational and can change, for example when members
  ahead leave the list or when incoming stock differs from expectations.

## 4. What a waitlist is not

- A waitlist is not a reservation. It does not hold, allocate, or set aside any unit of
  product for the member.
- A waitlist is not an order and not a contract of sale. No payment is collected, no
  authorization is placed, and no order forms until the member separately checks out
  under the Product Order Terms (XR-COM-001) once the product is available to them.
- A waitlist is not a price lock. The price at the time of a later purchase applies, and
  it may differ from the price displayed when the member joined the list.
- A waitlist notification is not a guarantee of availability. Stock may sell through
  before the member acts, and server-side eligibility controls still apply to the member
  and destination state at the time of purchase (XR-COM-013).
- Xenios makes no promise of any restock date and no promise that a waitlisted product
  will return at all. A product may move to Documentation Review, Commerce Review,
  Temporarily Unavailable, or be withdrawn.

## 5. Notifications

- When a waitlisted product becomes available to the member, Xenios sends one
  availability notification through the member's chosen channel, and may send a limited
  follow-up [CONFIG: follow-up count and spacing].
- Availability notifications are transactional service messages tied to the member's
  explicit request, not marketing. Leaving the waitlist stops them. Marketing email
  remains governed by its own consent.
- Notification order may follow waitlist position but is not guaranteed to, for example
  where eligibility differs by destination state. [CONFIG: whether notifications are
  staged by position or sent to the full list at once.]

## 6. Leaving a waitlist

The member can leave any waitlist at any time from the product page or their account.
Leaving stops availability notifications for that product and removes the member's entry.
Cancelling membership removes the former member from all waitlists.

## 7. Limits of this document

Nothing in a waitlist, a position, a status, or a notification is medical advice, a
recommendation to use any product, or an outcome promise. Peptide catalog items are
research products whose classification and permitted marketing lane are under formal
review. These terms do not waive rights that cannot be waived under applicable law and do
not relieve Xenios of duties imposed by law.

## Open items for counsel

- [CONFIG: available notification channels at launch (email, Telegram, or both).]
- [CONFIG: follow-up notification count and spacing after an availability notice.]
- [CONFIG: whether availability notifications are staged by position or sent to the full
  list at once.]
- [CONFIG: retention period for waitlist entries after leaving or restock, feeding
  XR-POL-005.]
- [COUNSEL: confirm the transactional (non-marketing) classification of availability
  notifications under CAN-SPAM and related state rules, and the Telegram channel's
  treatment under the messaging consents.]
- [COUNSEL: confirm the "no reservation, no price lock" framing is prominent enough at
  the join action to prevent deception claims.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
