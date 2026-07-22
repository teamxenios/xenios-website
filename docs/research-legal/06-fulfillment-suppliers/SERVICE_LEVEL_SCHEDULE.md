# Service Level Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-003 |
| Title | Service Level Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (partner schedule) |
| Trigger | Executed with the Master Fulfillment Agreement (XR-FUL-001). Must be in force, with all [CONFIG] times filled from Mitch's written answers, before the first Fulfillment Order. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for SLA and exception records] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party, as a schedule to XR-FUL-001. |
| Withdrawal supported | No. This schedule ends with the Master Fulfillment Agreement's termination and transition provisions. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This schedule defines the operational service levels Mitch must meet for every Fulfillment Order during the split-fulfillment period. Capitalized terms have the meanings given in the Master Fulfillment Agreement (XR-FUL-001).

Every specific time, window, and threshold in this schedule is marked [CONFIG] because it is pending Mitch's written answers in the Mitch Fulfillment Readiness Response. A value becomes binding only when Mitch has stated it in writing and Xenios has accepted it in writing. A verbal commitment is not a service level.

## 2. Why these levels matter

Xenios shows a member an estimated ship date and delivery range only after inventory is reserved, Mitch has accepted the Fulfillment Order, the service is selected, the cutoff is known, and a carrier commitment is available. Mitch's acceptance speed, cutoff discipline, and tracking uploads are therefore the raw material of every promise Xenios makes to a member. A missed level here becomes a broken member promise there.

## 3. Order acceptance

