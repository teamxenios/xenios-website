# UI-002 Implementation Review

**Implementation:** `b72e6d1`
**Integration head:** `7856966`
**Contract reconciliation:** `970d153`
**Draft PR:** #13

## Outcome

The UI now presents Research as a coherent member system rather than a disconnected catalog. The path is application, independent approval, $50 activation, Whole-Life Blueprint, optional support, programs, trusted pathways, and qualified referrals.

The referral experience is original xenios work. It uses a graphite and warm-white passport, a restrained purple accent, a scientific grid, a real QR, explicit privacy language, and semantic DOM content. It does not reuse the supplied Superpower gradient, wording, imagery, or layout.

## Honest-state design

- $50 is a one-time activation, not a recurring membership promise.
- Plus, Human Blueprint Review, and premium program ranges are labeled proposed and unavailable for checkout.
- Give $10, Get $15 qualifies only after approval, activation, and verification.
- Referral credits are explicitly proposed and inactive while Claude's feature flags remain false.
- Invitations never guarantee approval or reveal decision reasoning.
- Production referral UI does not fabricate a code, QR, activity, or reward.
- Initial production dashboard wiring is aggregate-only; individual safe-status rows remain a development prototype unless the shared privacy contract expands.
- Security, HIPAA, ambassador, professional, and clinical claims are limited to verified current facts or explicitly labeled roadmap work.

## Route evidence

| Surface | Evidence |
|---|---|
| Referral program | `docs/research-design/previews/ui-002/referrals--390x844.png` |
| Member Passport | `docs/research-design/previews/ui-002/referral-passport--390x844.png` |
| Invite landing | `docs/research-design/previews/ui-002/invite--390x844.png` |
| Membership comparison | `docs/research-design/previews/ui-002/membership-compare--390x844.png` |

## Regulatory source boundary

The presentation links directly to current primary guidance used to frame review requirements:

- FTC endorsement and health-products guidance: <https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews> and <https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance>
- HHS OIG physician fraud-and-abuse overview: <https://oig.hhs.gov/compliance/physician-education/fraud-abuse-laws/>
- Texas Data Privacy and Security Act overview: <https://www.texasattorneygeneral.gov/es/node/259071>

These links inform cautious presentation language. They are not a legal opinion or production approval.

## Validation

- Node 20.19.0 and npm 10.8.2.
- 2 test files, 16 tests passed.
- Production client and server build passed.
- One pre-existing TypeScript error remains in `server/storage.ts`.
- Final console warnings/errors: zero.
- Checked page overflow: zero at 320, 390, 640, 768, and 1440 on the route matrix.
- Research remains gated and noindexed.

## Production status

The validation above is local. The integration/QA lane independently rechecked `https://xeniostechnology.com/research` at 2026-07-18 15:42 CDT and received HTTP 503 with `The research section is not configured.` UI-002 has not been deployed and makes no claim that the live gate is fixed.
