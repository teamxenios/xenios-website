# Partner main-landmark repair handoff

- Base coordination commit: `d88ae37fd7dab9bf03ea283d5d1229d8b5cbacdb`
- Lease claim commit: `7c64d36558930f995479dad3c042c43f9c16f328`
- Implementation commit: `e79324a0b0fb54010533716c45c8d5c46cfaa5de`
- Implementation tree: `9a4528900e917dd7df3a68cb7b3eab820c22a167`

The exact `/research/partners/links` and `/research/partners/dashboard` branch in `ResearchLayout` now supplies one semantic `main` around its children. The shared partner shell remains a `div`, preventing nested landmarks on the other partner routes. The existing exact-route regression now asserts one main.

Verification:

- `npm run check`: pass.
- `layout-referral.test.tsx` plus `ui/shells.test.tsx`: 15/15 pass.
- Partner `Dashboard.test.tsx` plus `Links.test.tsx`: 42/42 pass.
- Evidence-bound production build: pass, 336 files, inventory `4158ca796d5a664a3af80c24e795447d31756fb9753d9305bf180b3ac6145f9c`.
- Real production-bundle browser: 18/18 captures and 8/8 journeys pass; Partner A all nine widths, account desktop/390, reload/session rehydration, clicked logout, Partner B isolation, Org training-pending, ordinary-member denial, inactive-member denial; zero network-boundary violations.
- Browser results: `C:\tmp\xenios-fable-account-browser-e79324a-001\account-partner-browser-results.json`, SHA-256 `5402cf610813a3058d9d9061707782d3aecacd2a98fef117990ece18e3c9c804`.

No production, provider, database, payment, shipment, or external-account mutation occurred.
