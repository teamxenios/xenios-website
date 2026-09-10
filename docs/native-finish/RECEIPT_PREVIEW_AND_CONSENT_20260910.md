# Receipt preview and bounded consent corrections

Parent/evidence source: `f5ec4585a049c52817424257e1b95fbe1ec61429`.
These changes continue the native finish; they neither activate checkout nor
authorize a notification or remote database operation.

## Implemented

- `receipt-repair-production.ts` composes the existing receipt repair engine
  with strict, injected SELECT-only readers for committed executions, canonical
  orders, member identity and exact outbox events. It never constructs an Auth
  singleton, imports the dispatcher, starts a worker or resolves credentials.
- One pass is bounded to 1..200 executions, with exact timestamp/UUID keyset
  pagination. Original PostgreSQL microseconds survive cursor round trips;
  ordering comparisons use bigint microseconds, not lossy Date serialization.
- Missing, ambiguous, malformed or mismatched monetary/identity facts cannot
  become a preview success. Empty discovery must be an actual empty result;
  provider read errors cannot be reported as an empty successful pass.
- Preview requires an explicit cutoff and canonical site origin. Output is
  counts and a cursor, not recipients, order payloads or provider references.
- Queue mode is rejected before reads. Even an unexpected engine enqueue call
  fails the pass. No additional queue, idempotency authority or guessed legacy
  receipt-key alias was introduced.
- The pure credit-policy calculator now rejects an unsafe subtotal+shipping
  sum before credit could mask it. Existing policy choices and consent behavior
  are unchanged; this module still has no production caller.
- New durable submissions now reject malformed/unsafe supplied expected totals
  rather than ignoring non-number values. This occurs before order/inventory/
  provider mutations. Existing omitted-value compatibility remains; this is
  not completion of mandatory total/credit/policy consent integration.

## Actual evidence

External receipt root:
`C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`.
Tests used pinned Node 20.19.0, Vitest 4.1.10 and TypeScript 5.6.3.

| Check | Result |
| --- | --- |
| Unsafe-gross regression before correction | 31 passed / eight failed; original 27 tests retained. |
| Unsafe-gross correction | 39 passed / zero failed. |
| Supplied-total regression before correction | 23 passed / eight failed. |
| Supplied-total plus credit-policy correction | 70 passed / zero failed. |
| Initial preview/engine focused run | 177 passed / zero failed. An earlier unsupported `--minWorkers` launcher attempt ran no tests and produced no JSON. |
| Initial main typecheck | Exit 2: new preview limit needed explicit type narrowing; receipt `7b14c4` preserves the five diagnostics. |
| Explicit type guard rerun | 177 passed / zero failed. No cast or validation weakening. |
| Actual installed SDK contact test added | 178 passed / zero failed (134 preview + 44 engine). Supabase JS 2.108.2 with injected synthetic GET responses, no network/Auth/RPC/write. |
| Main typecheck with actual SDK assignment | Exit 0; tool receipt `1550fd`. No `any` cast of the SDK client. |
| Broader commerce plus credit-policy run | 1,560 passed, three skipped, zero failed; exit 0. |

The SDK contact case verifies all four encoded PostgREST URLs, including
microsecond keyset filtering. Fallback fetch and socket construction are refused.
This is SDK serialization/contact-surface evidence, NOT managed PostgREST,
database privilege, provider payment, browser or production qualification.

Main read the two worker-authored files and the final SDK test. Independent
reviewer `/root/native_finish_review` accepted preview runtime, pure arithmetic
and supplied-total corrections. Runtime LF SHA-256 bindings:

- Preview: `7412c558e34655c41808a606a3f4163129d69047da8660c0c7eeeded061b0801`.
- Credit policy: `83211358f1f028537ae1987764c3a26950afe5e000f0f779149c2b0451c6cf11`.
- Durable submission: `9e4cca372f8590baaae03ea71b43fc366778adc09733c20799b4a8e2f3f2e81c`.

Receipt SHA-256:

- `credit-policy-gross-before.json`: `d9da5a737d32c11768d413441da944641f779b9e115a6afe911c5d34c4db09dd`.
- `credit-policy-gross-after.json`: `5fa657542a1690b75cbe57bccb610612f6f841a38c6f643b44988503127de389`.
- `checkout-consent-before.json`: `2fb9a87c4050834071ccd86776688e7ac31d89be83896a8c2848dcd2e2ceca75`.
- `checkout-consent-policy-after.json`: `1e7d233b6eb5211f212d34587ccaae29b1e44db88a3c56f4b9f2546016719182`.
- `receipt-preview-focused-first.json`: `1d90bda40f1fd15e193d4de985f39515a42815f845423b08aa96ec0b1037bba4`.
- `receipt-preview-focused-typeguard.json`: `bca1442f99eebb96881fe66f3fe2914881a837e07a89c76f29abc897fc851058`.
- `receipt-preview-focused-sdk.json`: `75c618a68adce36502899d455e91a033d22b01248d5303776d0f5b889286e95a`.
- `commerce-receipt-consent-final.json`: `5822a4db4876f638762c59381a1b466a734dca7be2527b36888cb501cb6916d9`.

## Boundaries and continuation

An existing outbox event is not delivery proof and can be permanently failed.
Queue activation still needs reviewed cutoff, alias coverage, target/effects,
dispatcher readiness and refund-at-dispatch treatment. A disabled renderer can
consume retries; queueing is not a preview technique. This adapter has no CLI or
scheduled production caller yet and must not be called an operational mailer.

Research sender identity was not changed: the existing Health sender task
expressly preserved distinct Research mail. Final activation must respect the
actual approved audience/brand scope, not infer it from an informal label.

All SQL bytes remain identical to application 2604286. Its accepted local PG17
concurrency proof remains correctly bound to those bytes. The 16,567-pass full
suite belongs to 2604286, not this later runtime. Full integrated release,
managed/browser/provider qualification and production authority remain separate.

Continue with existing operational recovery/receipt entry points and canonical
credit consent/full-credit/refund requirements, without weakening gates or
inventing business policy. Staging SQL access and approved checkout/provider
fixtures remain external dependencies. No remote write, real notification,
account change, payment, shipment, deployment or activation occurred.
