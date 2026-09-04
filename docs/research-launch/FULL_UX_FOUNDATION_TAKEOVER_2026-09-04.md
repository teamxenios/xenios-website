# UX foundation continuation — 2026-09-04

Successor implementation/evidence record: `FULL_UX_FOUNDATION_AUTH_ACCOUNT_CHECKPOINT_2026-09-04.md`.
Tested code `c93c48704c6842f6f65fdc0698cfb3fe627cad2e` is pushed; nothing deployed.
This initial takeover note is historical, not the final test or completion attestation.

## Recovered checkpoint

The founder asked Codex to locate Claude's session-limit pause and continue.
Claude session `d067e872-0c2b-4637-ab02-bcaf9afdd4ba` stopped at
`2026-09-04T14:56:09Z`, after inspection and task registration, before UX code
edits. Base: `f318a85d6cd8d6b3cc5f6738656df6aaf37925ae` on
`claude/full-ux-foundation-20260904`; the code ancestor is Care domain integrity
`11e4b6d81da325bdc877968e61e8b8a5f2e1be2c`. The prior UX claim failed because of
legacy affiliate/Early Access leases; no UX lease was acquired.

Original worktree `C:/Users/sboad/projects/xenios-ux-foundation-20260904` remains
untouched. Its two dirty registry files and untracked session file were copied
to `C:/Users/sboad/projects/xenios-ux-claude-recovery-20260904`, with a binary Git
patch. Codex continues from the exact same HEAD in
`C:/Users/sboad/projects/xenios-ux-codex-20260904`, branch
`codex/ux-continuation-20260904`, session `codex-ux-continuation-20260904`.
Task `UX-AUTH-ACCOUNT-CONTINUITY-20260904` has a narrow uncontested lease; no
legacy affiliate or Early Access lease was silently seized.

Read-only Render verification on this continuation confirmed live
`db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deployment
`dep-dad08h740ujc73aprfcg`, service `srv-d8s9vej7uimc7384dfcg`, auto-deploy off.
No production write, deploy, migration, release merge, environment change,
customer message or operational fact was authorized or performed.

## First implemented slice

- Shared closed return-destination policy used by the client and the server's
  recovery-email redirect; configured site origin is never taken from requests.
- Sign-in → forgot password → recovery email destination → reset → fresh
  password sign-in → exact allowed destination. Recovery privileges remain
  isolated; a navigation hint never authorizes a workspace.
- Existing storefront `variant`, `qty`, `intent` preserved, as are limited safe
  view hints. Credentials, nested redirects, arbitrary query payloads, raw
  searches, fragments and unmounted/privileged routes are not forwarded.
- Claim success and account-security recovery keep safe destination context.
- Accessible sign-in password visibility and 16px auth inputs.
- Server-derived closed next-action targets link account attention to existing
  Care, billing, order or support destinations. Requests are not payment-due
  orders; unavailable sources never invent a task or a green all-clear.
- Source-grounded 15-persona journey matrix, including explicit dark/parked and
  unverified states; no claim that the whole platform is complete.

## Evidence boundary

Focused auth checks: 6 files / 166 tests passed under Node 20.19.0. Existing
recovery isolation initially passed with 221 tests across five files. Server
forgot-password suite: 67 tests passed, including 15 added negative/parity cases.
Production build passed. Final combined gates, browser proof and exact code SHA
will be recorded in the successor handoff, not inferred from this checkpoint.

The recovered predecessor full suite was **not green**: 3 failed files,
18 failed tests, 811 passed files, 12,152 passed tests and 43 skipped tests.
The failures were cart-shelf-agreement (2), supplier-authority (15), and
preview-harness.guard (1). The outer shell's exit 0 masked npm test exit 1.
Supplier evidence expired September 3; code must not renew or fabricate it.
The continuation's own full-suite result must be recorded separately.

## Remaining program work

The full UX/referral parent task remains unfinished. No organization invitation
or account-first identity migration has been silently mounted. No XRR
list-by-member data source, Care request-to-patient linking, clinical integration,
referral economics, supplier confirmation or payment-provider availability has
been fabricated. Next: verify this slice, then finish canonical Gen 2 referral
link/capture continuity in a separately scoped lease.

Release boundary: prepare a tested exact-SHA packet; do not deploy or merge
without a new founder GO for that exact action and SHA. Rollback is a normal
code revert before release; no schema rollback is needed for this slice.
