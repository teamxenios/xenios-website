# Xenios platform decisions

## D-001 — One canonical identity
Supabase Auth remains the credential authority. Roles and portal access are server-derived. No separate affiliate, organization, supplier, or Care password database.

## D-002 — One canonical product/variant authority
Product Control and master offerings remain the catalog authority. Persona surfaces receive projections, not copied catalogs.

## D-003 — Visibility is not purchase permission
Provider, classification-pending, held, out-of-stock, and price-pending products can remain visible with truthful actions. They never gain direct commerce merely by being visible.

## D-004 — Organization table collision
The unsent Pack 02 account table is renamed to `public.research_account_organizations`. The existing partner-system `public.research_organizations` remains untouched.

## D-005 — Supplier anti-poaching
Suppliers see only assigned order references, assigned lines, minimum shipping destination, handling/lot/COA requirements, and Xenios relay contact. They do not receive buyer commercial identity, affiliate attribution, customer price, or Xenios margin.

## D-006 — Payment gates downstream effects
Supplier release, payable affiliate commission, and fulfillment notifications require verified payment or an explicitly authorized zero-payment workflow.

## D-007 — Care stays separate from RUO
Provider-only clinical products route through Care. RUO materials remain research-use only.

## D-008 — Progressive releases
A coherent, verified slice ships before the entire future platform is complete. Every release is SHA-pinned, rollbackable, and smoke-tested.

## D-009 — Two-lane build directive (2026-08-17, founder)

Two parallel outputs, defined by the three overlay prompts stored in
`.xenios/prompts/` (`XENIOS_CASHFLOW_FIRST_EXECUTION_OVERLAY_2026-08-17.md`,
`XENIOS_FABLE5_FULL_VISION_END_TO_END_DEMO_PROMPT_2026-08-17.md`,
`XENIOS_REAL_CUSTOMER_BUYING_FULL_SITE_OVERLAY_2026-08-17.md`), executed by
new accounts after `UNIVERSAL_TAKEOVER_PROMPT.md`:

1. REAL PRODUCTION COMMERCE — the company objective. Assisted order live,
   then request-to-quote/order conversion, real cart and checkout, the
   approved payment path, canonical orders, fulfillment and tracking, order
   history and reorder, organization/B2B, affiliates, supplier workspace,
   and Care. Cashflow first. Non-direct products route truthfully
   (quote/pricing/provider/activation/availability) instead of dead-ending.
   Never fabricate payment or provider facts; never show $0 for unknown
   prices; RUO stays research-use only.
2. FULL-VISION DEMO — a parallel validation lane: a production-isolated
   clickable `/research/demo` covering every persona, impossible to activate
   in production, never touching production Supabase, real payments, email,
   SMS, suppliers, or prescriptions. The demo is not the goal, must not slow
   the cashflow lane, and must not fork into a second application: when a
   capability becomes production-ready, the canonical implementation
   replaces its simulation.

Lanes stay disjoint per ACTIVE_TASKS path leases. Phase Zero execution
remains exclusively with the designated production writer.

## D-005: assisted-order acknowledgments are request facts, not legal documents

2026-08-15, founder decision, unblocking the assisted-order mount.

The mount stalled on what looked like an external blocker: the service refuses
every submission unless `deps.legal` supplies a required agreement set, exact
`(kind, version)` matching, and the three kinds the client names had no
approved versions. Treating those three as new legal documents would have
blocked the whole bridge on counsel publishing three new registry entries.

They are not legal documents. They are operational form acknowledgments: facts
about what the customer confirmed while submitting this request.

THE SPLIT, which must not blur:

- CANONICAL LEGAL AGREEMENT: the versioned legal authority. Read from the
  existing immutable legal registry / required-agreements configuration / the
  Early Access agreement gate that already protects Early Access ordering.
  The bridge reuses it. It does NOT get its own legal repository or a second
  acceptance writer.
- FORM ACKNOWLEDGMENTS: request facts, persisted with the request under an
  operational form identity (`assisted_order_form_v1`), carrying acknowledgment
  ids, accepted booleans, timestamps, and a deterministic copy hash.

RULES:

- Do NOT create `assisted_order_accuracy`, `assisted_order_contact_consent` or
  `assisted_order_request_notice` as independent legal-registry entries.
- Do NOT hardcode a legal pair. `early_access_terms / v1` is a HISTORICAL
  checkpoint only; the current authoritative registry wins at runtime.
- Do NOT derive legal authority from client copy. The browser cannot choose a
  legal version, and a stale form version refuses with a refresh-required
  response.
- If the canonical legal set cannot be resolved, `/config` returns
  `enabled: false, code: legal_requirements_unavailable` and submission stays
  closed. The customer is told UP FRONT, not after filling the form.

A conditional RUO acknowledgment applies only when a requested line is labelled
Research Use Only.

Counsel may later publish any of these as documents. That decision is
independent and does not block engineering today.

CONSEQUENCE FOR THE MOUNT: `createAssistedOrderProductionComposition` must gain
a `legal` input and pass it to the service. It currently does not, which is why
the composition as written refuses every submission.
