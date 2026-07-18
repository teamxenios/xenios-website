# Handoff: UI-002 member acquisition and referral presentation

**From:** CODEX_UI
**To:** CLAUDE_PRIMARY
**Date:** 2026-07-18T15:40:45-05:00
**Implementation commit:** `b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6`
**Integration head:** `7856966a782d55aef9b1b0f9a1ac570c19c0cb5a`
**Contract reconciliation:** `970d153d2499f6838c75471a487f58687fe0fc52`
**Draft PR:** #13 into `main`
**State:** review and backend contract requested

## What changed

- Added responsive public presentation for membership comparison, Blueprint, programs, referrals, invite landing, member referral workspace, professionals, ambassadors, trust, and data use.
- Added an original code-native xenios Member Passport with a valid QR and applicant/member variants.
- Added copy, SMS, WhatsApp, X, email, and native-share actions for validated public invitation URLs.
- Added `/research/apply?ref=CODE` prefill and a post-success referral moment without changing the submission API.
- Repaired Tailwind v4 responsive generation, missing shared rules, focus treatment, and 320 px header containment.
- Added `shared/research/referral-ui.ts` and four tests.

## Initial proposed contract

The following was Codex's initial proposal before Claude published `shared/research/referral-types.ts`:

Authenticated member response:

```ts
type ReferralWorkspace = {
  code: string;
  invitationUrl: string;
  reference: string;
  issuedAt: string;
  memberSince: string;
  totals: {
    invited: number;
    pending: number;
    qualified: number;
    creditAvailableCents: number;
  };
  activity: Array<{
    label: string;
    status: "Invited" | "Pending" | "Qualified" | "Reward earned" | "Expired";
    updatedLabel: string;
  }>;
};
```

Public invite response:

```ts
type PublicInvitation = {
  valid: boolean;
  code?: string;
  expiresAt?: string;
};
```

The public response must not include the referrer's private profile. The member response must not include the applicant's name, email, phone, application answers, health data, approval reason, or decline reason. Labels should be coarse, such as `Invitation 04`, unless the invited person separately consents to identification.

## Reconciliation with Claude commit `3adfade`

Codex read Claude's clean `research-referral-foundation` branch and `shared/research/referral-types.ts` after the integration lane joined. The published backend contract is authoritative once merged:

- `ReferralDashboardState` exposes only aggregate `visits`, `applications`, `qualified`, `creditAvailableCents`, and `creditPendingCents`.
- All referral feature flags default false.
- The first production wiring must use that aggregate contract and render no individual activity rows.
- `REFERRAL_SAFE_STATUSES` in the Codex branch is a presentation vocabulary for the development-only prototype, not a backend enum.
- Expanding production activity beyond aggregates requires a new shared-contract decision and privacy review.
- The referral page now labels Give $10, Get $15 as proposed and inactive until the flags, ledger, identity, and fraud controls are enabled.

## Qualification and ledger requirements

- Attribute the invitation before application submission and preserve it server-side.
- Independent approval must remain unaffected by referral participation.
- Qualify only after the referred person pays the $50 activation and passes the verification period.
- Exclude self-referrals, duplicates, refunds, disputes, abuse, and other documented disqualifiers.
- Credit the new member $10 and referrer $15 through an auditable, idempotent ledger.
- Define expiry and reversal behavior before production launch.
- Keep member referrals, ambassadors, professional partnerships, and clinical arrangements separate.

## Review requests

1. Review `client/src/index.css` and `client/src/components/Navbar.tsx` before any parallel shared-CSS edit.
2. Treat the merged `shared/research/referral-types.ts` shape as authoritative for initial wiring.
3. Preserve the empty/disabled production default until authenticated data is available.
4. Update `docs/agent-coordination/status/CLAUDE_PRIMARY.md` and add a handoff before implementation.
5. Let Codex review public UX after the backend contract is connected.

## Validation evidence

- 16 of 16 tests passed.
- Production build passed.
- Typecheck found only pre-existing `server/storage.ts(48,40): TS7006`.
- No final browser console warnings/errors.
- No overflow at 320, 390, 640, 768, or 1440 on the checked routes.
- Production member workspace: zero rows, no QR, six disabled share actions.
- Preview workspace: five safe statuses and no private decision reason.

## Production blocker

The integration/QA lane independently rechecked `https://xeniostechnology.com/research` at 2026-07-18 15:42 CDT. It returned HTTP 503 with body `The research section is not configured.` This UI branch has not been deployed and does not fix or claim to fix the production gate. Deployment and environment configuration require a separate owner and validation cycle.
