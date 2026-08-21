# P0-G — browser proof of the manual order intake path

Session `claude-fable-s9-conversion-qa`, 2026-08-21.
Base: origin/xenios/launch-integration-20260819.
Production mutated: NO. No real email sent. Local stack only.

**The founder's P0 flow completes end to end in a real browser, on a 320px
viewport.** Reference produced: `XRR-20260821-9E608740FD`, one line, $33.50.

This is the first end-to-end browser run in the fleet. It was blocked for most
of the day by the absence of a credentialled environment; that is now solved on
this machine and the rebuild is scripted, so it is repeatable.

## What was actually observed

| Founder requirement | Observed |
|---|---|
| full canonical catalog | renders, with live Family / Channel / Action filters populated from real data |
| retail pricing | real prices render: BPC-157 5 mg **$33.50**, and $49.00 / $79.00 / $99.00 / $167.50 / $181.25 / $300.00 elsewhere |
| search | works; narrowing to "BPC-157 5 mg" returns the exact row |
| product / variant | exact variant carried through to the line |
| quantity | quantity carried; 1 × $33.50 |
| optional affiliate code | field present and accepted ("Affiliate code, optional") |
| customer info | full legal name, email, mobile phone |
| shipping info | line 1, line 2, city, region, postal code, country code |
| agreements | rendered and accepted, including the RUO and order-request acknowledgments |
| submit | HTTP 201 |
| order reference | `XRR-20260821-9E608740FD` |
| customer email | exactly one enqueued |
| admin email | exactly one enqueued |
| mobile | 430 / 390 / 375 / 360 / 320 all clean |

## The durable record the founder will work from

    reference    XRR-20260821-9E608740FD
    status       submitted
    total        $33.50
    customer     Sona QA Nine, s9-qa@example.test, +1 512 555 0109
    shipping     123 Test Bench Rd, Austin, TX 78701
    line         BPC-157 / BPC-157 5 mg / qty 1 / unit 3350 / line 3350
    pathway      direct_order_request
    verified affiliate attribution   NULL

The typed code did not become verified attribution, which is the correct
separation.

## Notification behaviour under a dead email provider

Both notifications were enqueued durably and marked `failed_retryable` because
this environment has no email provider — and the order still persisted with a
201. Email failure does not cost the customer their order, observed rather than
argued.

## Mobile

No horizontal overflow at any of 430 / 390 / 375 / 360 / 320. At every width the
action buttons were on screen, none under 32px tall, and every form input
computed to at least 16px, so iOS will not zoom on focus. The order was
submitted at **320px**, the narrowest target.

Worth noting: the 14.4px input problem reported on 2026-08-20 was in the
standalone assisted-order wizard. On this converged storefront path the inputs
are compliant.

## Findings

### 1. GRP-0422 is not visible at all — the one row the founder requires to be visible

The founder's rule: GRP-0422 (CJC-1295 + Ipamorelin WITH DAC, 5 mg total, $99)
must be VISIBLE, retail priced, Request Order, never direct.

Observed: it does not render, because it is not in the dataset the storefront
reads. Verified independently of any environment:

    member-safe-master-offerings.generated.json
      offerings 420, variants 420
      WITH-DAC + Ipamorelin offerings: 0

The founder's canonical count is 424 variants, so the committed artifact is four
short and GRP-0422 is among the missing. A customer searching "Ipamorelin" gets
eight rows, none of them the held combination.

This is a data/artifact gap, not frontend code — per the sprint rule, it must not
be patched in the client. It likely needs the artifact regenerated after the
reconciliation. Owner: whoever owns the catalog artifact build (s7 / lead).

### 2. Agreement identity is hardcoded on the client and configured on the server

The client POSTs a hardcoded pair, `{kind: "early_access_terms", version: "v1"}`
(`client/src/research/adapters/earlyAccessAgreement.ts:33`), while the server
requires whatever `RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS` names. When they
disagree the customer ticks the Research Use Policy, presses Accept and
continue, and receives `400 AGREEMENT_NOT_REQUIRED` with no way forward.

Captured off the wire in this run before the environment was aligned. In this
case the mismatch was this lane's own env value, so it is not proof of a live
production defect — but the hazard is real, silent, config-dependent, and sits
directly on the P0 path between catalog and submit. **Check the production value
of that variable against the hardcoded pair before the RC.**

It is the same shape as the assisted-order form-acknowledgments P0 reported on
2026-08-20: one side hardcodes what it presents, the other configures what it
requires, and nothing reconciles them.

### 3. Featured products fails to load — and says so honestly

"We could not load the research catalogue just now. This is a fault on our side,
not an empty catalogue. Nothing has been ordered or charged."

Almost certainly this environment lacking the featured/release data rather than
a defect. Recorded because the failure copy is exactly right: it distinguishes
"cannot reach" from "nothing to sell", which is the distinction that matters.

### 4. Confirmed fixed since 2026-08-20

The order-request form acknowledgments now render and submit successfully, so
the P0 that made submission unsatisfiable from the UI is closed on this head.

## Not concluded, deliberately

Everything WITH DAC showed "Price pending" here because this environment seeds
prices for only 18 products. **No conclusion should be drawn about whether
WITH DAC 2 mg / 5 mg route to direct purchase** — that needs an environment with
the full price set. Same for Hexarelin 5 mg and Oxytocin 10 mg, whose price is
still with the founder; each appears exactly once in the artifact, so no
duplicate pair was observed.

## Reproducing this environment

Docker Desktop, then `supabase start` in the worktree with `supabase/migrations`
moved aside, then apply this lane's scripts: schema slice, assisted-order RPCs,
Early Access session and identity RPCs, catalog seed, grants, an active member,
an APPROVED `research_early_access_customers` row, and a
`research_early_access_session_bindings` row for the minted session. Dev server
env needs both gate passwords, the EA password hash and session secret, the
owner id `00000000-0000-4000-8000-000000000001`, the assisted-order bridge flag
and admin email, master-offerings enabled with founder-admin-only off, and a
required-agreements value matching the client pair.
