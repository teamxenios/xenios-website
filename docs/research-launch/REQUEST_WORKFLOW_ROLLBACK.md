# Request workflow rollback and operator hold

This is a source release procedure, not authority to change a managed environment. All new workflow flags, the database workflow setting and processor scope start disabled or empty. A qualified operator needs the existing explicit environment/release approval before an actual configuration or database change.

If the increment must be withdrawn, first disable RESEARCH_REQUEST_REVIEW_WRITE_ENABLED to stop new review commands. Disable EA_REQUEST_CUSTOMER_STATUS_ENABLED to return the customer UI to its saved confirmation/support fallback. Under the approved database procedure, set the existing request_intent_private.workflow_settings singleton enabled=false to stop winning-save workflow initialization; retain its pinned environment and cutoff. The canonical request save/recover and pending_review receipt remain the authority.

Pause the separately approved customer-notification adapter using its own reviewed controls. Reconcile attempted or uncertain sends before considering any resend; an application rollback cannot retract an email. Preserve the existing staff sender/key and its established rollout settings. Full-detail production email remains off.

Restore only a known compatible application SHA with the normal exact service/commit prechecks, served-byte postchecks and private auth checks. The earlier application may not expose workflow UI; retained confirmation and support are the fallback. No schema drop is required. Do not delete workflow/events/commands/notice evidence, move the cutoff, backfill requests, reset scopes or restore a role grant as part of this rollback.

Qualification at source47fdd6ddf8cbafadebb21a38e2b37ce4f166837e: real owned PostgreSQL16 test passed in hosted run44230043438, job134552555241 on candidate01fd29d7. It covered repeated migration application in disabled and populated states, preserved settings/capability/scope/history, canonical save/replay, independent concurrent reviewer connections, revocation, role/public-access denial and failing synthetic transactional notification callback. This does not qualify the separate real sender, managed Auth, customer mailbox or a production release.

The strengthened test-only successor c6427c7aca525ea3b8bf47861bfa00b3b29333fc also passed hosted run44230830788/job134555167017, one non-skipped test, including a lost RPC response after the real commit and recovery through a fresh service. SQL bytes were unchanged.

## Qualified additive customer notices and staff recovery

Rows88/89 are source-qualified only and remain unapplied to managed environments. Row88 exact source5229c5eb has SHA-256 ac62d26e7d64569a67c6604ecc1aac85bdc17093275fd564f79eecea13974682; actual composed PostgreSQL16 qualification passed in run44236586648/job134574089463, one non-skipped test. Row89 exact source5cb0d3b9 has SHA-256 3805756dcadac2cd5ad5780adaec6f151375557fa952547e114dc496015cbd2f; run44234930509/job134568651327 passed126 tests with no skips, including real PostgreSQL16 repeated application. These facts do not authorize managed application or activation.

For a customer-notice rollback, disable EA_REQUEST_CUSTOMER_NOTICE_ENABLED and preserve cutoff/environment pins, notice intents, exact-message digests, outbox jobs and attempts. Reconcile unknown sends with the provider before any retry; never reset the bound digest or invent a new event/key. Keep full-detail production mail off. Canonical request retention/erasure must account for notice foreign keys and outbox privacy evidence; do not delete a request with notices through an unreviewed cleanup.

For staff recovery, disable RESEARCH_STAFF_RECOVERY_ENABLED. Existing member recovery, canonical Auth sessions, staff roles and audits remain authoritative. Do not revoke roles, reset a password, change Auth configuration, weaken password floors or create membership as part of rollback. Before any approved row89 application, measure care_access_audit row count and review lock/validation impact of the additive permission CHECK change. Require actual provider SiteURL/allowlist/template and delivery proof separately.

Current production application rollback anchor is7726fd9ebde5ca1ba71c4e8babfad174e82ef677, deploydep-dbtpv82fngtc739setp0; current staging rollback anchor isb1def03be322f2f594ce119ac334363b102f3db5, deploydep-dbuh4mhsrm7s73erucg0. Reverify before an actual release; do not replay older already-installed migrations merely because their historical source ledger says PENDING.
