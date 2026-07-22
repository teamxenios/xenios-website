---
title: Supplier verification handoff to the integration coordinator
from: Supplier verification intake session (branch claude/research-supplier-verification-intake)
to: Integration coordinator (branch integration/xenios-research-full-production-launch) and Samuel Boadu
date: 2026-07-21
---

# Supplier verification handoff

The revised signed supplier package was received and processed. This branch adds
the supplier-verification record set. It does not touch server code, migrations,
or the integration branch, so it can be folded into the release cleanly.

## Headline

The signed supplier master is real, executed, and now the source of record for
product facts and member-facing prices. It corrected the legacy catalog
substantially. But the launch cannot proceed to any purchasable SKU, for reasons
outside code:

1. **No supporting attachments were delivered.** All roughly 61 referenced
   documents (specs, 16 COAs, storage, shelf-life, shipping, and the price
   schedule) are `referenced_not_found`. The signed PDF claims secure-channel
   delivery, but the document's own COA rule and final certification concede the
   COAs must still be delivered, and the filesystem confirms none arrived.
2. **No payment provider is configured.**
3. **No SKU has been released** and product commerce is intentionally off.

So purchase eligibility is 0 of 15. The catalog can show the products with
correct, signed facts and prices as not-purchasable, which is the state the
system was built for.

## What this branch adds (all additive, no conflicts expected)

- `docs/research-commerce/SIGNED_SUPPLIER_MASTER_INTAKE.md`
- `docs/research-commerce/SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md`
- `docs/research-commerce/SUPPLIER_FACT_RECONCILIATION_FINAL.md` (supersedes the pre-signature `SUPPLIER_FACT_RECONCILIATION.md`)
- `docs/research-commerce/PURCHASE_ELIGIBILITY_FINAL.md`
- `docs/research-commerce/signed-supplier-master-facts.json` (the deterministic, idempotent, append-only import)
- `docs/research-launch/FULL_PRODUCTION_MIGRATION_MANIFEST.md` and `docs/research-launch/PROVIDER_READINESS.md` (dry-run inventories)

## For the catalog owner (content lane / commerce lane)

The signed master corrects strengths for 10 of 15 SKUs and prices for all 15.
The import file carries every prior value and a conflict note, so nothing is
lost. Two things need a human decision, not a silent rewrite:

1. Several legacy slugs encode a now-corrected strength (`tesamorelin-10mg` is
   5 mg, `nad-plus-500mg` is 100 mg, `epitalon-10mg` is 5 mg, and others).
   Keep the slug stable and correct the displayed strength, or mint a new slug
   with a redirect.
2. Epithalon is canonical; keep Epitalon as an alias.

The import updates catalog facts to `confirmed_by_signed_supplier_master` or
`corrected_by_supplier`. It must not flip any product to purchasable. That still
requires the delivered COA, a verified lot, real inventory, a payment provider,
the feature flag, and an explicit admin release, per SKU.

## What Samuel needs to do to unblock commerce

1. Deliver the actual COA files (and the specs, storage, shelf-life, shipping,
   and price schedule) through the approved secure channel, each named to match
   its Appendix B identifier, into the matching secure intake subfolder.
2. Provide the payment provider credentials when the code, migrations, and tests
   are ready (see the provider readiness report; never paste secrets into chat).
3. Release each SKU explicitly once its gates pass.

Nothing here weakens any control. The system stays safe and private in the
meantime.
