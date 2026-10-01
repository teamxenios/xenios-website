# HL-01 exact-variant inspection in the existing catalog

Status: local source qualification in progress, not independent acceptance or release approval.

Branch: `codex/xenios-health-launch-implementation-20260930`.
Session: `codex-xenios-health-launch-implementation-20260930`.
Task: `HEALTH-HL01-CATALOG-DETAIL-DISCLOSURE-20261001`.
Base: pushed HL17 handoff `faba3f5bbd66ad4bfb4c251409774ff9ed52f239`.

Initial runtime `c37e29a43d9d77c9706fc2650395d7056823135a`, tree `209710239a972a39322a147287410c4a593bf1ee`; test-only `f0bd9b89156a452a90aa601757f330b3bea8cf31`; records `ceee1b618c039434f5271c3026326af3e3b00152`. Final browser-corrected source and results follow below after qualification. Release controls remain inherited from `edf8526bdefc34b8e87fa6e46585573535dba6cd`.

## Scope and source contracts

Only `AssistedOrderPage.tsx` and its existing `assisted-order.css` change runtime. A native, initially closed details/summary reads the exact current server-projected item, including its specification, form, pack basis and Research request limits. The accessible summary includes product and specification context. Composite product/variant keys are unchanged. There is no new handler, open-state store, request, route, price/identity authority or financial action.

Missing facts and maximum are explicitly not stated, never guessed or labelled unlimited. Production currently projects null format/pack basis; labels are not parsed to invent either. Request quantities are not dosing instructions or availability approval. Care details give separate provider-review guidance and do not add Research quantity instructions or duplicate Care prices. Existing visible price, restrictions, warnings and workflow actions remain outside the disclosure. Held rows remain inspectable without Add or a fabricated Care shortcut. Request pricing and activation remain requests.

This is the next bounded detail slice inside the existing catalog, not completion of all HL-01 goals. The mounted standalone route is `/research/early-access/order-request`; the same component also appears in Early Access. No `/products/:slug` publication is enabled, and no live viewer authorization, price release or product availability is inferred. Existing fingerprints, identity, submit-denial and Product Control contracts are unchanged.

## Preserved initial runs

Private verified Node v20.19.0/npm10.8.2; official archive SHA256 `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`. One Vitest worker, no file parallelism, actual dataset reader enabled. Receipts, commands, revision/dirty-state data, raw base64 log bytes and bounded process samples are indexed in `evidence/hl01-catalog-details-20261001/raw-checks-initial.json`.

| Job | Actual result |
| --- | --- |
| `hl01-repro-details` | Unchanged runtime, new missing-disclosure test: 1 fail, 49 name-filter skips; exit1; 43.22s Vitest/49.854s wrapper. Not a full-suite result. |
| `hl01-focused` | Initial source/tests before browser correction: 151 pass / 8 files, zero skips, exit0; 70.30s Vitest/74.129s wrapper. Real catalog reader and all-row coverage included. Existing JSDOM scrollTo warnings retained. |
| `hl01-build-final` | Clean `ceee1b6`, exit0,121.553s wrapper; 1,352 source and225 production files, zero forbidden em-dash forms. Existing build warnings retained. |
| `hl01-typecheck-final` | Same clean checkpoint, exit0,92.630s. |
| `hl01-routes-final` | Same clean checkpoint, exit0,9.339s;462 registrations/453 call sites. |

Sampled child executable paths are bounded observations, not continuous or exhaustive attestation. The earlier failed reproduction is never relabelled as passing. A CSS test file changed during the filtered reproduction, but it was not part of that command; runtime and the selected component-test file were held fixed.

## Browser-discovered long-fact correction

Initial Chrome fixture URL: `http://127.0.0.1:57682/research/early-access/order-request`. The exact production client at `ceee1b6` was served through real pageGate/static middleware in an isolated loopback, GET/HEAD-only preview. Six explicitly synthetic products cover five workflows plus same-name sibling variants. Fictional cents and form labels are marked synthetic in the UI; no real viewer service, Auth, SQL or order mutation is mounted. The published form copies are reused, but the legal pair is explicitly synthetic and is not acceptance authority.

Cold closed cards already had horizontal overflow464px at innerWidth319/innerHeight304, document clientWidth311/scrollWidth775, DPR3. The new details themselves were249px wide with equal scrollWidth; native Enter opened them and displayed a3px focus outline without selecting any product. The existing second card's outer specification field had clientWidth120/scrollWidth745 and overflow-wrap normal. An intentionally unbroken synthetic specification exposed that existing layout defect. It is not evidence that a current real product has that exact long word.

`chrome-initial-observations.json` and `chrome-initial-overflow.png` preserve the failed stress case. One read-only browser measurement timed out; after observing current browser state, screenshot/JSON capture succeeded. No failed action was blindly repeated. The preview process13628 was interrupted and ended exit1; its private snapshot `hl01-preview-dist-2mMzlk` was retained, not claimed gracefully cleaned.

The narrow correction adds min-width0 and overflow-wrap:anywhere to this existing card only. It does not hide/clip content or change facts. A source contract prevents removing this wrapping behavior. Browser geometry must be rechecked on the resulting production build.

## Continuing holds

No full-suite pass is claimed for this successor. Prior ADP03 aggregate remains19,357 pass/1 fail/85 skip, exit1, on its own exact predecessor. Final resource-controlled aggregate remains required at the integration boundary, before integration or release. The unchanged protection manifest retains the static hard-hash failure and App plus two inherited server-seam mismatches. No owner approval or baseline amendment is inferred.

The latest observed independent reviewer branch is `e7b74feb04567cac16d5b8bd089a7ae1218721d2`, reviewing older source, not this successor. Financial review of frozen ADP03 has priority. F1 still requires a real independent evidence source and operational grant procedure; N2 void/refund/dispute/historical reconciliation remain governed engineering/operational work, not permission to fabricate historical verification. All hosted qualification is separate.

HL11 remains424 canonical/423 customer rows:173 numeric Research,242 intentionally Care-withheld,2 genuine quote-only,6 new-unbound. GRP-0364 shipping exclusion, approved display-cent decisions and source identities are unchanged. Superpower/Mito Health remain Coming soon only. Foreign image/media branches are not integrated: rendered assets are not public/approved commerce permission.

No deploy, merge, managed migration, hosted configuration, price release, account grant, real email, money, procurement or clinical action occurred.
