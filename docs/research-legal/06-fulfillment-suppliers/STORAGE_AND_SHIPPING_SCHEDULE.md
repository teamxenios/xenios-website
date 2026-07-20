# Storage and Shipping Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-006 |
| Title | Storage and Shipping Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (fulfillment partner document, not member-facing) |
| Trigger | Execution of the Master Fulfillment Agreement (XR-FUL-001); must be in force before the Partner ships any Xenios order |
| Route | offline agreement (schedule attached to the Master Fulfillment Agreement, XR-FUL-001) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; packaging and packout records retained with the lot records they support |
| Acceptance event | wet/electronic signature as a schedule to the Master Fulfillment Agreement (XR-FUL-001) |
| Withdrawal supported | No. This is a contractual schedule. It changes only by written amendment signed by both parties. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-005, XR-FUL-007, XR-FUL-008, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; 04_MITCH_FULFILLMENT_PARTNER_PACK; 06_SHIPPING_STORAGE_SHELF_LIFE_AND_FULFILLMENT_MASTER |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This Schedule sets the storage, packaging, and shipping duties of the fulfillment partner (the
"Partner") holding and fulfilling peptide and Quantum inventory for Xenios Research during the
split-fulfillment period. Xenios separately fulfills supplements. One member order may become
multiple fulfillment orders with multiple tracking numbers; the member sees one order history and
pays one shipping charge per order. This Schedule attaches to and is governed by the Master
Fulfillment Agreement (XR-FUL-001). Capitalized terms not defined here have the meanings in
XR-FUL-001.

## 2. Storage

### 2.1 Labeled storage ranges are honored

Every SKU is stored within its labeled storage range as recorded in the product master
(XR-FUL-005), including any light and moisture protection requirements and orientation
requirements. The Partner does not infer storage conditions from a product's name or category;
storage follows the recorded profile for that SKU and lot.

### 2.2 Segregation

Quarantined, damaged, expired, recalled, and excursion-pending stock is physically or
systemically segregated so it cannot be picked. Blocked states and the FEFO picking rule are set
out in XR-FUL-005; temperature holds and excursion evaluation are set out in XR-FUL-007.

## 3. Packaging

### 3.1 Packaging bill of materials

Before launch the Partner provides a packaging bill of materials (BOM) for each shipping
configuration: outer box, internal protection, void fill, coolant and insulation where used,
indicator or logger where used, and labeling. Changes to the BOM for temperature-relevant
configurations require re-validation under XR-FUL-007 before use.

### 3.2 Vial protection

Vials are not interchangeable, and one packaging design is not assumed to fit all vial products.
For each vial product the Partner documents: vial material, stopper, seal, tamper evidence,
closure integrity source, label, light protection, moisture protection, orientation, shock
protection, and secondary containment.

### 3.3 Tamper evidence

Every outbound package carries tamper evidence appropriate to the product. A package whose tamper
evidence is compromised on receipt is handled as a product concern under XR-FUL-008 and the
product is never restocked.

## 4. Shipping profile per SKU

Every SKU has a recorded shipping profile before it is offered for sale. The profile is data, not
inference; no profile is derived from the product name. At minimum:

```text
shipping_profile_id
class: ambient / controlled / refrigerated / frozen / other
permitted carriers
maximum transit
weekend allowed
signature
adult signature if required
temperature monitor
seasonal packout
hazmat status
insurance
declared value
```

## 5. Carrier services

- Standard: standard parcel service for SKUs whose validated shipping profile permits it. The
  member-facing standard rate is $12.95 once per order, a launch working rate that is
  admin-configurable and reviewed against actual cost; the rate is a Xenios checkout matter and
  does not change the Partner's duties under this Schedule.
- Expedited 2-Day and Next-Day: offered at live or configured carrier rates where the SKU profile
  permits.
- Same-Day: only for eligible origin and destination ZIP codes, with inventory at the correct
  location, courier availability, a known cutoff, a secure handoff, and an actual service quote.
  Same-day is not a universal flat-rate feature.
- Temperature-Controlled: only after packout validation under XR-FUL-007, using validated
  services and a separate live or configured rate. No temperature-controlled service is offered
  or claimed without validation data.

## 6. Maximum transit and the shipping promise

Each SKU profile carries a maximum transit time. The Partner selects services that meet it and
flags any lane where it cannot be met. Xenios does not display a delivery date to the member
until inventory is reserved, the fulfillment owner has accepted the order, the service is
selected, the cutoff is known, and a carrier commitment is available. Member-facing displays show
an estimated ship date, an estimated delivery range, split-shipment status, temperature-control
state, and weekend limitations; the Partner's acceptance and ship-time data feed those displays.

## 7. Fulfillment service levels

The Partner's service-level commitments are recorded at onboarding and include, at minimum:

- order cutoff time for same-day processing
- normal processing time
- weekend processing capability
- same-day eligibility rules
- next-day eligibility rules
- carrier and service selection per profile
- tracking upload timing after ship
- address correction handling
- lost package process
- damage process
- temperature concern process (per XR-FUL-007)
- cancellation cutoff (the point after which an order can no longer be pulled back)

[CONFIG: the specific SLA values are recorded in the onboarding record and are admin-visible;
they are intentionally not hardcoded in this Schedule.]

## 8. Seasonal packout

Where a SKU requires temperature control, packout varies by season and lane. The Partner
maintains approved summer and winter packout configurations per XR-FUL-007 and applies the
correct seasonal configuration to each shipment. A shipment must not go out under an unvalidated
packout.

## 9. Order flow

Xenios sends the Partner, per fulfillment order: fulfillment order ID, customer shipping data,
SKU and quantity, lot rule, shipping service, signature rule, temperature service, and special
handling. The Partner returns: accepted or rejected, hold reason where applicable, lot shipped,
tracking, carrier, ship time, estimated delivery, exceptions, and delivery confirmation. The
Partner ships only what Xenios instructs, against the lot rules in XR-FUL-005.

## 10. Legal posture

Service levels and transit estimates in this Schedule are operational commitments between Xenios
and the Partner. They are designed to produce reliable delivery; they are not member-facing
guarantees, and member remedies for lost, damaged, incorrect, or temperature-compromised
shipments are governed by the member-facing policies and applicable law. This Schedule does not
waive rights that cannot be waived under applicable law and does not relieve either party of
duties imposed by law.

## Open items for counsel

- [COUNSEL: confirm that this Schedule is incorporated by reference into the Master Fulfillment
  Agreement (XR-FUL-001) and that the schedule set XR-FUL-005 through XR-FUL-008 is complete for
  the split-fulfillment period.]
- [COUNSEL: confirm carrier terms and conditions for the product categories shipped, including
  any carrier restrictions applicable to research products, before service selection is final.]
- [COUNSEL: confirm insurance and declared-value practice per profile, and reconcile with the
  Partner's cargo/transit coverage certificates.]
- [COUNSEL: confirm the retention period for packaging BOMs, packout records, and SLA records
  under XR-POL-005.]
- [CONFIG: SLA values (cutoffs, processing times, weekend capability, cancellation cutoff) to be
  captured in the onboarding record.]
- [COUNSEL: adult-signature requirements by product and destination state, and whether any SKU
  requires signature on delivery as a legal matter rather than an operational choice.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
