# Universal account / partner entry slice — local acceptance only

This is an integration slice, not the final revenue-launch release candidate and not a production-completion claim. ASTRA-A owns release integration, server authority, approval and deployment. The later founder decision to remove paid memberships remains a required follow-on; this checkpoint does not claim that policy change is implemented.

## Scope and authority

- Account navigation reads the existing own-member `/partner/me` projection. It shows a partner workspace only for a validated owned relationship, never from a name, email, cached role, or active-member status.
- The workspace link does not grant earning, referral, organization, payout, or purchase permission. Referral V1 remains the eligibility authority.
- Exact dashboard and referral-links destinations reach their own authentication boundaries without the legacy reviewer password. Other parked partner routes are not opened.
- Partner resources and capability caching isolate exact credentials, loader generations, repeated reloads, sign-out, account switches and unmounts. Prior results are hidden on the first changed-principal render.
- Only the two own-partner GET adapters opt into the known `partner_not_found` 404 denial. Default 404, HTML, unknown code, 501 and 503 behavior remains unavailable.
- Unsupported leads are **Not reported**, not zero. Supported ledger counts can show a measured zero. Commission-chain counts, net recorded commissions and payable-state balance have source-specific definitions; none implies a payment schedule or all purchases.

Coordinator dependencies were adopted byte-for-byte, not reimplemented: `shared/research/auth-return-to.ts` and `server/research/index.ts` from ASTRA-A `edf6de7e5c70b3790e31390c118d4f5150722062`. Their B adoption commits must be skipped when A cherry-picks the client feature.

## Evidence

Node `20.19.0`. Final combined account, recommendation, partner, adapter, API and preview-guard regression run: **422/422 tests across 21 files, exit 0**. Repository `tsc --noEmit`: exit 0. Client/server production build: exit 0, with existing admin import/chunk warnings. Independent review of shell, adapter, API and layout found no blocking defect and separately reran 96 passing tests. The 34 dashboard tests include neutral account-checking presentation during initial restoration and rechecking, with no stale figures or premature sign-in action.

The local browser used the built SPA on loopback port 5221. It used synthetic GoTrue-shaped authentication and fixed synthetic account/partner records, while retaining the actual page gate, research API wall and account route table. The process environment was sanitized before imports and outbound fetches were fenced to that loopback port. No real account, provider, database, email or payment action occurred.

Observed browser checks:

- Normal synthetic sign-in restored `/research/account/orders`; refresh retained the session.
- Partner A navigated from its owned account to the dashboard: two commission chains, $70 net and $20 payable, with leads not reported.
- A signed-out dashboard visit offered normal sign-in with the exact dashboard return path, not the review password.
- Partner B signed in through that path and saw its own measured-empty ledger, with none of Partner A's $70 balance.
- Customer A had normal account navigation but no partner-workspace entry. A direct dashboard visit displayed the explicit missing owned relationship, without previous-partner figures.
- Org A saw its own organization-partner relationship and training-pending facts, no activation/earning assertion, and account support rather than an unpublished training action. Its settled refresh restored the same dashboard.
- Partner dashboard document width stayed within the viewport at 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320 pixels. The 390-pixel screenshot was visually readable. The wide ledger table uses a contained horizontal scroll area.

The preview's 14 guard tests cover invalid authentication, own GET/HEAD reads, foreign selector refusal, Partner A/B/Org separation, unsupported methods, and production-mode refusal. Preview fixture responses are not evidence that a live account exists or that production data sources are available.

## Still required

Paid-membership removal, reusable approval/claim implementation, live email ownership, canonical production account/partner binding, any authorized invitation, complete Referral V1 browser acceptance, purchase/payment/fulfillment proof, integrated release QA and exact-SHA founder approval remain separate requirements. The preview intentionally does not implement referral-link writes, purchases or payouts. Missing backend capability must not be treated as a confirmed absent relationship; ASTRA-A is correcting that backend composition independently.

No deployment, price activation, production migration/configuration change, real communication, purchase or shipment is authorized by this checkpoint.
