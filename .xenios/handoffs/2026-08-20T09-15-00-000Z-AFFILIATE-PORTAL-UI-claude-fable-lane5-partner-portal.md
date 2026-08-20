# Handoff: affiliate portal + dashboard (Fable session 5)

- **Session**: `claude-fable-lane5-partner-portal`
- **Lane**: launch-affiliate-portal (UI + partner lifecycle only)
- **Branch**: `lane/affiliate-partner-portal`
- **Worktree**: `C:/xenios-wt/lane5-partner-portal`
- **Base**: `5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8`
- **Exact SHA**: `6d4262580f7f6f991819c65bdb86cf25bdec2c3f`
- **Integrates under**: `AFFILIATE-PRODUCTION` (owner `claude-fable-desktop` — this
  session did NOT change that task's board state)
- **Not pushed**: no remote push was made from this session. The branch and SHA
  are local to the shared repository; the lead decides when it goes up.

## What this is

An approved affiliate can now see their real position in the lifecycle and copy
the one thing they need to start working: their link and code. Everything
rendered is a fact the server stated.

## What changed

| File | Change |
|---|---|
| `client/src/research/adapters/partner.ts` | Adds the live `GET /api/research/partner/me` binding and `PartnerSelfDto`, mirrored from the server's `toPartnerSelfDto`. |
| `client/src/research/pages/partners/lifecycle.tsx` | **New.** The lifecycle stepper and its exception notices. |
| `client/src/research/pages/partners/Onboarding.tsx` | Leads with the live "Where you stand" section. |
| `client/src/research/pages/partners/Dashboard.tsx` | Referral link/code panel with copy actions; not-yet-active partners are pointed at onboarding. |
| `client/src/research/pages/partners/{lifecycle,onboarding,dashboard}.test.tsx` | **New.** Focused UI tests. |
| `client/src/research/adapters/partner.test.ts` | Adds the `/partner/me` path + bearer assertion. |
| `server/research/partners/portal-routes.test.ts` | One-line `COMMERCE_OWNED` addition — see "cross-lane touch" below. |

## The one endpoint that was already live and unbound

`GET /api/research/partner/me` has been served by the commerce lane since G8
(`server/research/commerce/routes.ts:576`) but no client code called it. It is
the only published surface that states a partner's own lifecycle position, so
the portal had no way to tell an applicant from an active rep. The adapter now
binds it. **No new server route was added by this session.**

## Cross-lane touch (needs the lead's eye)

`server/research/partners/portal-routes.test.ts` is under
`server/research/partners/**`, which belongs to `AFFILIATE-PRODUCTION`. The
change is **one line in a test file**: `/api/research/partner/me` added to the
`COMMERCE_OWNED` set.

It is required, not cosmetic. That test asserts every path in the client's
`PARTNER_API` is served by *some* registered route. Binding `/partner/me` in the
adapter without declaring it commerce-owned makes an existing, correct invariant
fail. The line states a fact that has been true since G8. No production code in
that directory was touched.

## Truthfulness rules held

- The stepper's order mirrors the server's real gate chain
  (`partners.ts` `nextPendingState`): application → identity → tax/payout
  clearance → agreement → training/certification → active.
- `quality_review`, `suspended`, `terminated` are **not** positions on the path.
  They render as their own notice, never as progress.
- A certified partner awaiting admin activation reads
  "Certified — awaiting activation". Certification is never rounded up to active.
- No link from the server renders the honest "issued after certification" card.
  No referral link, code, or QR is ever fabricated.
- No metric is invented. Every unavailable endpoint keeps its existing pending
  state. No shipping address, supplier cost, Xenios margin, or member identity
  appears anywhere in the partner family.
- An unknown `PartnerState` renders verbatim rather than being assigned a guessed
  position.

## Explicitly not done (per lane boundaries)

No `server/index.ts` edit. No commission math. No payment mutation. No deploy.
No email. No PII exposure. No attribution authority — that stays with
`claude-fable-lane4-affiliate`.

## Verification at this SHA

```
npx vitest run client/src/research/pages/partners      -> 4 files, 20 tests passed
npx vitest run client/src/research/adapters/partner.test.ts \
               server/research/partners/portal-routes.test.ts
                                                       -> 2 files, 65 tests passed
npx tsc --noEmit                                       -> clean
```

Not run: the full suite, and any browser/E2E pass. The lane worktree borrows
`node_modules` from `C:/xenios-wt/general-platform` via a directory junction
(manifests are identical between `5bb3fa9` and integration HEAD).

## Still open for this lane

- The compliance/resources section is the pre-existing static content; it was not
  reworked. Mobile layout rides on the existing `.ra-subnav` scroll rules and the
  `auto-fit` card grids, which already handle narrow widths — no new breakpoint
  was added and none was verified in a real browser this session.
- Clicks are not shown anywhere: no published endpoint reports them. Deliberately
  absent rather than faked.
- The agreement is presented for review but acceptance is not capturable from the
  portal — no write endpoint exists for it yet.
