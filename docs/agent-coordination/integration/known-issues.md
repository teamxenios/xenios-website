# Known Issues

**Updated:** 2026-07-18

| Issue | Owner | Status |
|---|---|---|
| Public Research product routes conflict with stealth-copy rules | Samuel, Claude, legal/compliance | Proposed decision open |
| Canonical V2 specification is outside the repository | Samuel | Open |
| Responsive Tailwind variants do not apply; desktop navigation and grids remain collapsed | Shared, owner required | Open, blocking safe Research reuse |
| `.rule-all` and `.btn-ghost-on-dark` are used but undefined | Shared, owner required | Open |
| 320 px main header and waitlist ribbon overflow horizontally | Shared, owner required | Open |
| Research header produces approximately 17 px horizontal overflow at 390 px | CODEX_UI, shared shell | Open |
| Main-site UI audit and 18 screenshots | CODEX_UI | Complete in Stage 1 |
| No Claude status or incoming handoff existed at bootstrap | CLAUDE_PRIMARY | Awaiting update |
| PR #9 is open and may move during the UI audit | Both agents | Monitor before each major cycle |
| Production asset ownership and license review has not started | CODEX_UI, Samuel | Open |
| `npm run check` fails on pre-existing `server/storage.ts(48,40)` implicit `any` | CLAUDE_PRIMARY | Open |
| Main production bundle is 715.09 kB and triggers the Vite chunk warning | Shared | Open, non-blocking baseline |
| Local waitlist count request returns 500 without Supabase configuration | Environment | Expected locally; fallback count works |
| `client/index.html` metadata and FAQ copy conflict with current brand-copy guidance | Content owner | Open |
