# One-file document privacy correction — source decision pending

Source inspection found that the shared document response helper sets privacy
headers only for `/status`. The static and Vite Quick Order document paths both
use that helper. The four approved composition tests retain the required header
assertions; none has been run, so this is a source finding, not an executed failure.

Proposed additional source path: `server/static.ts`, owned by the same builder
only after a conflict-free exact lease extension and actual scope approval.
No edit to `server/vite.ts` is needed.

- Before SHA256-LF: `b7a7641752b74a557664c9119130431fa3e68c0b2a31acce5ddab0c8283d9f94`
- Proposed after SHA256-LF: `9a3cf7068562184ef84f3b0a54fff5763e0d563e89c237bcba6d95dab0cbd940`
- Exact patch: `DOCUMENT_PRIVACY_HEADERS_AMENDMENT_PROPOSED_20261006.patch`
- Patch SHA256: `8392d24308c3dc106c00317f4cd9550d94e956d008051c617c0126d610330fa9`

The patch imports the existing `isHealthIntakePath` predicate and sets
`Cache-Control: no-store, private`, `Pragma: no-cache` and
`Referrer-Policy: no-referrer` for its owned document paths. Existing `/status`
headers remain unchanged. It adds no route, data collection, authority or transport.
The coordinator rehashed the patch and current before bytes; it has not applied it.

This runtime file was explicitly frozen in the approved test-only composition
scope. The additional edit therefore needs Samuel's source-scope decision. The
proposal grants no execution, new qualification group, final protected-hash
acceptance, manifest change, live intake, notification, payment, SQL or deployment.
The separate provider test fixture question remains pending and is not repeated
or silently approved here. Keep both original patches and failed/unrun evidence.
