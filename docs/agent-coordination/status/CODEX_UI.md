# CODEX_UI Status

**Updated:** 2026-07-18T15:40:45-05:00
**Mode:** local Codex desktop project with direct filesystem access
**Repository:** `teamxenios/xenios-website`
**Working directory:** `C:\Users\sboad\Downloads\xenios-website-codex-ui`
**Remote:** `https://github.com/teamxenios/xenios-website.git`
**Base branch:** `main`
**Base SHA:** `df8e4c53fc676b2b413fa509518e73ac06194a7e`
**Working branch:** `codex/research-ui-content`
**Published implementation commit:** `b72e6d1fc0c981f4ba03d6e1d0c24ec5fa6b32d6`
**Published integration head:** `7856966a782d55aef9b1b0f9a1ac570c19c0cb5a`
**Draft PR:** #13 into `main`
**State:** UI-002 complete, Claude review requested

## Local visibility

Codex can read Claude's physical checkout at `C:\Users\sboad\Downloads\xenios-website` because this is a local desktop session. It cannot see changes that exist only inside Claude's hidden conversation. Claude's checkout was clean at `f9c44807` during the last direct inspection, so no uncommitted Claude file changes were available to read.

## What shipped in UI-002

- Repaired Tailwind v4 entry behavior, missing shared primitives, narrow header containment, and responsive Research shell behavior.
- Added an original code-native xenios Member Passport with a real QR, privacy label, applicant/member variants, and share actions.
- Added membership comparison, referrals, invite, member-referral dashboard, Blueprint, programs, professionals, ambassadors, trust, and data-use routes.
- Added referral attribution presentation to `/research/apply` without changing Claude's submission API or inventing a code after success.
- Added privacy-safe referral helpers and four unit tests.
- Kept all Research routes behind the existing password gate and `noindex` boundary.
- Versioned four 390 x 844 implementation previews.

## Validation

- `npm run check`: only the pre-existing `server/storage.ts(48,40): TS7006` remains.
- `npm test`: 2 files and 16 tests passed.
- `npm run build`: passed; main JS remains 715.25 kB and triggers the existing Vite chunk warning.
- Browser route matrix: 13 Research routes plus the main home page checked at 390 px; selected routes checked at 320, 640, 768, and 1440 px.
- Overflow: zero document overflow in the tested viewports.
- Browser console: zero warnings or errors in the final pass.
- Referral default: zero activity, no QR, and all share actions disabled until a secure server contract exists.
- Referral preview: exactly `Invited`, `Pending`, `Qualified`, `Reward earned`, and `Expired`; no private decision reason or application content.
- Copy action: produced the exact invitation URL in the browser. Native buttons retain keyboard semantics and visible focus treatment.

## Needs from Claude

- Review PR #13 and the handoff under `docs/agent-coordination/handoffs/to-claude/`.
- Supply authenticated referral contracts for code issuance, validation, attribution, qualification, reward ledger, expiration, and privacy-safe activity.
- Preserve the UI-safe status vocabulary in `shared/research/referral-ui.ts`.
- Do not expose applicant identity, application answers, health data, approval reasons, or decline reasons to referrers.
- Resolve the pre-existing TypeScript error when working in `server/storage.ts`.

## Needs from Samuel

- Approve final pricing, credit expiry, qualification timing, and production launch terms before public release.
- Approve publication of any regulated product, clinical, ambassador, or professional-compensation pathway.

## Integration notes

- PR #9 merged into `main` at `df8e4c5` and its source branch was deleted.
- GitHub automatically closed stale PR #10 when that base disappeared.
- Codex fetched the merge, merged `origin/main` into the UI branch, and opened draft PR #13 against `main`.
- Membership backend, authentication, payments, onboarding, private data, referral enforcement, and Blueprint processing remain Claude-owned.
