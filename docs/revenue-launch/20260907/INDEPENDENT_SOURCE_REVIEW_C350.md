# Independent source review at c350ab1

Recorded 2026-09-08T03:27:15.065Z. Application: `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`; tree `314ef445a6e3be8420a77451ed182088419d59ec`. This is a bounded static review of the current implementation. It does not turn old tests into new qualification, approve production, or waive privacy, endpoint, adapter or browser gaps.

## B review of A-authored corrections

ASTRA-B, task `01a04df5-16b2-79d3-8fbd-c4f5cf1e9a35`, returned acceptance with no new finding for:

- **9b5e61b Resources admission:** exact library GET/HEAD and canonical UUID download admission, exact Resources layout exemption and allowlisted return path. Downstream member/partner entitlement checks remain. No write-method or broad-prefix admission was found.
- **8f779d5 stale cards:** cached cards clear on principal change and terminal states other than loading/ok; cache refresh occurs only on ok. Loading does not revive a cache already cleared by a terminal failure.
- **50180131951b5abc959a58957bcc86d6b16db3c1 account downloads:** exact safe account-document path, same-origin credentials, no redirect, bearer and AbortSignal, session checks around response/blob/click, and object-URL cleanup. The hook scopes requests to token and mount, aborts on cleanup, replaces only same-path requests and permits different documents concurrently. The document view checks its own mounted/request identity and discards cancellation. Existing 19 focused tests were inspected as evidence, not rerun by B in this review.

B performed no new heavy test, database action or production operation for these acceptances. The source and fixture rebind acceptances and separate ownership artifact retain their own earlier receipts.

## A review of B-authored behavior

A independently inspected the implemented control paths and related parsers, rather than using ownership counts as a code review. No additional blocking logic finding was identified in the bounded areas below; this is not a claim that every rendered state or integration adapter was exercised.

| Area | Substantive checks | Remaining limit |
| --- | --- | --- |
| Account order detail | Exact reference lookup within the account projection; malformed/duplicate references fail closed; definitive absence requires complete source/count evidence; payment and fulfillment stay separate; tracking requires a shipment state and safe HTTPS URL. | Current real-account persistence and delivery were not exercised. |
| Member orders and claims | Token/order-keyed component lifetime; request-generation checks; response order identity and line/claim validation; unknown claims remain unknown; uncertain submissions retain the hold and are not automatically replayed; refresh respects the pending claim hold. | No production issue report, refund, replacement or shipment was submitted. |
| Partner aggregate, financial and security reports | Token-keyed private components plus shared request-lifecycle isolation; malformed contracts fail closed; exact aggregate fields reject identifying extras; missing counts remain distinct from zero; signed safe-integer commission cents remain in the affiliate ledger; payout views add no payment operation; identity/training/session markers do not grant permissions. | This does not qualify every live role or prove complete financial/security history. |
| Campaign, event and compliance requests | Token-keyed drafts, synchronous request locks, generation checks, refusal to automatically retry uncertain results, retained drafts, and success wording that does not invent a durable receipt or approval. Draft links remain POST data, not fetched navigation. | Existing unavailable intake routes remain unavailable; no operational intake claim. |
| Organizations and support | Organization records are validated and requests remain within the existing adapter; a late old-account result cannot populate the new token-keyed form. Static support links require an explicit user action and do not claim to create a ticket or send email. | Mobile layout qualification remains open; no request/email action performed. |
| QR and print | Existing URL/lifecycle validation, current canonical reread before export, expiration checks and generation cancellation; QR SVG is generated locally from validated modules and object URLs are cleaned up. | SVG does not satisfy the requested PNG export; dashboard share card remains absent. |

Inspected source includes account-portal order-journey and OrderDetailView; member Orders, OrderDetail and member-orders parsers; partner Leads, Conversions, Commissions, Payouts, Organizations, Campaigns, Events, Compliance, Onboarding, Training, Security, Support and shared loading logic; the corresponding partner-crm readers; Links, qr-export and RecommendationPrintCard. A-authored document/session changes were sent to B instead of self-approved. The partner production port has only a comment difference from live ff3c496; the approved identity, durable-state and money handling remains executable-source identical.

## Findings and gates retained

1. QR exports SVG only. The required downloadable PNG is not implemented.
2. The partner dashboard does not contain the requested prominent share/code/link/QR card. Navigation to Links is not that card.
3. Fable reports Training overflow at 320/360 pixels and Support overflow. These remain recorded findings, not a passed broader browser matrix.
4. Hub browser evidence is local synthetic Auth/memory evidence. It does not prove real-account switching or enabled production Storage/PostgREST behavior.
5. The final c350 full suite passed 15,997 tests with 59 skipped and zero failures; prior timeout failures remain failed. The strict PII gate remains open: V3 source-document identities are missing and V2 is partial/unapproved. The original 27 SAME / 3 REGRESSION endpoint result remains failed, with a separate independently accepted controlled comparison establishing the environment mismatch and 30 matching baseline/candidate responses. See the current qualification report for these later results.

These limits prevent a claim of a completed Xenios Health platform. Proposed deployment and feature activation remain separate and require new applicable exact-SHA authorization after qualification.
