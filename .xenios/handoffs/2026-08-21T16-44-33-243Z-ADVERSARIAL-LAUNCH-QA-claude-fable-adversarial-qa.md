# ADVERSARIAL LAUNCH HANDOFF

**Session:** claude-fable-adversarial-qa
**Role:** adversarial composed manual-order QA (break the launch before customers do)
**Branch:** xenios/launch-integration-20260819
**SHA:** f1af60b219e8390de47d0007e4c875e544d3dff7
**ORIGIN VERIFIED:** pending push (see end); this handoff is committed on top.
**Production mutated:** NO

---

## COMPOSED HAPPY PATH: PASS

eligible RUO peptide → catalog → quantity → affiliate (declared) → customer →
shipping → agreements → submit → durable XRR reference → customer + admin
notification, asserted at the real production composition (`e2e/harness/
assisted-order-door.ts`) — the same HTTP door a customer reaches, not a module
in isolation.

- ORDER EXACTLY ONCE: **PASS** (`acceptance-path.spec.ts` — one durable request,
  admin queue total 1; idempotent replay and race both collapse to one).
- CUSTOMER NOTIFICATION EXACTLY ONCE: **PASS** (exact count == 1; distinct
  dedupe key naming the request; replay/race do not re-notify).
- ADMIN NOTIFICATION EXACTLY ONCE: **PASS** (exact count == 1 to
  research@xeniostechnology.com).
- SECURITY: **PASS** (money server-authoritative; workflow-mode/price/affiliate
  attribution never read from the browser; IDOR held; no wholesale/margin/cost
  leakage into catalog, receipt, or either notification).

Full `e2e` suite at this SHA: **51 pass + 3 expected-fail** (the 3 are the
tripwires below).

---

## NEGATIVE TESTS: 25 added this session (22 passing locks + 3 tripwires)

New this session, all at the composed HTTP door:

`e2e/submission-validation-negatives.spec.ts` (22 passing regression locks):
- quantity: zero, negative, fractional, string, null → 4xx, no order, no notify
- founder ceiling: 100 accepted, 101 refused
- line set: empty refused; duplicate variant refused (not silently summed)
- legal gate: no agreements / stale version / notice-only (form pair skipped) → 4xx
- age gate: ageConfirmed=false → 4xx
- identity: anonymous caller (no member session) → 4xx
- each missing shipping sub-field (line1/city/region/postalCode/countryCode) → 4xx
  with the offending field named, no notify

`e2e/malformed-submission-5xx.spec.ts` (3 `it.fails` tripwires + 1 green lock):
- the confirmed defect below, reproduced; plus a green assertion that the
  malformed submission stays fail-closed (no order, no notify) regardless of
  status code.

These join the pre-existing composed negatives (`launch-invariants.spec.ts`,
`order-routing-negatives.spec.ts`) which already cover the money/pathway/notify
matrix.

---

## CONFIRMED DEFECTS FIXED (in paths I own)

None required a source fix in an owned path. The one confirmed defect lives in a
non-owned lease (below); I committed its executable reproduction and the
passing negatives in my own `e2e/` suite.

---

## MAIN-OWNED DEFECTS REPORTED

### D1 — Malformed submission omitting a nested object returns 500, not 4xx
**Owner:** `shared/research/assisted-order/contract.ts` (ASSISTED-ORDER-MOUNT /
MAIN + ASSISTED-ORDER-CUSTOMER-FLOW / s3). **Severity: MEDIUM** (robustness /
observability; fail-closed — no order, no write, no notification).

**Symptom.** A submission that omits a whole nested object returns
`500 { error: "assisted_order_unavailable", message: "The assisted order
service is temporarily unavailable." }`. Three shapes:
1. `contact` absent
2. `contact.shippingAddress` absent
3. `contact.billingAddress` absent while `billingSameAsShipping === false`

A missing *sub-field* (e.g. `postalCode`) is a correct `400 validation_error`.
Only the missing *object* crashes. A wrong-typed but truthy value (a string
`shippingAddress`) is also a correct 400 — the crash is specifically the
`undefined`/`null` object case.

