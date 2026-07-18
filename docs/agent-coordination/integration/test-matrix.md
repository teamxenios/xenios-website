# Test Matrix

**Updated:** 2026-07-18

| Check | Baseline | UI branch | Notes |
|---|---|---|---|
| `npm run check` | fail | fail | Pre-existing `server/storage.ts(48,40): TS7006`, implicit `any` for `tx` |
| `npm test` | pass | pass | 1 file and 12 tests passed |
| `npm run build` | pass | pass | Production bundle succeeded; main JS is 715.09 kB and Vite reports a greater-than-500 kB chunk warning |
| Lint | not available | not available | No lint script in `package.json` |
| Main routes at 390 x 844 | captured | captured | 6 exact full-page PNGs plus metrics; waitlist ribbon exceeds its box |
| Main routes at 768 x 1024 | captured | captured | 6 exact full-page PNGs plus metrics; intended responsive variants do not apply |
| Main routes at 1440 x 900 | captured | captured | 6 exact full-page PNGs plus metrics; nav and multi-column layouts remain collapsed |
| 320 px width | fail | fail | Document scroll width 356 in a 305 px client area; header CTA and ribbon overflow |
| 200 percent zoom | partial | partial | 640 CSS-pixel approximation contains the document; primary nav remains absent |
| Keyboard only | partial pass | partial pass | Menu dialog opens, focuses Close, handles Escape, locks body, and has focus-trap/return logic; focus styling needs strengthening |
| Reduced motion | pass by source audit | pass by source audit | Global and component-specific `prefers-reduced-motion` fallbacks exist |

Commands used the repository-pinned Node 20.19.0 and npm 10.8.2 toolchain. Browser URL was `http://127.0.0.1:5000`. Chrome produced no page console errors. `/api/waitlist/count` returned 500 without local Supabase configuration and the UI displayed fallback count 556. Screenshot paths and computed observations are recorded in `docs/research-design/MAIN_SITE_UI_AUDIT.md` and `docs/research-design/baseline/main-site/metrics.json`.
