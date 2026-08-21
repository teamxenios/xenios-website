[XENIOS LAUNCH SPRINT HANDOFF]

SESSION: claude-fable-s9-conversion-qa
TASK: P0-C and P0-D verified against a real order (after P0-G / P0-F)
BRANCH: lane/e2e-conversion-qa-20260819
BASE SHA: origin/xenios/launch-integration-20260819
PUSHED SHA: ff46ed9ea965f076995f800806e51b8ed85691d3
ORIGIN VERIFIED: YES — git ls-remote returns ff46ed9e... for the branch
PRODUCTION MUTATED: NO. No real email sent.

WHAT NOW WORKS

Both launch emails are verified against the ACTUAL enqueued notifications from
XRR-20260821-9E608740FD — the order I placed in a browser — rather than against
a fixture or a read-only audit.

P0-C ADMIN EMAIL: PASSES. Carries order reference, customer name, email, phone,
full shipping address, product, specification, quantity, retail unit price, line
total, order total, agreements with versions, acceptance timestamp, customer
notes, operatorStatus "Order received. Awaiting manual review.", and a secure
adminPath. No wholesale, cost, margin, markup or multiplier anywhere.

The affiliate separation holds end to end on real data:
  declaredAffiliateCode: "DANA10"      <- what the customer typed
  affiliateAttributionRef: null        <- nothing routes commission
This matches what the lead observed on the live production order, now confirmed
independently through the browser path.

P0-D CUSTOMER EMAIL: PASSES the current list. Reference, items, quantities,
retail totals, status and next steps. paymentState reads "none_due_yet" and the
copy says Xenios will review availability and follow up. Nothing claims paid,
inventory confirmed, fulfilled or shipped.

ONE DISCREPANCY FOR YOU TO SETTLE

An earlier version of the directive listed a shipping destination summary among
the customer email contents; the current version does not, and the payload does
not carry one — the customer is not shown where their order is going. The admin
copy has the full address, so this only affects the customer's view. It is a
difference between directive versions rather than a defect, so I did not change
anything: your call.

TESTS

Lane suite unchanged: 45/45 across e2e/**. This slice is documentation of
observed production-shaped behaviour, no source change.

REMAINING RISK

Unchanged and still the important one: GRP-0422 is absent from the member-safe
artifact (420 offerings / 420 variants, zero WITH-DAC + Ipamorelin rows, against
a canonical 424), so the row the founder requires customers to SEE and request
does not render at all. Artifact regeneration, not client code.

INTEGRATION INSTRUCTIONS

Doc only: docs/research-launch/P0G-BROWSER-PROOF-2026-08-21.md.
