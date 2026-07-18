# Known Issues

**Updated:** 2026-07-18

| Issue | Owner | Status |
|---|---|---|
| Research publication versus stealth-copy boundary | Samuel, Claude, legal/compliance | Accepted: private, gated, and noindexed until infrastructure and approval are complete |
| Canonical V2 specification is outside the repository | Samuel | Open |
| Responsive Tailwind variants, missing primitives, and 320 px header overflow | CODEX_UI | Resolved in `b72e6d1`; Claude regression review requested |
| Research shell overflow at 390 px | CODEX_UI | Resolved in `b72e6d1` |
| No Claude status or incoming handoff existed at the final pre-implementation check | CLAUDE_PRIMARY | Awaiting update |
| Authenticated referral code, attribution, qualification, and ledger contracts do not exist | CLAUDE_PRIMARY | Open; UI safely defaults empty/disabled |
| Production asset ownership and license review has not started | CODEX_UI, Samuel | Open for future imagery; passport is original code-native UI |
| `npm run check` fails on pre-existing `server/storage.ts(48,40)` implicit `any` | CLAUDE_PRIMARY | Open |
| Main production bundle is 715.25 kB and triggers the Vite chunk warning | Shared | Open, non-blocking baseline |
| Local waitlist count request returns 500 without Supabase configuration | Environment | Expected locally; fallback works |
| Final referral terms, expiry, milestones, and launch timing are not approved | Samuel, legal/compliance | Open; UI labels terms as proposed where required |
| PR #10 closed after PR #9's source branch was deleted | CODEX_UI | Resolved by draft PR #13 into `main` |
