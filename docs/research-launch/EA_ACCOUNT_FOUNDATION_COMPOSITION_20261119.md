# Account foundation and activation composition

Private source companion to frozen #5411bcd7ea6; no external PR merge, deployment, managed installation, role/config/data/provider change or real outbound message. Baseline run44453904998 was still qualifying when this source was prepared; actual results must be read separately.

Independently accepted4b14c4fc four-file activation boundary is imported exactly. All7 account mutation routes are closed by default. Claim and invitation issuance requires both server-owned strict-true mutation and notice-issuance switches, before any account persistence/provider call. Closed writes retain canonical Auth401/unverified403 and redacted503 for verified callers; reads remain governed by existing Auth/scopes. Enabled writes retain existing role/subject/email/password-proof controls. No request field can authorize activation.

The example flags are explicitly false; this changes documentation only. Actual service configuration and account schema are untouched. The existing direct trusted notification helper remains separate from these mounted guards; source availability is no provider/recipient/data-route approval.

All63 route/mount cases, including56 new cases, are AUTHORED_UNRUN here and are added to the focused hosted gate for future qualification. Current-source organization namespace/least-privilege foundation work is still separately owned and not imported. Preserve the legacy partner table and B2B authority, exact replay guards, original requests and current staff access. No company seed or role inference.
