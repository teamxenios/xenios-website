[XENIOS LAUNCH SPRINT HANDOFF]

SESSION: claude-fable-s9-conversion-qa
TASK: P0-G browser / visual proof (also covers P0-F mobile and much of P0-B)
BRANCH: lane/e2e-conversion-qa-20260819
BASE SHA: origin/xenios/launch-integration-20260819
PUSHED SHA: 06e38043a0b5b880e2a055e856f1d03932541378
ORIGIN VERIFIED: YES — git ls-remote returns 06e38043... for refs/heads/lane/e2e-conversion-qa-20260819
PRODUCTION MUTATED: NO. No real email sent. Local stack only.

WHAT NOW WORKS

The founder P0 path completes END TO END IN A REAL BROWSER at 320px.
Reference produced: XRR-20260821-9E608740FD, one line, $33.50.

catalog -> retail price -> search -> exact variant -> quantity -> optional
affiliate code -> customer info -> shipping -> agreements -> submit -> reference
-> 1 customer notification + 1 admin notification.

This is the first end-to-end browser run in the fleet. The environment gap that
blocked it all day is solved on this machine and the rebuild is scripted.

Durable record the founder will work from:
  XRR-20260821-9E608740FD / submitted / $33.50
  Sona QA Nine, s9-qa@example.test, +1 512 555 0109
  123 Test Bench Rd, Austin, TX 78701
  BPC-157 / BPC-157 5 mg / qty 1 / unit 3350 / line 3350 / direct_order_request
  verified affiliate attribution: NULL (a typed code did not become attribution)

Notifications: exactly 2 enqueued, one customer one admin, both
failed_retryable because this env has no email provider — and the order still
returned 201. Email failure does not cost the customer their order, observed.

MOBILE: no horizontal overflow at 430/390/375/360/320; every action button on
screen, none under 32px, every input >= 16px so iOS will not zoom. Submitted at
320px. The 14.4px input problem I reported yesterday was the standalone wizard,
not this path.

CONFIRMED FIXED since yesterday: the order-request form acknowledgments now
render and submit, so the P0 that made submission unsatisfiable is closed.

FINDINGS

1. GRP-0422 IS NOT VISIBLE AT ALL. The founder requires it VISIBLE, retail
   priced $99, Request Order, never direct. It does not render because it is
   absent from the data the storefront reads. Verified independently of my
   environment: member-safe-master-offerings.generated.json carries 420
   offerings / 420 variants and ZERO WITH-DAC + Ipamorelin rows, against a
   canonical 424. A customer searching Ipamorelin gets eight rows, none of them
   the held combination. This is an artifact/data gap and per the sprint rule
   must NOT be patched in client code — it needs the artifact regenerated after
   the reconciliation. Owner: catalog artifact build (s7 / lead).

2. AGREEMENT IDENTITY IS HARDCODED CLIENT-SIDE, CONFIGURED SERVER-SIDE. The
   client POSTs {kind:"early_access_terms",version:"v1"} hardcoded at
   client/src/research/adapters/earlyAccessAgreement.ts:33; the server requires
   whatever RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS names. When they disagree
   the customer ticks the policy and gets 400 AGREEMENT_NOT_REQUIRED with no way
   forward. Captured off the wire. In my case the mismatch was my own env value,
   so this is not proof of a live defect — but it is silent, config-dependent
   and sits between catalog and submit. CHECK THE PRODUCTION VALUE BEFORE THE RC.
   Same shape as yesterday's form-acknowledgments P0.

3. Featured products fails to load and says so honestly ("a fault on our side,
   not an empty catalogue"). Almost certainly this env lacking release data.
   Recorded because the copy correctly distinguishes cannot-reach from
   nothing-to-sell.

NOT CONCLUDED, DELIBERATELY

Everything WITH DAC read "Price pending" because this env seeds prices for only
18 products. NO conclusion about whether WITH DAC 2mg/5mg route to direct. Same
for Hexarelin 5mg / Oxytocin 10mg, whose price is still with the founder; each
appears exactly once in the artifact, so no duplicate pair was observed.

TESTS

Lane suite unchanged and green: 45/45 across e2e/** (launch invariants,
pricing cache, acceptance path, order-routing negatives).

REMAINING RISK

GRP-0422 invisibility is the launch-relevant one: a held product that the
founder expects customers to SEE and request is simply absent.

INTEGRATION INSTRUCTIONS

Doc only: docs/research-launch/P0G-BROWSER-PROOF-2026-08-21.md. No source
changes. Reproduction steps for the environment are in the doc so another
session can stand it up.
