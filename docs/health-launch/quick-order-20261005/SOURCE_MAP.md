# Source completeness and evidence boundaries

| New leased source | Implemented behavior | Remaining qualification |
| --- | --- | --- |
| `client/src/research/quick-order/QuickOrderPage.tsx`, `contracts.ts`, `quick-order.css` | Native PublicShell page, exact field/enumeration contract, per-variant limits, review, strict receipt parsing, safe field errors, memory-only session lifecycle and immutable uncertain-attempt retries | No protected route mount; no full-App browser captures or live auth. Props require qualified canonical auth transport and session boundary. |
| `client/src/research/quick-order/OperatorDeclarations.tsx` | Text-safe declared/trusted evidence fragment with next action, no network/authority side effects or admin styles | No actual canonical reader or admin mount. Component fixture tests are not operator readback proof. |
| `server/research/health/quick-order/core.mjs` | Closed-shape normalized input, canonical quantity/version checks, strict public projection, estimated known subtotal and declaration evidence | Pure preflight; not an atomic database guard. |
| `server/research/health/quick-order/handler.mjs` | Exact-origin authenticated/rate-limited JSON API, timing-safe CSRF comparison, raw/upstream64KiB handling, replay before new-write legal/catalog gates, strict persisted receipt envelope, recovery token despite config outage | Fake-port HTTP tests only. Approved production composition/raw-body ordering and canonical durable implementation absent. |
| `server/research/health/quick-order/catalog.ts` | Actual master-offering callbacks, exact viewer passed through, Health visibility filter before public totals, bounded complete scans, duplicate/drift checks, per-variant pagination24, Care price suppression and mandatory destination authority | Caller must bind governed Health visibility/destination sources. Double scanning/content hashing does not provide transactional currentness. |
| `server/research/health/quick-order/legal.ts` | Published canonical legal reader plus three canonical always-required operational acknowledgments, exact Health-applicability approval required | Existing research-use policy is not automatically appropriate for Health. No approved Health pair configured. |
| `server/research/health/quick-order/production.ts` | Canonical customer resolver, stable account actor, session-bound CSRF, canonical config/catalog calls and distributed limiter with deny-on-failure | `productionReady:false`, config disabled, durable commit always refused. `getExisting` requires an absent canonical extension. No hidden enabling environment flag. |
| `server/research/health/quick-order/ports.ts` and `.d.mts` files | Typed boundary and explicit extension contract | Types alone do not implement persistence. |
| `server/research/health/quick-order/containment.ts` | Default-off raw middleware returning private503 JSON without parsing/logging customer bodies | New code only; root mount is the unapplied protected patch. Express miniature HTTP test is not actual App proof. |

Catalog fixtures exercise the actual existing
`createAssistedOrderMasterCatalogCallbacks` with synthetic authority/storage:
241 canonical offerings, 160 viewer-authorized variants, seven public pages of24
(last16), exact identity resolution after item100, filtered search and no private
counts. These are fixture cardinalities, not the live catalog size or proof that
all historical423 targets belong in Health. Current production contents were not
queried. Unknown authority remains closed, provider/RUO/held/classification-pending
lines cannot be submitted, and no quantity maximum is raised.

The Node handler tests use fake storage/transport. They test actor/key behavior,
parallel retries, response loss, malformed success and notification-observer
failure at the handler contract only. They do not prove real two-worker SQL
serialization, rollback/restart, an atomic notification obligation or operator
access. These remain mandatory on the canonical extension.

The initial package baseline is reused prior-session evidence on the unchanged
package manifest. New diagnostic runs are labeled dirty-source. Final focused
runs must name a committed source/tree and preserve before/after source hashes.
No deployment, managed migration, customer request, real email/SMS, payment,
partner grant or clinical action is part of this source lane.
