# Client-account candidate disposable attack rehearsal

This directory contains the executable evidence for
`20260826_research_client_accounts_blitz.sql`. It supersedes narrative-only
attack counts; the migration remains a **candidate** and is not registered or
approved for any environment.

Run from PowerShell with Docker available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\candidates\20260826_research_client_accounts_blitz.rehearse.ps1
```

The runner creates one randomly named `postgres:16` container with
`--network none`, bind-mounts only this candidate directory read-only, and
destroys that exact container in `finally`. It does not read an environment
URL, does not contact Supabase, and cannot mutate a non-disposable database.

The deterministic sequence is:

1. Bootstrap synthetic `anon`, `authenticated`, `service_role`, `auth.uid()`,
   member, and prelaunch-role dependencies.
2. Apply the candidate and run 37 denial attacks plus 11 positive invariants.
3. Prove a second in-place apply is refused without changing the first apply.
4. Run the explicit non-`CASCADE` rollback and prove all candidate objects are
   absent.
5. Cleanly reapply, rerun the battery, roll back, and verify absence again.

Expected terminal line:

```text
PASS disposable rehearsal: 2 applies, 74 refused attacks, 22 positive invariants, rerun refusal, 2 rollbacks, and clean reapply.
```

Observed on 2026-08-28 with Docker Engine 29.5.3 and the official
`postgres:16` image: the command exited 0 with that exact terminal line after
seeding hostile default table/sequence/routine grants, and the randomly named
container was destroyed. Byte identities for the rehearsed inputs were:

```text
candidate SQL  0CBF235418AA358429003A1CFDD2993450EA310CEC59D1DBA23B2F9D9CDE26E9
attack SQL     658D0286DE85A598AC86797E6514CDBF18DA56B7A7C158B3961CA52AA65010B5
bootstrap SQL  FF083C2E8A52AA6C66E1999E1D7F891AF7FA49A0C815382DABA99B12131396C6
runner         EEF9F0089E385FFBBD2FE1F6633DA94035C5ABFE3F36F585E6401E3D94F07A3B
```

The battery covers exact table/routine/sequence ACLs, forced RLS, all-null
draft approval bundles, authenticated-actor approval, revoked/expired/non-admin
denials, contact and consent, canonical JSON evidence fingerprints including
the immutable approved wave, cross-batch identity uniqueness, real-member
interest binding, removal of unprovable `active`/`accepted` states, immutable
approved evidence, append-only invitation transitions, append-only activation
audit, candidate rerun refusal, rollback, and reapply.

No result from this harness authorizes application. Independent review,
founder approval, migration-ledger registration, and `MIGRATION_DAG.md`
registration remain required before any non-disposable execution.
