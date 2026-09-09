# QR/PNG follow-on release — exact handoff

Status: **DEPLOYED AND LIVE**

- Application commit: `c545a70eb694d990842ad1259df4f0786dab92c9`
- Render deploy: `dep-dag8l567bikc738a1nj0`
- Base: deployed hardening `8be5d582586217e4cf531e718c65032b79152022`
- No database migration, flag change, account action, notification, payment, shipment or clinical effect.

The partner dashboard now exposes an explicit active-partner entry point for the canonical share card. Referral links are fetched only after the user opens the tools, preserving the dashboard's single canonical activity read. The card supports visible QR, enlargement, copy, supported native share, print, PNG download, expiry/revocation refresh and principal fencing on account switch/logout/unmount.

Evidence:

- `docs/revenue-launch/20260908/QR_DEPLOY_RECEIPT_C545.json`
- `docs/revenue-launch/20260908/critical-endpoints-comparison-8be-to-qr-c545.json`
- `docs/revenue-launch/20260908/qr-observation-c545.log`

Qualification: guarded integration passed; 90 targeted tests passed; full repository typecheck and production build passed in the isolated integrated worktree; endpoint smoke was 30 SAME / 0 regressions / 0 human review; ten health checks over 325 seconds passed with zero Render error logs.

Next owner/action: CRM/organization work remains blocked until the correct Pack02 foundation and collision-free organization authority are confirmed. The staging preflight against `tetynodzrtmdbuzgboro` found only the existing partner/reporting `research_organizations` shape and no CRM or organization-user/invitation extension tables. Do not apply the package candidate SQL against that schema. Durable payment/provider adapters, webhook verification and recovery remain a separate unqualified dependency.
