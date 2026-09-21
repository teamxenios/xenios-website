# Native P1/P2 local closeout — 2026-09-21

## Scope and exact source

This continues Claude's incomplete checkpoint, not a new production release.
The original clean worktree and pushed `2b776f942aeb270fd0766ec036a2c275fa2e094d`
were preserved. Work continued in `C:/Users/sboad/projects/xenios-native-closeout-20260921`
on `codex/xenios-native-closeout-20260921` under the transferred
`XENIOS-NATIVE-FINISH-20260910` lease.

Application candidate: `6d1792c82a681b7537b6fefa3581b2c95a224bb4`.
Source tree: `2e03bcf6cf103cd4aa6d99351ad7f2301b66ea2c`.
Later record-only commits do not change the qualified application bytes.
The regression successor is `c559c4e7795fb211b082cf12bd791f93c1cd3851`:
its only changes above the application candidate are two exact-fixture review
JSON records and a test-only correction in `commerce-consent.test.ts`.
There are no production runtime changes, so the immutable application build
and its 204 browser captures remain bound to `6d1792c`.

Local application qualification is complete; managed release remains blocked.
The exact source, test successor and evidence are below. No managed database, production environment,
feature flag, notification provider, payment provider, or real-user account
was changed. Production observations in the September 14 RC remain historical;
this continuation did not freshly verify the deployed SHA or live schema.

## What was actually closed

| Area | Corrected local result |
|---|---|
| Admin orders | Mounted page now decodes the actual camel-case service/route DTO. All canonical states, search, pagination, null captured money, and failed-source semantics are covered. An unconfigured source returns unavailable, never a false empty queue. |
| Questions | Real mounted read/answer flow qualified through canonical guards; unknown prototype-like status names refused. An unavailable inbox hides stale rows and never claims zero waiting. |
| Document bytes | Claude's one production private-byte reader remains shared by its two consumers; no second storage authority was introduced. Member bearer is confined to same-origin document ticket/completion calls, never signed storage PUTs. No real upload was performed. |
| Referral V1 | Disabled capability now also refuses previously issued cookies. The touch lookup candidate is executable and guarded, rather than a helper plus manual dispatcher instructions. Referral V1 remains the only mounted `xr_aff` authority. |
| Order history | Native paid orders and Early Access history retain their authorities. Early Access tracking selects the highest canonical event sequence and rejects ambiguous/foreign facts. Member and account histories now also expose owned XRR requests as a separate collection, not fabricated paid orders. |
| XRR truth | Unpriced requests show “Price on request,” never zero. Opaque operator tracking is plain text, not proof of delivery or payment. Per-read source metadata distinguishes unavailable and truncated histories from complete empty results. |
| XRR authorization | Status calls use only the new guarded customer-status RPC. There is no fallback to the legacy nullable-authorization function if the new RPC is missing. Principal/reference changes discard stale client results. |
| Admin navigation | Removed advertised Plans and Privacy queues with no GET authority, plus unavailable customer-record links. Retained working account inspection/approval and referral-integrity actions. Legacy route constants remain; no alternate fulfillment authority was mounted. |
| Browser defects | Corrected narrow-screen overflow and undersized controls, made data-table scrolling explicitly keyboard accessible, and bounded unsuccessful API-body cleanup. Unavailable-state browser checks retain exact URL/status/body-hash/count assertions. |
| P2 public truth | Kept bounded Care availability, support/profile/security copy and command-center destination corrections; added the previously omitted Care how-it-works/provider-review routes to browser inventory. |

## Security finding and SQL boundary

A fresh disposable PostgreSQL database loaded the canonical M71 source and
reproduced two unauthorized reads caused by SQL three-valued logic:
`IF NOT v_authorized` does not deny a NULL value. This is a verified defect in
the canonical source, **not a newly observed live-production exposure**.

