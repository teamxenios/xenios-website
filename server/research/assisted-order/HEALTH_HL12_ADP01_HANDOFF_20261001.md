# HL-12 ADP01: durable held provider journal

Local implementation on the continuing
`codex/xenios-health-launch-implementation-20260930` branch. This is not a
provider activation, independent Claude acceptance, managed qualification or
permission to deploy. The payment provider choice remains deferred.

Runtime source: `e9f221c974f45831a7ad1a13bcb2bd6d8198db42`.
Runtime tree: `30e570b77d19de0ebdb8b40765334a8f98cea5e0`.
Test-only tip: `9c1fe1eb49ccd956fa715a542e8c235e2b7d3efd`.
The foundation source is `5809b727617e3abe065df69e563374d13f2bcfa8`, with
tests `61a9306d053d13556cf8022b47c792a79ebee8b6`. The isolation repair is
`91a4e0e7ecae7f1ce83b13824413ea38be271e12`, tests `ebd081e3af153432d5c4015f277405f253cc7aaa`.
The final source/test pair adds the minimum database-authority revision check.
All three source commits and three test commits are pushed.

Release-control tip: `82950302a77754f0359ba5e1d31dad8ea677426f`.
Final aggregate evidence is pending. Do not infer the
previous HL11 aggregate applies to this runtime. Its separate receipt remains
`../master-offerings/HEALTH_HL11_QUALIFICATION_20261001.json`.

## Implemented boundary

This slice stores held attempts and authenticated-adapter event facts. It
does not settle payments. A scoped, named operator can reserve one exact
accepted quote through server-generated idempotency. SQL derives the immutable
amount and currency, verifies source revision/account/test-live scope and
the grant, and returns a held receipt. Browser money, actor, source and
idempotency fields are rejected.

An internal ingress boundary authenticates original bounded bytes through the
configured adapter. Only closed normalized facts and their SHA-256 digest reach
SQL. Raw bodies, signatures and headers remain volatile and are not persisted
or logged by this boundary. A durable receipt is required before success.
No external webhook route is mounted. Provider authentication in the tests is
synthetic, not evidence of a working card provider or bank integration.

SQL records incoming claims separately from established identities. Missing,
early, malformed, misbound, conflicting and unsupported events remain held
uncertainty. Exact replays do not append again. Known attempts hold their
request; unbound uncertainty holds consequential financial operations globally.
This conservative global hold has no release/resolution operation in this
foundation. It must not be enabled operationally without the remaining workflow.

The production source is `null` even if the new feature flag is set. The sole
new literal route is the guarded admin POST
`/api/admin/research/assisted-orders/:requestId/provider-attempts`; it remains
unavailable in production composition. No checkout session, provider execution,
observation, verification, paid/refunded status, email or fulfillment event is
created by this journal. The existing two-key financial-state contract remains
unchanged. Historical paid labels are never converted to invented evidence.

## Database and isolation repair

Pending migration:
`20261001085559_research_assisted_order_quote_provider_journal.sql`.
Exact canonical Git-blob SHA-256:
`15de2acb72835b520b1e902641e334643c18b7ea0ad9bcb8f6be4dca77668875`.
This successor replaces only unapplied source bytes; no managed history was
rewritten. The predecessor bytes/hash remain available at `5809b727`.

Five new tables have forced RLS and no direct anon/authenticated/service-role
access. Four exact service-role RPC signatures are public interfaces; helpers
remain private. Source identities are immutable, revocation cannot clear holds,
and installation creates no sources or operator grants. Existing finance,
quote, correction, N2 and consequential status guards share the uncertainty
check. Request-first then fence locking avoids a known-parent inversion;
initially unknown events never acquire a later-discovered request binding.

The first local READ COMMITTED proof passed, but a separate old-snapshot
reproduction found eight unsafe outcomes with REPEATABLE READ/SERIALIZABLE
readers against READ COMMITTED writers. Row locks did not advance their frozen
snapshots. That substantive failure is preserved as exit 1, not reclassified.
The successor requires the actual transaction mode to be READ COMMITTED before
covered provider authority or new financial decisions. It never changes the
caller setting or silently downgrades isolation. Replays and missing-request
early returns on the new provider doors also enforce this precondition.

The application additionally requires exact authority revision v2 and
`transactionIsolation: read_committed_only`. An older self-valid v1 SQL schema
cannot satisfy readiness for reservation, journal ingress or uncertainty reads.
The real old5809 schema is tested on a separate disposable database, not mocked
as broken: it successfully attests its own v1 seal, but the new mounted service
refuses before writes. Applying the successor over that old valid installation
refuses with SQL55000 and leaves its records unchanged. No silently adopted
upgrade or old managed installation is inferred. Exact source-byte preflight
remains mandatory even with the runtime capability check.

The unchanged eight-case reproduction now refuses every prohibited operation.
The permanent matrix also covers 21 unsupported-isolation refusals, positive
READ COMMITTED reserve/replay/manual verification/no-funds controls, and
unchanged financial rows. The generic mounted status path returns a bounded
409 for the exact new SQL error code/detail, without exposing database text.

