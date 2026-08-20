# CARE-DISCOVERY-BRIDGE handoff

- Session: `codex-care-discovery-20260820`
- Task: `CARE-DISCOVERY-BRIDGE`
- Branch: `codex/care-discovery-bridge-20260820`
- Worktree: `C:\\xenios-wt\\codex-care-discovery-20260820`
- Base SHA: `7f511bbe50702b249e2fb384b3785becce7c1ce0`
- Final pushed SHA: `64c9da533132be871018cd2b88e47af59d36bf2e`
- Production mutation: **NO**
- Migrations, flags, environment changes, email, payment, and shipment actions: **NONE**

## Delivered

- Added an authenticated `POST /api/care/discovery` contract with an exact `{ consent: true }` request body.
- The server authors the subject identity and consent timestamp; browser-authored identity, timestamps, commerce fields, clinical fields, activation, and redirect targets are rejected.
- The response is metadata-only and routes to the fixed internal path `/care/eligibility`.
- The endpoint intentionally works while the Care capability is disabled and does not persist, audit, activate, or create a Care workflow.
- Added `/care/discovery` UI inside the existing Care section with explicit checkbox consent, no request on initial render, truthful 401/503/failure states, and closed-path success navigation.
- Copy maintains the Research/Care boundary and makes no treatment, availability, prescription, or durable-storage promise.

## Changed files

- `client/src/care/CareDiscoveryPage.tsx`
- `client/src/care/discovery-api.ts`
- `client/src/care/discovery-api.test.ts`
- `client/src/care/discovery-ui.test.tsx`
- `client/src/care/section.tsx`
- `server/care/index.ts`
- `server/care/discovery.test.ts`
- `shared/care/contracts.ts`
- `shared/care/contracts.test.ts`

## Verification

- `npx vitest run server/care client/src/care shared/care --pool=threads` — 39 files / 371 tests passed.
- `npm run check` — passed.
- `npm run verify:route-uniqueness` — passed; 396 registrations / 387 call sites.
- `npm run build` — passed; existing unrelated AdminResearchHome static/dynamic import warning only.
- `git diff --cached --check` — passed before commit.
- Remote branch verified at the exact final SHA; worktree is clean.

## Lead-owned integration follow-ups

1. Update the release-control-plane census assertions from 395/386 to 396/387 in `server/release-control-plane.test.ts`. That file is lead-owned and was deliberately not edited.
2. Route the Research storefront Care intent to `/care/discovery` by updating the current `CARE_HREF = "/research/access-hub"` seam in `client/src/research/storefront/entry-intent.ts` and its tests. Those Research storefront paths are owned by another active lane and were deliberately not edited.
3. If signed-out return routing is desired, extend the Research sign-in `returnTo` allowlist to admit `/care/discovery`; the current validator accepts only Research paths. The implemented 401 state safely sends users to `/research/sign-in` and asks them to return and consent again.

## Safety / rollback

- No schema or runtime configuration changes.
- No production deployment or production mutation.
- Rollback is a single revert of `64c9da533132be871018cd2b88e47af59d36bf2e` before integration, or the lead's normal release rollback after merge.
