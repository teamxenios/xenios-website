# Test Matrix

**Updated:** 2026-07-18

| Check | Baseline | UI branch | Notes |
|---|---|---|---|
| `npm run check` | pending | pending | Repository has no `typecheck` script; `check` runs `tsc` |
| `npm test` | pending | pending | Vitest added by PR #9 |
| `npm run build` | pending | pending | Production bundle |
| Lint | not available | not available | No lint script in `package.json` |
| Main routes at 390 x 844 | pending | pending | Screenshot baseline required |
| Main routes at 768 x 1024 | pending | pending | Screenshot baseline required |
| Main routes at 1440 x 900 | pending | pending | Screenshot baseline required |
| 320 px width | pending | pending | Overflow and control reachability |
| 200 percent zoom | pending | pending | Manual browser check |
| Keyboard only | pending | pending | Navigation and focus order |
| Reduced motion | pending | pending | Animation fallback |

The matrix will record exact commands, results, browser, URL, console errors, network errors, overflow, accessibility observations, and screenshot paths after the local audit.
