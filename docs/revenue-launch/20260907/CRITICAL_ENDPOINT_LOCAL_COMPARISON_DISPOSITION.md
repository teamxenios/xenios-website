# Resource Hub candidate: local critical-endpoint comparison disposition

**NOT QUALIFIED. The strict comparison remains REGRESSION: 27 SAME, 3 REGRESSION, zero waivers.** The static follow-up found no direct source changes in the three affected Care handlers or their inspected dependencies. That finding does not establish production parity or convert the result to PASS.

The existing 30 unauthenticated GETs ran against the unchanged production bundle on 2026-09-07 at 23:42 UTC. The checkout was `46782cd4f0f73975c021c3a605492aa022c7d4dc`, tree `6e7965d91ba4a01e416bcc1a7485b0cde80acf27`. Bundle SHA-256 was `c2b0fde79855c5fadaff552ecd5d9e8c832b50544248c0a8adf3b1568e2c171c`; checkout identity is not a new build attestation. The baseline was the existing `critical-endpoints-live-ff3c496.json`, captured at 23:08:47.726 UTC, SHA-256 `8999379bbd5d2eb1124ffb265e36048880e66d8dd0f91154cbdff25627a7f81f`.

| Route | Observation | Actual handler and dependency |
| --- | --- | --- |
| `GET /api/care/status` | Live 200; local status 0 after 10,012 ms. | `server/care/index.ts:97` awaits `loadCapabilityStatus`. `server/care/production-deps.ts:52` delegates to the `care_capabilities` read at line 128, through `server/supabase.ts:54`. |
| `GET /api/care/access-request/status` | Both 200; `acceptingRequests=true` became false. | `server/care/manual-access.ts:281` calls readiness at line 239 and availability at line 91. Readiness requires Supabase configuration and an available email API key from `server/services/email-config.ts:66`. |
| `GET /api/care/tebra/configuration` | Live 200; local status 0 after 10,002 ms. | `server/care/index.ts:117` first awaits the same capability read. It then uses `server/care/tebra-scheduling.ts:362`; its error fallback can run only after the capability promise settles. |

Production registration is `server/index.ts:483` and `server/index.ts:489`. Route constants are in `shared/care/contracts.ts:98`, `shared/care/manual-access.ts:3` and `shared/care/tebra-experience.ts:1`.

## Static comparison and observed local configuration

Git blob comparisons from live baseline `ff3c496245739233b71e46f9e5d6e26af9d57017` to the captured checkout found all **18 inspected source files identical**, including root registration, Care route handlers, Supabase client construction, capability resolution, Tebra configuration, email resolution, Care middleware and shared contracts. The companion receipt records both blob IDs for each file. Seven relevant dependency lock entries were unchanged and matched installed versions: Supabase/PostgREST/Auth/Realtime 2.108.2, Express 5.2.1, ws 8.21.0 and Resend 4.8.0. The package-file diff added only qrcode-generator 2.0.4 and jsqr 1.4.0.

The child had no `CARE_ENABLED`, `CARE_ENABLE_APPROVED`, `TEBRA_*`, `DATABASE_URL`, `RESEND_API_KEY`, or Replit connector credentials. Hub, founding activation, membership billing, both referral flags, commerce and Early Access cart were explicitly false. Research public/indexable flags were false. The exact remaining nonsecret boolean configuration is preserved in the companion receipt; it is a local allowlist, not an attestation of live environment values.

Starting with no Supabase configuration failed with the actual missing-admin-configuration error. The successful local startup used synthetic keys and an owned loopback refusal provider: Auth returned 401 and data requests returned 503. It did not return successful authentication or live rows. No production environment inspection occurred in this follow-up. The live HTTP baseline proves only its observed feature states: Care disabled, requests accepted, and Tebra unavailable; it does not enumerate the live environment.

**Inference:** both affected capability reads received fixture 503 responses. Installed PostgREST retries 503 through a `setTimeout` sleep (`PostgrestBuilder.ts:24`, `:371`; retryable statuses in `types/common/common.ts:25`). Instrumentation suppressed two 1,000 ms timers, leaving those promises pending until the capture's 10-second timeout. Separately, absent email inputs produce false readiness under the unchanged manual-access handler. These facts explain the observed local conditions; they do not prove absence of other runtime regressions.

## Controls, limitations and evidence

The actual application listener was `127.0.0.1:59072`. Exactly the existing 30 GETs were admitted; no credentials or redirects were used. Timer callbacks executed: zero. Three GETs reached only the owned refusal provider; one unattributed POST attempt was denied before transmission. Both children terminated, enforcement receipts reconciled, and distribution plus the two approved runtime JSON hashes remained unchanged. No production query, write, account action, notification or deployment occurred.

The denied POST's trace records method, owned loopback host/port and refusal only: no path, callsite or timestamp. Its exact path, purpose and startup provenance are therefore **unknown**; earlier shorthand calling it a startup POST is withdrawn. No request was made to reproduce it. The unchanged startup calls `startOutboxWorker` at `server/index.ts:1299`; unchanged `server/research/outbox.ts:609–620` only schedules an interval, with no immediate tick. Its blob is `d966c3d7c51c34b2e840d13e13c95f0e18bd1f48` at both compared commits. Zero timer callbacks means this receipt does not show its scheduled job execution. No smoke job was invoked or authorized, and the denied request cannot be attributed to one from the retained evidence.

This was instrumentation of a known application, not OS containment for arbitrary code. Suppressing timers alters retry behavior. Native addon loading and an optional generated master-offering bindings read were refused. No enabled Resource Hub adapter, storage, authenticated journey, production provider, job or notification is qualified.

The sanitized companion is `critical-endpoints-local-static-disposition.json`. Full original captures, strict differences, instrumentation, logs, and earlier failed attempts remain unchanged under `CODEX_HOME/tmp/xenios-resource-endpoint-comparison-20260907/`; their hashes are indexed in the companion. This follow-up performed static reads and receipt preparation only: no new launch, build, fixture or test run. Candidate endpoint parity remains open, with founder boundaries unchanged.
