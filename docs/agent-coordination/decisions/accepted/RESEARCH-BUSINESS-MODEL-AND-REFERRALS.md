# Accepted direction: Research business model and referral UI

**Decision owner:** Samuel
**Recorded by:** CODEX_UI
**Date:** 2026-07-18
**Status:** accepted as product direction; prices and legal terms remain reviewable

## Model

Free application, human approval, $50 activation, Whole-Life Blueprint, optional Plus, programs, eligible products, professional support, retention, and qualified referrals.

## Referral economics

The referral-specific brief controls where sources differ:

- Give the activated new member $10 Xenios credit.
- Give the referring member $15 Xenios credit after qualification.
- Applications alone never earn rewards.
- Credits are not cash and do not apply to clinical services.
- No private application or member information is exposed to a referrer.

## UI and infrastructure boundary

CODEX_UI owns presentation and UI states. CLAUDE_PRIMARY owns codes, attribution, identity, qualification, ledgers, fraud controls, payments, entitlements, admin, analytics, privacy enforcement, and notification infrastructure.

See `docs/research-input/BUSINESS_MODEL_AND_REFERRAL_DIRECTION.md` for the consolidated implementation source.