**Root cause.** `validateSubmitInput()` reads `input.contact.email`
(~line 449) and `validateAddress()` reads `input.line1` (~line 423) BEFORE
validating presence. `normalizeRequiredText(undefined)` throws the correct
`AssistedOrderValidationError` (⇒ 400), but `undefined.line1` throws a raw
`TypeError` first, and the express adapter maps an unrecognised throw to 500.

**Why it matters on a manual launch.** No security/money impact, but a 4xx
client mistake is presented to the customer as "service temporarily
unavailable" — they abandon, and the founder (who finishes every sale by hand
off the admin email) never learns they tried — and it is logged as a 5xx server
outage, polluting error monitoring.

**Fix (owner's call, one presence guard per deref).** Before each deref, e.g.:
```ts
if (!input.contact || typeof input.contact !== "object")
  throw new AssistedOrderValidationError("contact", "Contact details are required.");
// in validateAddress, before touching input.*:
if (!input || typeof input !== "object")
  throw new AssistedOrderValidationError(field, `${field} is required.`);
// billing branch, when billingSameAsShipping === false:
if (!input.contact.billingAddress)
  throw new AssistedOrderValidationError("contact.billingAddress",
    "A billing address is required when it differs from shipping.");
```

**Reproduction.** `e2e/malformed-submission-5xx.spec.ts` (committed, `it.fails`
tripwires). To watch it fail against current code, drop `.fails` and run
`npx vitest run --config e2e/vitest.config.ts e2e/malformed-submission-5xx.spec.ts`.
When the fix lands, the tripwires go RED — that is the signal to delete the file
and fold the three cases into `submission-validation-negatives.spec.ts` as
ordinary `it`.

---

## ATTACK MATRIX — founder directive coverage

| Attack | Verdict | Where |
|---|---|---|
| price tampering | COVERED | launch-invariants (money server-authoritative) |
| variant swapping | COVERED | launch-invariants (unknown variant 4xx) |
| product ID swapping | COVERED | launch-invariants / acceptance-path |
| action tampering | COVERED | launch-invariants (browser workflowMode discarded) |
| Care direct-order bypass | COVERED | launch-invariants (provider_request stays care) |
| pending-product bypass | COVERED | order-routing-negatives |
| held-product bypass | COVERED | order-routing-negatives (authority refuses) |
| GRP-0422 bypass | COVERED | launch/manual-order-submit-negatives + formulation-hold + reviewed-holds |
| capsule direct-order bypass | COVERED | early-access/customer-pathway.test (research_capsules → not direct) |
| quantity 101+ | COVERED | launch-invariants + new negatives |
| negative/zero quantity | COVERED (new) | submission-validation-negatives |
| affiliate self-verification | COVERED | order-routing-negatives (typed code ≠ verified attribution) |
| duplicate submit | COVERED | acceptance-path |
| rapid double submit | COVERED | acceptance-path (race) |
| replay | COVERED | acceptance-path |
| IDOR | COVERED | launch-invariants (member B ≠ member A; anonymous) |
| notification duplication | COVERED | acceptance-path (exact counts) |
| missing shipping fields | COVERED sub-field / **D1** for missing object | submission-validation-negatives + malformed-submission-5xx |
| agreement bypass | COVERED (new) | submission-validation-negatives |
| wholesale/private price leakage | COVERED | launch-invariants + acceptance-path |

**Reviewed, NOT a defect — cross-member idempotency.** Idempotency is keyed on
`hash(contact.email + idempotencyKey)` and the replay fingerprint covers the
FULL contact block + agreements + lines. A different member can only collapse
onto another's order (and receive its `statusToken`) by already possessing the
victim's complete PII AND their secret idempotency key. Not a practical
disclosure vector; the email-scoped key is the correct design for a flow that
must also serve anonymous early-access customers. No action.

---

## FOR THE INTEGRATOR / OWNERS
- Rebase nothing of mine is required; the two new specs are additive under
  `e2e/` and green.
- s3 / MAIN: D1 is yours. The tripwire file is the acceptance test — flip it to
  plain `it` when you fix `contract.ts`.
- ORDER / CUSTOMER-NOTIF / ADMIN-NOTIF exactly-once: PASS. SECURITY: PASS.
  PRODUCTION MUTATED: NO.