3.1 Mitch must accept or reject each Fulfillment Order within [CONFIG: acceptance window, pending Mitch's written answers].

3.2 A rejection or hold must carry a specific hold reason (for example: stock blocked, documentation missing, address invalid, service unavailable). A bare rejection with no reason is a service failure.

3.3 Acceptance commits Mitch to the processing and ship windows in this schedule for that order. An acceptance later reversed without a quality or safety ground is an exception under Section 12.

## 4. Order cutoff

4.1 Daily order cutoff: [CONFIG: cutoff time and named time zone, pending Mitch's written answers]. The time zone must be stated explicitly; an unstated time zone is treated as unagreed.

4.2 Fulfillment Orders accepted before cutoff enter same-business-day processing where the SKU's shipping profile and the selected service permit. Orders accepted after cutoff enter the next processing day.

## 5. Processing windows

5.1 Normal processing: accepted Fulfillment Orders ship within [CONFIG: normal processing window, pending Mitch's written answers] of acceptance, subject to the SKU's shipping profile.

5.2 Weekend processing: [CONFIG: whether Mitch picks, packs, or ships on Saturday or Sunday, and for which services, pending Mitch's written answers]. If Mitch has no weekend processing, Xenios will configure its delivery promise engine so that no member-facing estimate assumes weekend movement, and no temperature-controlled shipment is tendered into a weekend it cannot survive under the validated packout.

5.3 Temperature-sensitive SKUs ship only on days and services consistent with their validated maximum transit time. Holding such an order for a safe ship day is correct behavior, not a miss, provided the exception is reported under Section 12.

## 6. Same-day eligibility

6.1 Same-day service is not a default offering. It exists for a given order only when all of the following hold: eligible origin, eligible destination ZIP, inventory physically at the correct location, local or national courier availability, order received before the same-day cutoff of [CONFIG: same-day cutoff], a secure handoff procedure, and an actual courier quote.

6.2 Mitch must state in writing which origins, ZIP ranges, and couriers support same-day, or state that same-day is unavailable. [CONFIG: same-day capability, pending Mitch's written answers.]

6.3 Xenios prices same-day at the live or configured courier rate. Mitch must not accept a same-day Fulfillment Order it cannot meet; rejecting it with the reason "same-day unavailable" is the correct action.

## 7. Next-day eligibility

7.1 Next-day service uses carrier-generated pricing at live or configured rates. Eligibility depends on the SKU's shipping profile, the carrier's own cutoff, and destination coverage.

7.2 Mitch must state its next-day cutoff and supported carriers in writing. [CONFIG: next-day cutoff and carriers, pending Mitch's written answers.]

## 8. Carrier and service selection

8.1 Each Fulfillment Order specifies the shipping service. Mitch ships only with a carrier and service permitted by the SKU's shipping profile under the Product Supply Schedule (XR-FUL-002) and only the service Xenios specified.

8.2 Substituting a different carrier or service requires Xenios's prior approval through the integration, recorded as an exception. Downgrading a temperature-controlled or signature-required service is never permitted.

8.3 Signature and adult-signature rules on the Fulfillment Order are mandatory instructions, not suggestions.

## 9. Tracking upload

9.1 For every shipment, Mitch must upload through the integration: tracking number, carrier, ship time, and estimated delivery, within [CONFIG: tracking upload window, pending Mitch's written answers] of the physical handoff to the carrier.

9.2 A shipment without an uploaded tracking record is incomplete. Xenios cannot show the member their tracking, so a late upload is a member-visible failure even when the box left on time.

9.3 One member order may produce multiple Fulfillment Orders and multiple tracking numbers. Mitch reports per Fulfillment Order; Xenios assembles the single member-facing order history.

## 10. Address correction

10.1 If Xenios sends an address correction before the order is packed, Mitch applies it and confirms through the integration at no charge beyond [CONFIG: address correction fee treatment, pending Mitch's written answers and the financial settlement schedule].

10.2 After carrier handoff, address corrections go through the carrier's process. Allocation of carrier correction fees is [COUNSEL: confirm allocation of carrier address-correction fees between the parties].

10.3 Mitch must never redirect a shipment to a new address on the request of anyone other than Xenios through the integration. Member requests route to Xenios. This is a fraud and chain-of-custody control.

## 11. Cancellation cutoff

11.1 Xenios may cancel a Fulfillment Order through the integration at any time before [CONFIG: cancellation cutoff point, for example the moment the order is packed, pending Mitch's written answers]. Mitch confirms the cancellation and releases the reserved stock.

11.2 After the cutoff, a cancellation request becomes an exception: Mitch reports whether interception is possible and at what cost. Product that leaves the facility is governed by the no-ordinary-returns posture of the program and the disposition rules of the Quality Agreement (XR-FUL-004); it is never restocked merely because the package looks unopened.

11.3 Member-facing cancellation rights are defined by Xenios's member policies and applicable law. Mitch executes instructions; it does not decide cancellation outcomes.

## 12. Exception reporting

12.1 Mitch must report every exception through the integration, including at minimum: late acceptance, late shipment, acceptance later reversed, oversell caused by an inventory feed error, address failure, carrier failure, damage discovered before shipment, temperature event, and lost package.

12.2 Each exception record must carry: fulfillment order ID, SKU and lot where relevant, exception type, cause if known, corrective action taken, and current status.

12.3 Mitch delivers an exception summary at [CONFIG: exception summary frequency, at least daily during launch, pending Mitch's written answers].

12.4 This Section is the exception process referenced in XR-FUL-001 Section 8.2. An oversell caused by a feed error is remedied here: Mitch identifies the affected orders, proposes the remedy, and bears the allocation defined in XR-FUL-001 Section 18 and the financial settlement schedule.

## 13. Lost package

13.1 A shipment is presumed lost when the carrier declares loss, or when tracking shows no movement for [CONFIG: no-movement day threshold, pending Mitch's written answers and carrier terms].

13.2 Mitch files and manages the carrier claim, preserves all evidence (packout records, weights, photos where taken), and reports claim status through the integration.

13.3 Xenios owns the member resolution. The member outcome (full replacement or full refund under the member-facing damage, loss, incorrect item, and temperature concern policy) does not wait for the carrier claim to resolve. Cost allocation between the parties follows XR-FUL-001 Section 18 and the financial settlement schedule.

## 14. Damage and temperature concerns

14.1 Damage, suspected temperature compromise, and any indicator or logger alarm are quality events. Mitch's service-level duty here is speed and preservation: notify Xenios within [CONFIG: quality event notification window, pending Mitch's written answers], quarantine affected stock, and preserve the packaging, indicator, and records.

14.2 Assessment, release, destruction, and member communication follow the Quality Agreement (XR-FUL-004). Neither Mitch's staff nor Xenios support may guess a temperature outcome.

## 15. Performance review

15.1 The parties review performance monthly against this schedule, using at minimum: acceptance timeliness, ship timeliness, tracking upload timeliness, actual carrier cost versus charged cost, delivery days, damage rate, loss rate, temperature concerns, replacements, and carrier claim outcomes.

15.2 Persistent misses are addressed first by corrective action with dates, and escalate under XR-FUL-001. [COUNSEL: decide whether to add service credits, and define the miss thresholds that constitute material breach for termination purposes.]

## Open items for counsel

- All [CONFIG] service times and thresholds in Sections 3 through 14 are pending Mitch's written answers in the Mitch Fulfillment Readiness Response; none are agreed yet.
- Allocation of carrier address-correction fees (Section 10.2).
- Whether to add service credits, and the miss thresholds that amount to material breach (Section 15.2).
- Retention period for SLA and exception records (metadata table).
- Confirm this schedule's exception process language matches XR-FUL-001 Section 8.2 and Section 18 after any counsel edits to that Agreement.
- Reconcile Sections 13 and 14 with the member-facing damage, loss, incorrect item, and temperature concern policy in docs/research-legal/04-commerce-product/ so partner duties and member promises cannot diverge.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
