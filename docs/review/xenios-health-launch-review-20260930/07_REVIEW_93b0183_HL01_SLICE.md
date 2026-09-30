# Claude independent review: Codex successor slice `93b0183` (HL-01 public entry)

## Identity

- **Subject:** `93b018304ce7f63cd02e8abc64da3523115fd2bd`, tree `6fa160f3da6dda522c296dc78e0719cddf2a2204`, branch
  `codex/xenios-health-launch-implementation-20260930`.
- **Records-only tip:** `8c163a2ee7a4cd2f03ea8cc864d2f1f5fe9a4b37`, tree `9afdf865f3ddd7256fd96bb43a8effc7ba8aae64`,
  adding the handoff and slice doc.
- **Base:** `8e0271e9`, verified as an ancestor.
- **Runtime paths changed:** only `client/src/clarity/pages.tsx` and `client/src/clarity/pages.test.tsx`.
  `package.json` and `package-lock.json` are unchanged.
- **Reviewed:** 2026-09-30 11:53-12:00 CT by `claude-health-launch-review-20260930`.
- **Environment:** checks worktree `C:/xenios-wt/closeout-review`, detached at `93b0183`, private Node v20.19.0.
  npm scripts ran through the global npm 11.11.0 on Node 20, because the bundled 10.8.2 fails silently on this host
  (R-21).

## Checks run by Claude

| Check | Result |
| --- | --- |
| Focused tests: `pages.test.tsx`, `App.routes.test.ts`, `PageShell.test.tsx`, `StatusPage.test.tsx` | 4 files, 47 passed |
| Mutation check: the slice's new test run against the *old* `pages.tsx` from `8e0271e` | **Fails** as it should (1 failed, 5 passed). Restored clean afterwards. |
| `tsc` | exit 0 |
| `npm run build` with the source and build no-em-dash gates | Pass. Source: 1,332 files, 0 forbidden forms. Build: 224 files, 0 forbidden forms. The new copy is present in the bundle. |
| Browser, the real bundle at `93b0183` served by `scripts/preview-early-access.ts` (public pages are faithful), `/products` at desktop | The hero primary action is "Browse Research Catalog" → `/research/early-access`. The research tile → `/research/early-access`. **0 self-links in `<main>`.** Truthful "A request is not a paid order" copy. No em dash. |
| 320x700 viewport (proxy, **not zoom**) | `scrollWidth` 320 equals `clientWidth` 320. No overflowing controls. No button-style link under 44 px. The primary action is above the fold (top 405 of 700). |
| Keyboard | "Skip to content" → Enter → the first Tab lands on "Browse Research Catalog". It is `:focus-visible`, fully below the 69 px header. |
| True 200%/400% zoom | NOT RUN (tool limit) |

## Disposition

- **The slice itself: PASS** for the code it changes. No P0, P1 or P2 in the diff.
- **HL-01 as a whole:** see "HL-01 residual" below. It is not closed by this slice alone.

## HL-01 residual

Pending merge of the workflow results.

## Coordination issue found (sent to Codex, `eaa61c9`)

- The slice's "Next source work" item 1 says the three variants "remain excluded". That comes from reading this review
  branch at `1a4e863`, before Samuel's 11:32 CT reversal.
- The current founder decisions are in `05_FOUNDER_PRICE_CONFIRMATION_2026-09-30.md` at tip `0f7295e` or later:
  - include all product rows, including GRP-0421, GRP-0423 and GRP-0424;
  - Superpower and Mito Health shown as Coming soon;
  - the book display cents for the 17 rounding rows;
  - Hexarelin 6250 and Oxytocin 10750.
