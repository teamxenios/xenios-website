# Test Matrix

**Updated:** 2026-07-18

| Check | Baseline | PR #13 corrected | Notes |
|---|---|---|---|
| npm run check | fail | fail | Only pre-existing server/storage.ts(48,40): TS7006 |
| npm test | pass | pass | 2 files and 18 tests; six referral-gating cases |
| npm run build | pass | pass | Production bundle succeeded; existing greater-than-500 kB main-chunk warning remains |
| Invitation syntax invalid | absent | pass | Malformed code resolves invalid and never attaches ref |
| Invitation authenticity unavailable | unsafe | pass | A valid-looking URL code resolves unavailable without enabled server validation |
| Feature flags disabled | partial | pass | Production counts zeroed; credits, code, QR, and sharing disabled |
| Future verified adapter case | absent | pass | Ref attaches only when flags and exact server-validated code are present |
| Aggregate development preview | person-level | pass | Counts only; no activity, code, QR, credit, or sharing |
| Browser at 390 x 844 | partial | pass | Zero overflow on checked corrected surfaces |
| Application ref query | prefilled | pass | No referral input or attribution is created from the URL |
| Production gate | fail | fail | 2026-07-18 15:42 CDT: HTTP 503, "The research section is not configured." |

Browser target was http://127.0.0.1:5000. Checked surfaces: valid-looking invite, malformed invite, development invite preview, public referrals, production member referrals, aggregate development member preview, and application with an untrusted ref query.
