# Quick Order composition test source — 2026-10-06

Status: four new test files authored under Samuel's source-only approval
`dc3329bb2cfb3b93d8d054c8bbc77a291df0e671`, scope packet
`1d4f2c3b3ff2fc0e1bc25495d3076d2bd9a76e99`. The coordinator separately sequenced
this slice after shared-source records `4669493ba48c2afbdfb844813cfc066442ddd78d`.
Same builder, session, task and lease. No execution or independent acceptance.

Pushed source: `5fd2e4c74d31562281493013489bb41949979b88`.
Source tree: `99ca9ae54298a30c860cfea924d08797a1dc4c9e`.
Exact inventory: `evidence/composition-source-5fd2e4c.json`.

The source checkpoint and exact four-file inventory are recorded in the
composition source evidence JSON beside this document. All fifteen read-only
reference hashes remain frozen. Every pre-existing file in the accepted Quick
Order module is preserved; its directory trees necessarily change by the four
new test files. Do not claim whole-directory identity with the earlier module.

## Authored coverage and synthetic boundaries

| New source | Actual composition | Explicit synthetic boundary / limit |
| --- | --- | --- |
| `QuickOrderApp.composition.test.tsx` | Default App, lazy QuickOrderPage, PublicShell, privacy functions and sibling PwaLifecycle; unavailable state; no collection/transport; one header/main/footer; root/Research/Care controls | jsdom, credential-free public-config and paused Care responses, browser primitives, install/worker event objects and full-document navigation recorder. No real Auth, browser navigation, service worker or build proof. Owned page/shell/privacy/PWA implementations are not replaced. |
| `static-document.test.ts` | Actual serveStatic and raw HTTP document policy; direct GET/HEAD, refresh, private metadata, privacy headers, public and Access Hub controls | A temporary synthetic built shell and files; no production build or browser. Cleanup restricted to the owned temporary root. |
| `vite-document.test.ts` | Actual setupVite, actual client HTML read, real fallback and document policy | Vite server/transform transport is mocked. Composition unit coverage only; no real Vite, HMR or browser qualification. |
| `root-composition.test.ts` | Actual server/index.ts child; raw target refusals before JSON parsing/fallback; malformed and greater-than-2MiB body controls; actual health/static/redirect/Kairos controls | Fresh OS/environment allowlist, temporary synthetic static shell and loopback Kairos dependency. Storage/Auth/provider credentials unavailable; no provider transport credentials inherited. Direct Node with installed tsx import entry; bounded startup/probes/output/exit receipts and owned cleanup. Actual listener remains 0.0.0.0, while probes/dependencies use loopback. No claim of root loopback binding or network sandbox. |

The root test uses literal `node:http` request targets, including absolute-form,
separator/case/dot-segment variants. It does not replace the root with a small
Express app. Black-box HTTP cannot directly observe `req.rawBody` allocation:
malformed/oversized contrast supplies behavior evidence when executed, while
unchanged root source and the separate containment unit spies address ordering.
No child, HTTP fixture, loader, test function or output receipt has run yet.

## Concrete runtime amendment — NOT APPLIED

Source inspection identified a gap in `server/static.ts`: `sendRawHttpDocument`
adds no-store/no-cache/no-referrer only for `/status`. Both static and Vite
Quick Order documents therefore lack the required privacy headers in the
frozen source. The new tests keep the required assertions; this is a predicted
failure from source inspection, **not an observed red test**.

`DOCUMENT_PRIVACY_HEADERS_AMENDMENT_PROPOSED_20261006.patch` reuses the existing
`isHealthIntakePath` predicate for these exact headers:

- `Cache-Control: no-store, private`
- `Pragma: no-cache`
- `Referrer-Policy: no-referrer`

It preserves `/status`'s existing header values and changes no Vite runtime.
Bindings (SHA256 over UTF-8 normalized to LF):

- Before static.ts: `b7a7641752b74a557664c9119130431fa3e68c0b2a31acce5ddab0c8283d9f94`
- Proposed after: `9a3cf7068562184ef84f3b0a54fff5763e0d563e89c237bcba6d95dab0cbd940`
- Exact patch: `8392d24308c3dc106c00317f4cd9550d94e956d008051c617c0126d610330fa9`

The patch has an apply-check only. Runtime remains unchanged pending exact scope
disposition. The prior provider-journal fixture amendment remains separately
unapplied; its extra path is still awaiting Samuel's recorded answer.

## Evidence and remaining authority

Static metadata checks cover frozen reference hashes, ownership, the exact
four-source-path delta, retained pre-existing Quick Order files and Git whitespace.
These are not syntax, type, test, build or production qualification. Literal
unified patch artifacts retain hash-bound bytes; whitespace checks exclude the
patch artifacts if their context-only blank lines are flagged.

Tests, child processes, syntax/type checks, builds, Vite, browser, database calls,
resource checks, provider delivery and production mutations: **NOT RUN**.
No new qualification slot, cleanup, application shutdown or memory observation.
G1 remains consumed/refused/released at 2026-10-06T17:54:58.1429186Z,
1205MiB below 1536MiB, zero tests. The historical 934MiB observation is not current
memory. The original S5 expiry remains 2026-10-06T21:43:37Z.

The mandatory original HTTP red/green pair remains pending and separate. These
composition tests cannot replace it or be pooled with older results. The original
Claude acceptance owner remains unchanged; no fresh acceptance result exists.
Customer intake remains unavailable. Protected acceptance, durable currentness
and atomic persistence, installed/qualified operator reader, applicable Health
authorities, notifications, payments and production release retain their holds.
