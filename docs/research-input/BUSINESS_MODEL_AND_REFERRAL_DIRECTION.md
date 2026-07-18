# Xenios Research Business Model and Referral Direction

**Source owner:** Samuel
**Received:** 2026-07-18
**Status:** implementation direction for CODEX_UI; pricing, legal terms, and infrastructure remain subject to owner review

## Positioning

Xenios Research is not only a website or a product catalog. It is a private member acquisition, activation, retention, referral, monetization, and trust system.

Primary positioning:

> A private whole-life health membership that helps people organize their goals, environment, routines, information, and trusted support into one coherent system.

Products, programs, supplements, Quantum, professional support, and Research Guides sit inside that system. They must not make the experience feel like a peptide storefront.

## Economic journey

```text
Free application
→ human approval
→ $50 one-time activation
→ Whole-Life Blueprint
→ optional Plus membership
→ programs, eligible products, and professional support
→ progress and retention
→ qualified referrals
```

The $50 activation creates the initial member relationship and should cover a scalable first experience:

- Member account.
- Deep whole-life onboarding.
- AI-generated draft Whole-Life Blueprint.
- Basic human quality review.
- Research Guide and member education access.
- Member-only product access where appropriate.
- Member pricing and referral-program access.
- Initial habits, tracking, questions, and professional-conversation prompts.

It must not promise hours of manual plan construction for every $50 activation.

## Offer ladder

| Offer | Direction | Status |
|---|---|---|
| Application | Free | Current contract |
| Activation | $50 one-time after approval | Current contract; payments still Claude-owned |
| Xenios Plus | Test $39 monthly or $390 annually | Proposed pricing, not available for purchase |
| Human Blueprint Review | Test $199 to $399 one-time | Proposed pricing, not available for purchase |
| Premium programs | Potential $299 to $999 | Directional range, not a live price claim |
| Professional membership | Potential $149 to $299 monthly | Directional range, requires operating and legal structure |

Public UI must distinguish current offers from planned or proposed pricing. No unavailable purchase action may look operational.

## Funnel purposes

| Surface | Primary purpose |
|---|---|
| Research Guides | Discovery, education, trust, and qualified application intent |
| Membership | Explain fit, review, activation, benefits, limits, and objections |
| Application | Capture qualified demand without excessive sensitive data |
| Blueprint | Make the member outcome tangible and whole-life |
| Programs and products | Present the next logical step after context, not disconnected catalogs |
| Trust and data-use pages | Make privacy, separation, and responsible AI use visible |
| Referrals | Build a qualified acquisition loop without exposing applicant information |

## Approval principles

Approval should feel selective but never arbitrary. Current UI may explain that decisions consider age, completeness, truthfulness, educational scope, fit, terms, safety boundaries, and misuse or resale concerns. Backend decision reasons, auditability, and workflow remain Claude-owned.

## Member referral program

The repeated, referral-specific direction supersedes the broader memo where the reward differs.

Initial offer:

> Give $10. Get $15.

- The new member receives $10 Xenios credit after approval and activation.
- The referring member receives $15 Xenios credit after the referred member activates and passes the verification period.
- Applications alone never earn a reward.
- Credits are not cash and cannot apply to clinical services.
- Self-referrals, refunded transactions, disputed transactions, and reviewed abuse do not qualify.
- A referrer sees only privacy-safe states: Invited, Pending, Qualified, Reward earned, or Expired.
- A referrer never sees application answers, approval or decline reasons, health interests, Blueprint data, review notes, purchases, or private member information.

Qualification journey:

```text
Referral link used
→ application completed
→ independent approval
→ $50 activation
→ refund or verification period passed
→ referral qualified
```

Potential milestones are directional and must not be represented as earned entitlements until the ledger exists:

- 1 activated referral: $15 member credit.
- 2 activated referrals: $40 total member credit or early program access.
- 5 activated referrals: complimentary Blueprint refresh.
- 10 activated referrals: Founding Ambassador review.

## Invitation experience

Two card states are required:

### Applicant invitation

- Application received.
- Review remains independent.
- No payment required unless approved and activated.
- Invite two people who take their health, performance, and future seriously.
- No unique referral code should be invented client-side. If the backend has not issued one, the UI must show a safe pending state.

### Active member invitation

- Active Research member.
- Member since date and member ID may appear only when supplied by an authenticated member contract.
- No health information, application status, or other sensitive data may appear in the card or QR payload.

Preferred message:

> A better life is built through better systems.

The card should use a Xenios identity: black, warm white, graphite, silver, one controlled accent, editorial type, a clean QR code, subtle scientific texture, and unique reference treatment. It must not copy Superpower's gradient, layout, wording, or imagery.

## Referral routes

- `/research/referrals`: program explanation and qualification rules.
- `/research/invite/:referralCode`: invitation landing page; invitation never guarantees approval.
- `/research/member/referrals`: authenticated member dashboard UI contract.
- Post-application success: safe invitation moment, with a pending state until a real code is issued.

## Ambassador boundary

Ambassadors are a separately approved program for creators, coaches, athletes, trainers, barbers, and community leaders. Directional commission is 10 to 15 percent of eligible non-clinical net revenue, subject to terms, refunds, chargebacks, holding periods, disclosure requirements, and claim restrictions.

Compensated relationships and truthful endorsement requirements must be disclosed clearly. Member referrals, affiliate marketing, professional partnerships, and clinical referrals are separate programs.

## Professional boundary

Do not promise percentage compensation to physicians, clinics, or healthcare professionals for clinical referrals. Public UI should describe education, software, wholesale, fixed legitimate services, and separately structured partnerships, with healthcare counsel review where required.

## Privacy promise

Preferred public promise:

> Your information exists to serve your Blueprint, not an advertising profile.

The UI may state intended principles and current product boundaries. It must not claim unimplemented security or privacy controls as operational.

Logical data areas:

- Identity.
- Application.
- Whole-life onboarding.
- Membership and payment.
- Referral attribution.
- Marketing consent.
- Product and order history.
- Professional or clinical information.

Referral partners and marketing tools must not receive whole-life onboarding answers or private applicant status.

## Private launch decision

Keep the entire Research surface access-controlled and noindexed while membership billing, applicant access, referral accounting, privacy controls, and Blueprint workflow are incomplete. This resolves the immediate public stealth-copy conflict without approving regulated product content for public launch.

## CODEX_UI scope

- Public-facing presentation inside the current private Research gate.
- Membership comparison, referrals, ambassadors, professionals, trust, data-use, Blueprint, and programs routes.
- Xenios invitation card, QR presentation, mobile share controls, invite landing, dashboard UI states, and post-application moment.
- Responsive layout, accessibility, CTA hierarchy, content clarity, and preview screenshots.

## CLAUDE_PRIMARY scope

- Referral codes and attribution.
- Qualification and anti-fraud rules.
- Credit and ambassador ledgers.
- Member identity, status, and entitlements.
- Billing and activation.
- Rewards, expiration, admin controls, privacy workflow, analytics, and notifications.

CODEX_UI will not simulate those systems as if they are live.