The design follows the documented snapshot caveat and configurable PostgREST
isolation behavior, not an assumption about current hosted settings:
[PostgreSQL consistency checks](https://www.postgresql.org/docs/17/applevel-consistency.html)
and [PostgREST transaction isolation](https://postgrest.org/en/stable/references/transactions.html#isolation-level).
Managed preflight must verify actual role/function settings and effective
prerequisite guards as well as migration history.

Exact repeat installation checks a definition/schema/ACL seal without rewriting
records. Column privileges and inherited trigger enablement are included.
The seal detects drift; it is neither proof of provider facts nor protection
against arbitrary database-owner DDL. Rollback keeps all journal/attempt/hold
records with execution disabled and uses reviewed roll-forward, not deletion
or restoration of older financial functions.

## Evidence discipline

Authoritative tools use the private Windows x64 Node `v20.19.0`, npm `10.8.2`.
Official archive SHA-256:
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Commands invoke its full binary path and set PATH only for child processes.
The real catalog reader is enabled, not replaced by a stub.

The isolation-only comprehensive database run2 tested clean checkpoint
`00c9df370387620723891e25bf112b5ba1ce1589`, tree
`ec637adc79caca8321175751d7b1ae82a53b79a2`. It passed 131 core refusals,
14 actual lock-wait races, eight separate stale-snapshot cases, 21 unsupported
isolation refusals and positive READ COMMITTED controls. The composed HTTP
phases passed six plus one groups with 60 plus 15 service-role SQL calls.
Migration reapplication with populated history and both container cleanups
passed. Proof elapsed 232.403 seconds; wrapper elapsed 232.981 seconds, exit 0.
Log SHA-256: `4d31da496917ce4083c319cc9650397e2a132d5d461c318eb560691b6186f8e4`.
The sampled runner, main, isolation and HTTP child paths use the private pinned
Node binary; both HTTP phase reports also assert `v20.19.0` independently.
The subsequent final v2 legacy proof passed with one HTTP group/10 SQL calls;
its log SHA-256 is `16c6ec556052ffc0e46637346c3267981c313f6aa869e18c19117beaf06be4a5`.
Final v2 comprehensive run3 passed at clean
`a61ca3f98cef9759586b088989f99212b0082912`, tree
`3c42b804aa8167193efe00ec74dfcd38dc41b283`, in247.813 seconds (248.458 wrapper),
exit0. It includes131 core refusals/14 actual lock-wait races,8 stale-snapshot
cases/21 unsupported-isolation refusals and positive READ COMMITTED controls,
the actual old-v1 refusal/no-adoption proof, and8 HTTP groups/86 SQL calls.
Fresh/populated repeat installation and all3 sequential container cleanups pass.
Log SHA-256: `587ee43fce6a016659e2afd585ccedb244892fb8b6523f5797770af503658e92`.
The only commit during that run changed a coordination message, not source/tests.
Final aggregate qualification is pending. The preceding clean
preflight at `b5ed3db38cdb2482c3aaebc642cbdcb7f717bf62` passed 1058 affected tests,
typecheck, build, 50-node DAG, 460 registrations/451 callsites and release-control
51 pass/one conditional skip. No full aggregate was started before v2; those
preflight results are not relabeled as final v2 results.

Retain these separate development results:

- Initial Vitest command failed before tests because `--minWorkers` is not
  supported by the installed Vitest. The corrected command uses one worker
  and no file parallelism; the failed invocation remains exit 1.
- First HTTP reproduction: 26 pass / 3 fail. Two errors demonstrated the missing
  uncertainty-to-409 mapping; one was a colliding test URL identifier. Later
  passing runs do not replace this failure.
- Prior migration run1: 131 refusals, 14 actual lock-wait races and seven
  composed HTTP/SQL groups, 75 service-role calls. It does not cover the
  subsequently found isolation defect or final corrected migration bytes.
- Stale-snapshot reproduction: eight unsafe committed outcomes, exit 1.
  Log SHA-256 `9d18ffc2a5088d3bafa91acdd523baa96efe88b12402f7efd205762107781458`.
- The same reproduction after the narrow source repair: zero unsafe outcomes,
  exit 0. Log SHA-256 `e9a467a024ac3fdc72977c8df1fd80eaa72eb588d4e3c02088350b56819730d7`.
- Permanent isolation run1 failed a missing-request fixture with invalid UUID
  text after the eight stale-snapshot cases had correctly refused. Run2 fixes
  only the fixture and passes eight stale cases plus 21 unsupported-mode cases.
  The failed run remains separate, not a source regression or a clean run.

Disposable PostgreSQL 17.11 containers have no network and no published ports.
Synthetic owner setup and psql service-role transport exercise real SQL and
Express/service composition, but not managed Supabase defaults, PostgREST,
hosted JWT, actual provider signatures, bank authenticity or email delivery.
Rollback/response-loss checks are not physical crash recovery at every database
instruction. Child-process snapshots are sampled, not continuous attestation.

## Protection and independent-review boundary

No protection baseline was changed. Canonical Git-blob SHA-256 pairs are:

| Path | Pinned baseline | This source |
| --- | --- | --- |
| server/index.ts | `1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` | `6dafafe47d5da5b3933b6fc5e4c4d54929da7f530698bb257ef66e5757a81cfc` |
| server/research/index.ts | `b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070` | `5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188` |

The older owner approval at `663268f` is completed and not reused. The unchanged
assertion remains a release gate. Current `server/index.ts` adds the held-only
admin mount beyond the previously reviewed recovery wiring. Review these exact
bytes and the prior Research gateway separately; do not approve hashes blindly.

The latest fetched Claude branch tip is
`e7b74feb04567cac16d5b8bd089a7ae1218721d2`, whose report23 reviewed `915a535`, not
this successor or its F4/HIST-02/N2/HL11 predecessors. Local tests cannot close
independent findings. No assertion that Claude is running or has accepted this
candidate is made.

Report `docs/review/xenios-health-launch-review-20260930/23_REVIEW_915a535_SUCCESSOR.md`
at that reviewer commit is the independent authority, including its adjudication
rather than unadjusted individual lens severities:

| Finding | Independent result at 915a535 | Later local result, not independent closure |
| --- | --- | --- |
| HIST-PROG | Closed | Historical progression containment retained, not historical settlement |
| F7-R1, SQL-06, SQL-13, ROLL-06 | Closed | Preserve prior status, immutability, race and missing-RPC protections |
| SQL-01 | Closed | Provider facts still cannot create paid authority |
| F4/X3 | Open P2 | Durable effects/audit/recovery at 3562c03 awaits successor review |
| HIST-COPY, X2 | Open P3 | Account-history copy and uppercase UUID handling locally repaired at 3562c03 |
| HIST-02/HIST-02-R1 | Open P2 | Bounded quote reissue at 3da9095 awaits review |
| N2 | Open P2 | Positive never-received cancellation at cb9b8d6 only; refund/void/historical outcomes remain open |
| ADP-01 | Open latent P2 | This held foundation adds durable authority boundaries, not provider execution or settlement |
| F1 | Open P1 | Actual independent manual evidence adapter and operational grant procedure still absent |

HIST-FREEZE, ROLL-05, ROLL-06-R1/NEW-APP-ORDER, QUOTE-CONTRACT, ERR-ORDER,
AVAIL, TEST-GAP, GUARD-NEWSTATE, NEW-RECORD-*, CSP-02/03/04/05/08 and managed preflight/executor/history/role
qualifications remain visible for reconciliation. New bounded trigger,
truncation and seal checks do not automatically close every earlier
TRIG-ENABLED, TRUNC-EVID or POSTCHECK-COVERAGE observation. Report23's counts
were P0 none, P1 F1, P2 F4/N2/HIST-02/ADP-01. Those are dated predecessor
counts, not a current successor P0/P1/P2 adjudication.

## Managed prerequisites, not execution authorization

The exact DAG source blobs and SHA-256 values are in the qualification receipt.
The dependency order is ledger71 ->80 ->81 ->82 ->83 ->84 ->85 ->86, with
71 ->87 and 86+87 ->88 ->89 ->90 ->91. Ledger71 is historically recorded under
managed version20260819203614; 80 through91 are recorded pending. Neither
statement is a fresh managed observation. Canonical notification outbox ledger3
is an additional real prerequisite, not a newly added DAG node.

Before any authorized managed window, positively identify the non-production
project and hosted origin, inspect exact history/effective schema, and run the
bounded PII-free M71-only pre-80 check. Nonterminal historical-paid rows require
governed resolution or explicit acceptance of their freeze. Absence of an
observation is not a count of zero. Verify actual PostgREST transaction mode,
role/function overrides, function ownership/BYPASSRLS behavior, exact function,
table and column privileges, forced RLS and enabled guards. Verify the complete
canonical audit/outbox configuration without recording secrets.

Keep financial writes and all adapters/grants disabled during any separately
approved window. The recorded rollout requires at least84 before the successor
app; durable effects also require87/88, N2 requires90 and this provider boundary
requires91. Files80/81/83 lack their own BEGIN, so specify a transactional apply
mechanism per file; never assume the whole chain is atomic. Do not replay older
authority functions as rollback. Preserve every financial fact and use a
reviewed roll-forward repair. The synthetic roles, permissive default grants,
TRUNCATE grants and fixtures in the local harness must never be copied into a
managed project. No such window or operation is authorized by this handoff.

Provider selection, actual manual evidence authority/grants, provider execution
and settlement, void/refund/dispute resolution, historical reconciliation,
managed migration qualification, browser qualification and exact release
approval remain distinct work. HL11 now has 424 canonical / 423 customer rows;
its holds and price decisions are preserved. Product details and HL17 are next
public-journey work, without changing imagery ownership or commercial authority.

No deploy, merge, hosted configuration, managed migration, price release,
account grant, real email, money, procurement or clinical action was performed.