`supabase/candidates/20260921_research_assisted_order_member_history.sql` pins
the exact predecessor function body (normalized MD5
`1895ece151ffc91a5495548b25adb3b9`) and changes the authorization guard to
`IF v_authorized IS NOT TRUE`. It preserves the remainder, owner, ACL, function
configuration and signature, and installs service-only history/status readers.
FORCE RLS, BYPASSRLS ownership, inherited/direct grants, existing signatures,
the canonical member index, and replay/drift conditions are checked before
the atomic change. Canonical migration bytes were not edited or re-registered.

The new history read is bounded to 100 requests with a sentinel for truncation,
and canonical 200-line requests with an oversize sentinel. Server decoding
validates every row's member ownership and strips the internal ownership proof.
Wrong-owner, missing/expired/revoked credentials, privilege drift, malformed
rows and absent RPCs fail closed. Rollback of the new readers must retain the
authorization fix; restoring the known NULL guard is prohibited.

Both this SQL and
`supabase/candidates/20260914_research_referral_v1_touch_attribution.sql` remain
**unapplied managed candidates**. Deploying application code without the new
XRR RPC intentionally makes status/history unavailable; the unsafe legacy
fallback is not a deployment compatibility option.

## Qualification and evidence

Evidence root (external to Git):
`C:/Users/sboad/xenios-recovery/codex-native-closeout-20260921`.
All browser identities/data are synthetic. A loopback-only server/network
boundary blocks external access; payment is disabled and notifications are
local intents. The native harness runs real SPA pages, canonical auth guards,
questions and commerce registrars/services, and account projections against
declared synthetic Auth/database transport. It is not hosted Supabase proof.

| Gate | Result |
|---|---|
| Exact clean candidate build, pinned Node 20.19.0 / npm 10.8.2 | Passed; 346 distribution files; inventory SHA256 `263e6945bdac3647c971cab8092f36dd5eaa4c9b8e4e9f2e82caaa51c539a9a5`; built 2026-09-21T15:49:30.772Z |
| Full Vitest suite, clean `c559c4e` test successor | Passed: 957 files / 17,896 tests passed, six files / 71 tests skipped, zero failures; 792.15 seconds. `full-suite-c559c4e.log`, SHA256 `eb8d6a5089f3975eff69bfb6169b4e399fac83c49d9f8bd33369a9342f2904dd` |
| Final application typecheck | Passed on clean `c559c4e`, exit 0, 102.618 seconds |
| Native authenticated browser-plus-API workflow | Passed: 84 captures, five journey checkpoints, zero failed captures; exact clean source/build binding; zero off-origin attempts and external mutations; one process-local notification intent only |
| Public/signed-out browser matrix | Passed: 120/120 captures across ten routes, zero failures, exact `6d1792c` build |
| Referral touch candidate, fresh disposable PostgreSQL | 12 passed |
| XRR candidate, fresh disposable PostgreSQL | 13 passed; `xrr-database-final.log`, SHA256 `c0c27f2a254ec34151a73925fe9ad2ed33d36ca7c07167e88118af2c60a99ecf` |
| Focused XRR server/client and navigation checks | 212 server, 296 client, 78 navigation tests passed; subsequent boundary/upload checks passed |
| Extended native harness API workflow | Passed on clean `6d1792c`, including both histories, null estimate, opaque tracking, other-member isolation and source failure; `native-api-6d1792c.log`, SHA256 `06750374c916dd2829bd1d5e203df00539a7ab715e8938ef455cb48891c41e82` |
| Route uniqueness, migration DAG, protected seams, release control plane | Passed: 447 route registrations / 438 callsites, 36 migration nodes with canonical checksums, 65 changed files / 28 protected hashes, release-control-plane typecheck exit 0. Scanner unit tests 8/8 and site-record node unit tests 12/12 passed. |
| Strict diff scan | Passed at test successor `c559c4e7795fb211b082cf12bd791f93c1cd3851`: 41,666 added lines / 268 files; 10 raw matches, 10 independently reviewed exact synthetic matches, zero unresolved secrets and zero bounded PII-name matches. `strict-scan-c559c4e.log`, SHA256 `673ff0e52e45cf19d7160f6f55db644284aea78a9415c81cb8b70a865868470a`. Record-successor checks are recorded in the continuation receipt below. |
| Production-state release verifier | BLOCKED, exit 1: trusted release identity absent, trusted ownership base invalid, dated production evidence stale. No trusted value or fresh observation was fabricated. `final-c559c4e-production-state.log`, SHA256 `357448d7a7eb731f296f3eeaad8fdd02fbda114f80b0d695ee61293e4083afca`. This is not a production-qualified release. |
| Continuity and generated site records | Continuity validation passed. Exact committed generated-record checks and final record-successor scan results are retained in `.xenios/handoffs/2026-09-21-XENIOS-NATIVE-FINISH-FINAL_GATES.json`; application/test evidence stays bound to the immutable SHAs above. |

