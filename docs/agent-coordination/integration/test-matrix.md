# Test Matrix

**Updated:** 2026-07-18

| Check | Baseline | UI-002 | Notes |
|---|---|---|---|
| `npm run check` | fail | fail | Only pre-existing `server/storage.ts(48,40): TS7006`, implicit `any` for `tx` |
| `npm test` | pass | pass | Grew from 1 file and 12 tests to 2 files and 16 tests |
| `npm run build` | pass | pass | Production bundle succeeded; main JS is 715.25 kB and retains the greater-than-500 kB warning |
| Lint | unavailable | unavailable | No lint script in `package.json` |
| Research routes at 390 x 844 | overflow | pass | 13 routes checked; every document matched its client width |
| Main and Research at 320 px | fail | pass | Selected routes and `/` matched the 305 px client width; main CTA no longer escaped the header |
| 640 CSS-pixel approximation | partial | pass | Membership comparison is intentionally one column with zero page overflow |
| 768 and 1440 responsive states | fail | pass | Intended navigation, CTA, and grid states render at their defined breakpoints |
| Copy invitation | not present | pass | Browser action changed to `Copied` and wrote the exact invite URL |
| Referral privacy states | not present | pass | Production empty state plus five approved preview statuses; no private decision reason |
| Browser console | pass | pass | Zero application warnings or errors in the final UI-002 pass |
| Reduced motion | pass by source audit | pass by source audit | Global and Research-specific `prefers-reduced-motion` fallbacks exist |
| Focus visibility | partial | pass by source and browser audit | Global `:focus-visible` treatment and native interactive elements are present |

Commands used Node 20.19.0 and npm 10.8.2. Browser URL was `http://127.0.0.1:5000`. The local waitlist count request still returns 500 without Supabase configuration and uses its existing fallback. Four implementation previews are under `docs/research-design/previews/ui-002/`.
