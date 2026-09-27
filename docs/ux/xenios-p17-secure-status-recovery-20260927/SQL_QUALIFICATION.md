# SQL qualification

Candidate: `20260927203000_research_status_recovery.sql`
Pinned source: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
SHA-256: `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`

The managed migration and candidate mirror are byte-identical. A disposable
`postgres:17-alpine` instance was bootstrapped with the required roles and M71
authority, then the P-17 migration was applied twice. The disposable verifier
reported `PASS_STATUS_RECOVERY_DISPOSABLE_BEHAVIOUR`.

Verified:

- two forced-RLS relations and zero browser/direct table privileges;
- five service-role-only `SECURITY DEFINER` RPCs owned by `postgres`, with
  bounded signatures and `search_path = pg_catalog, public`;
- canonical-recipient re-read at delivery, exact subject/owner binding and
  digest-only token/session persistence;
- malformed, wrong-purpose, expired, consumed, revoked and wrong-owner refusal;
- replacement revocation and stable event retry;
- two independent concurrent exchanges produced one success and one refusal,
  one session row and one consumed token.

The disposable container was removed. No managed Supabase, staging or production
database was contacted. Precheck, postcheck, rollback and behavior verifier are
checked in beside the candidate or under `supabase/verification/`.