The native browser-plus-API workflow covers actual admin sign-in, question
roster → detail → answer, order processing → tracking → fulfillment, source
failures, logout, and rendered member/account request histories. Fulfilled-order
member readback and wrong-member denial are API assertions, not separate
rendered-page captures. Nine
viewport widths plus zoom, reduced motion and forced colors are exercised on
the populated pages. Public/signed-out coverage is bounded to ten relevant
routes, not a claim of the entire site's release matrix.
The native driver's zoom variant uses a 720 CSS-pixel viewport at device scale
factor 2; it is a zoom proxy, not proof of actual browser zoom or complete WCAG
conformance.

Earlier failed runs are retained, not relabeled as passes: the first full suite
had one 5-second `pgcrypto-qualification` repository-scan timeout during
concurrent dependency-install/build I/O (its isolated rerun passed 17 tests).
The `f6497d4` and `25a8ff3` browser runs exposed layout/focus defects and a
too-short unavailable-read settling window; those diagnostics remain in the
evidence root. The earlier 120-capture public run at `25a8ff3` passed but does
not substitute for final exact-candidate evidence.
At `bb06706`, all 58 admin captures and all 120 public/signed-out captures
passed. The expanded member run found 18 undersized member-navigation targets,
and the account run exposed an incorrect synthetic access-state envelope.
Both were corrected in `6d1792c`; the account regression was independently
reproduced and checked through cold navigation. The in-progress `bb06706`
full suite was intentionally interrupted because source was changing, and is
not presented as exact-source acceptance evidence.
The first final-build browser attempt started before its preview became ready
and failed with local ECONNREFUSED, before any capture. A four-worker full-suite
attempt during parallel browser startup coincided with a host-wide stall
(simple status commands took over 230 seconds); one clinical middleware test
reported a 230-second failure. That run was stopped and preserved as
interrupted, not passed. Final browser and regression gates are sequenced with
lower load; the final results above must come from completed replacement runs.
The isolated `6d1792c` suite completed in 943.83 seconds: 956 files and 17,895
tests passed, one test failed, and six files / 71 tests were skipped. Its only
failure was a stale adapter test that expected a finite HTML response to be
cancelled. The real API intentionally drains it. The original failed receipt
is `full-suite-6d1792c-isolated.log`, SHA256
`abbd5e43330de6d4dcb9ef716f8ef03715e58ec067c662878cbab948f3bdc07a`.
The unavailable/network assertions already passed; the obsolete mock exposed
`cancel()` but no readable stream. The test-only successor uses a real finite
Response and verifies body consumption, lock release, no JSON parsing and no
cancellation. Its focused 145 tests pass; no production behavior or scanner
rule was changed to make that assertion pass. Final full-suite qualification
uses the corrected test successor.

The full-suite skip scope is explicit: 68 tests in six wholly skipped files,
plus three individual tests. Two Referral V1 PostgreSQL suites (16 baseline
tests and 12 new touch-attribution tests) require explicit disposable-DB opt-in;
two other database suites
(four restart and 21 Early Access commerce tests) need `XENIOS_TEST_PG_URL`.
Twelve workbook tests require absent private intake, and three subscription
transition tests require an absent DB-owner migration packet. Two individual
Docker/PostgreSQL 16 verifiers require CI or their explicit opt-in flag. The
last skipped case is the “catalog absent” branch because the committed catalog
is present; its real-catalog suites run. All eight baseline files and skip
guards are byte-unchanged from Claude's `2b776f9`. The only newly added skipped
suite is the touch-attribution suite, separately executed and passed 12/12 on
fresh disposable PostgreSQL. These skips are not claimed as full managed DB,
private-workbook or Docker qualification.

