# UI-002: Private acquisition, referral, monetization, and trust surfaces

**Owner:** CODEX_UI
**Started:** 2026-07-18
**Completed:** 2026-07-18
**Base commit:** `92fa9024b0d74ffa0b16d9cf9bface69dc5de6be`
**Implementation commit:** `b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6`
**Integration head:** `7856966a782d55aef9b1b0f9a1ac570c19c0cb5a`
**Fail-closed correction:** `b33f9a74f653a8c8ee2b0131a310c3480374106d`
**Routes:** `/research/membership`, `/research/membership/compare`, `/research/referrals`, `/research/ambassadors`, `/research/professionals`, `/research/trust`, `/research/how-your-data-is-used`, `/research/blueprint`, `/research/programs`, `/research/invite/:referralCode`, `/research/member/referrals`, and the `/research/apply` success presentation
**Likely files:** Research route registry, layout, shared UI components, new route components, application success presentation, Research-specific styles, the Tailwind entry directive and missing shared primitives in `client/src/index.css`, tests, and documentation
**Shared contracts:** existing Research password gate, noindex behavior, application submission privacy, route ownership, member/referral UI data contracts, global responsive utilities
**Expected completion:** responsive browser QA, screenshots, validation, Claude handoff, and pushed draft PR update

## Explicit exclusions

- Referral-code generation or persistence.
- Referral attribution, qualification, credit, reward, ambassador, or fraud logic.
- Authentication, member identity, membership status, or entitlements.
- Payment, Stripe, monthly or annual billing, and activation accounting.
- Private onboarding or Blueprint data processing.
- Admin controls, analytics, consent persistence, retention jobs, or privacy-request processing.
- Product claims, clinical services, professional referral compensation, and regulated publication approval.

## Implementation rules

- All Research pages remain behind the existing access gate and remain noindexed.
- Never invent a functional referral code after application submission.
- Demo identifiers must be visibly marked preview-only and must never be sent to APIs.
- No private applicant or member information may appear in a QR payload or social card.
- Current versus planned offers and controls must be labeled honestly.
- Use Xenios typography, tokens, 4 px geometry, restrained accents, and original composition.
- Do not copy Superpower's gradient, wording, imagery, or layout.
- Preserve Claude's application and security APIs.

## Acceptance criteria

- Requested routes and invitation UI exist with clear business purposes.
- Membership pricing distinguishes activation, proposed Plus, proposed Blueprint Review, and program ranges.
- Referral UI explains Give $10, Get $15 and the complete qualification boundary.
- Member dashboard remains aggregate-only and renders no person-level status rows.
- The invite landing fails closed until enabled server validation proves authenticity.
- Trust and data-use pages separate commitments, current behavior, and roadmap controls.
- Main and Research responsive defects in scope are repaired and regression-tested.
- Typecheck delta, tests, build, browser console, overflow, keyboard, and reduced-motion results are recorded.

## Acceptance result

- All requested presentation routes and business surfaces are implemented.
- Research remains access-controlled and noindexed.
- No backend, auth, payment, database, admin, or deployment contract was changed.
- Production referral state is aggregate-only and non-shareable without enabled authenticated data.
- Development preview is aggregate-only, visibly non-production, and keeps codes, QR, credits, sharing, and activity disabled.
- 18 tests pass and production build succeeds.
- Final browser pass reports zero overflow and zero console warnings/errors at the tested viewports.
- Typecheck delta is clean; only the pre-existing `server/storage.ts(48,40): TS7006` remains.
