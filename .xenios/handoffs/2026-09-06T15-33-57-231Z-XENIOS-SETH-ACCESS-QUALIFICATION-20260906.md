# Xenios Seth account/partner qualification handoff

- Task: XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905
- Session: codex-seth-revenue-launch-20260905
- Branch: codex/xenios-seth-revenue-launch-20260905
- Exact pushed implementation candidate: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Exact pushed records/evidence commit: `bc367a9`
- Production mutation: none

## Closed qualification items

1. Read-only SQL prechecks ran against Supabase project `yvzeduaxbwgcwllhywff` at 2026-09-06T15:23:19.373312Z. Full schema/constraint/index/trigger/policy/function/count evidence is in `docs/revenue-launch/20260905/production-account-partner-prechecks-20260906.json`, SHA-256 `8e94f885842be95a03042f29c154582670bc863bc244786b7f09c9aa865ba658`. Both preflight guards passed with no normalized identity or partner-binding duplicates. Candidate authority functions are absent before apply, as expected.
2. Rollback configuration is explicit in `ACCESS_RELEASE_QUALIFICATION_ADDENDUM_20260906.md` and the deployment packet: `RESEARCH_FOUNDING_ACTIVATION_ENABLED` is currently `true` and must be `false` before an application rollback; `RESEARCH_MEMBERSHIP_BILLING_ENABLED` is absent (effective default `false`) and must remain absent or false. History is preserved.
3. Local nonproduction browser evidence passed for existing-account sign-in, account home, partner workspace, refresh, rendered sign-out, sign-back-in, and cross-partner selector rejection over the real route handlers and SPA bundle with synthetic preview Auth/data. Artifact: `account-journey-browser-20260906.json`, SHA-256 `12543832c83a52e0541207e3c608d941bd02f9c934c5f4abcc3b159479822ce9`.

## Current qualification boundary

- Database prechecks: PASS.
- Disposable migration rehearsals: PASS (35 approved-customer checks; 57 partner-lifecycle checks).
- Approval-to-login browser journey: PASS in bounded nonproduction qualification. The dedicated harness used isolated admin/customer Chromium profiles and the real inspection, approval, claim, token-validation, Auth session, account, sign-out, and protected-route UI paths over local synthetic boundaries. No live approval, claim, email, notification, migration, deploy, config change, payment, or purchase occurred.
- The passing new-account run is recorded in `docs/revenue-launch/20260905/new-account-browser-qualification-20260906.json` (SHA-256 `3d6a7caaf1ef8b7b486ba77db569a71a85692e2de2f48da94459c475654ad096`).
- Resource Hub/B work remains separate and is not integrated or required for this account/partner slice.

Next action is Samuel's exact-SHA production authorization. Do not apply migrations or deploy without that approval.