The initial raw strict scan (`c545a70` → `bb06706`) covered 41,410 added lines
across 265 files and failed on ten generic assigned-secret shapes, with zero
bounded PII-name matches. Two independent source-context reviews found all ten
to be explicit synthetic tests or isolated loopback-preview credentials. The
existing scanner was not changed: the new registry binds exact line hashes,
occurrence counts, full-file hashes and source ancestry. Its raw failure stays
preserved privately. See `REVIEWED_SYNTHETIC_CREDENTIALS_6d1792c.json` and
`synthetic-credential-context-review-6d1792c.json`; registry LF SHA256
`cd0284bba3f386361312e47be18bbc130e0f069cc30262154c03da486b36a27b`.
The approved external V3 input is unchanged (SHA256
`27fb9d7052867808f8cee5f3147fa34855fad0d893a6a14508b9212198ce4fbb`).
Neither the input contents nor raw names are stored in this repository.

The synthetic API/preview startup also logs a service-key self-check connection
refusal against its own not-yet-listening loopback port. This is a declared
local fixture startup diagnostic, not a real credential failure; the completed
API assertions and network-boundary results determine local acceptance.

Final native receipt:
`browser-6d1792c-b/native-closeout-browser-results.json`, SHA256
`4114b088b3f70f85998b096939fe22da914f757282dec0b8fcec19ad42257036`.
It records `acceptanceEligible: true`, a clean checkout with the exact build
tree, and unchanged source/distribution inventories. Representative desktop
account history and 320px member history screenshots were visually inspected,
in addition to the automated geometry, target, focus, console and network
checks. The driver closed its browser and the owned native preview was stopped.

Final public/signed-out receipt:
`public-member-6d1792c-a/browser-matrix.json`, SHA256
`16d01441ef9eea3075990c78958915f42c3b8b166a81da1f8c8993f84296831e`.
The ten routes were `/care`, `/care/schedule`, `/care/how-it-works`,
`/care/provider-review`, `/research/account/support`, `/research/account/profile`,
`/research/account/security`, `/research/account/interests`, `/admin/research`
and `/admin/research/fulfillment`. Each has nine widths plus the configured
zoom/media variants. Source and build receipts remain preserved outside Git.

## Remaining release prerequisites

1. Obtain fresh production observations and externally trusted release/ownership
   identities, then pass the currently blocked production-state verifier.
   Review and qualify the exact two new SQL candidates against the actual
   managed predecessor, with a named authorized executor and recorded
   installation/postchecks. Do not blindly replay canonical migrations.
2. Complete the separate hosted checkout qualification packet, including the
   candidate-2 amendment, staging/test-provider credentials and approved
   synthetic identities. Local seeded captured state is not a provider charge.
3. Retain the exact private V3 scan input and its accepted coverage limits:
   13 entries, six eligible and seven ignored by the existing full-name rule;
   historical/team/image-only/handwritten coverage is incomplete. Final strict
   scanning must pass with only independently reviewed exact synthetic matches,
   never a blanket file exemption or a fabricated input corpus.
4. Resolve the canonical partner → partner's own Early Access customer mapping
   and server-owned hold-rate/idempotence contract before wiring the EA grant
   writer. Neither a browser value nor a partner UUID can replace that authority.
5. Keep clinical/provider/jurisdiction activation separately gated. This
   engineering closeout does not approve care delivery or provider activation.

See `EA_REFERRAL_GRANT_BLOCKER_20260914.md` for the money-bearing schema
boundary and `docs/native-finish/HOSTED_EXECUTION_PACKET_20260911.md` for the
separate hosted checkout work. These prerequisites are not marked complete by
passing source tests, local PostgreSQL, or browser simulations.
