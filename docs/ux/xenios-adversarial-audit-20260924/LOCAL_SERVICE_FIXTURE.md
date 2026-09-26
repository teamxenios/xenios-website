# Local service qualification

The closeout extended existing PGlite/source evidence with actual local Docker GoTrue, PostgREST, Postgres and Storage. Supabase CLI 2.118.0 was installed with a pinned version in C:/tmp/xenios-audit-local-services-20260926. The dedicated project uses ports56321/56322/56324. No hosted project link, remote credentials or production changes are used.

qualify-local-services.ts proves13 bounded cases, including actual password and recovery sessions, the canonical admin guard, real approved-customer SQL and idempotent claims. qualify-local-resource-bytes.ts proves9 more: actual admin upload/review/publication, exact private bytes through real member/partner owner resolution, out-of-audience denial, direct/public Storage refusal, use-time suspension and three durable delivery records. No authorization guard is replaced with an unconditional grant. Synthetic partner fixtures are seeded under canonical database constraints; partner lifecycle transitions are covered separately by existing SQL rehearsals.

Both runners accept only a local status-key JSON file whose API_URL exactly matches http://127.0.0.1:56321. Keys remain outside the repository. They clear ambient application secrets before imports and deny non-local fetch/socket destinations. SMTP uses the local capture service; no external provider is configured or contacted. Pending/retry outbox states are not delivery.

Run against a fresh dedicated local stack: first qualify-local-services.ts, then qualify-local-resource-bytes.ts, using pinned Node20 and tsx. These scripts deliberately preserve failed state; do not rerun against partially populated state without inspecting it. The resource precheck refuses an already-installed fixture. The local service versions differ from production and do not certify hosted deployment parity.

The first startup using a Docker internal network could not reach the published Postgres port; the normal local network succeeded. A first runner attempt exposed Node20's missing native WebSocket transport before user creation; the fixture now supplies the repository's existing ws transport, like server/supabase.ts. Neither was an application defect.

Official workflow reference: https://supabase.com/docs/guides/local-development/cli/getting-started . No production changes or hosted delivery tests were performed.
