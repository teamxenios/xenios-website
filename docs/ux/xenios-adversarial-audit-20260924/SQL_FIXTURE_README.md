# Reproduce the isolated claim qualification

Application bundle: c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa. Original repair 02d525baa7d784ed16e297c1d17b1e4050ecf4cc remains preserved. No application source was changed for this fixture.

Use pinned Node 20.19.0. Supply the already built exact bundle and installed PGlite module explicitly:

```powershell
npx tsx docs/ux/xenios-adversarial-audit-20260924/preview-sql-claims.ts C:/tmp/xenios-audit-c4ea8a9-20260924/dist C:/tmp/xenios-review-pglite-6b74f24/node_modules/@electric-sql/pglite/dist/index.js
```

Then run `node docs/ux/xenios-adversarial-audit-20260924/qualify-sql-claims.mjs` from the repository root. It targets only localhost:5305 and refuses a previously claimed fixture. Restart the fixture before a repeat qualification.

For the browser, open localhost:5305/__audit_claim/claim, choose existing-account sign-in and use the synthetic member credentials defined in the harness. The real browser claim action transitions the actual SQL application/member/outbox records. Do not create a real identity or send a real message. The consumed link should then display Account active. The qualification runner is an HTTP integration test, not browser automation.

The fixture removes ambient secrets and inherits the existing native harness's socket/fetch restriction to its own loopback origin. It uses actual schema SQL and the approved-access candidate, with only the existing PGlite rehearsal's pgcrypto-extension omission (core UUID generation is used). RPC claim/approval calls run under service_role and retain SQL privilege checks. Table reads allow explicit tables/equality columns and require the local service bearer. Other operations remain closed. The Auth adapter is synthetic: exact predefined credentials and registered sessions, including a recovery-purpose token. It is not managed GoTrue, PostgREST, production RLS, object storage, or restart-durability evidence.

The existing native initializer attempts a local service-key readiness probe before listening. Its ECONNREFUSED/startup warning is fixture-only; no external credential or production probe occurs. Outbox dispatch is denied by the fixture, so pending SQL intents are never upgraded to delivery claims.

Evidence: `sql-claims-qualification.json`, `sql-admin-approval.json`, `sql-claim-before.txt`, `sql-claim-after.txt`, `sql-claim-consumed-status.txt`, `sql-recovery-browser-boundary.txt`. V1 browser claim evidence precedes an explicit V2 fresh SQL restart for the admin registrar. Tokens are not persisted in evidence.
