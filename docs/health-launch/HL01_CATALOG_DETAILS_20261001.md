# HL-01 exact-variant inspection in the existing catalog

Status: bounded local qualification complete; independent review, integration aggregate and protection clearance remain held. Not release approval.

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

The narrow correction adds min-width0 and overflow-wrap:anywhere to this existing card only. It does not hide/clip content or change facts. A source contract prevents removing this wrapping behavior. The resulting production build passed the independent browser recapture below.

## Final frozen successor and classification

- Runtime: `ed5c5ad50585bf05c43b22134e196d49b8d98456`.
- Runtime tree: `7a694e71c5d7f6ed3fee2c31fd8a616a3f1de326`.
- Test-only tip: `928dfc60b2ffee3ded364c7f6a301b728e71e0dd`, cumulative with `f0bd9b89156a452a90aa601757f330b3bea8cf31`.
- Release-control tip: unchanged `edf8526bdefc34b8e87fa6e46585573535dba6cd`.
- Final build/typecheck/protection checkpoint: clean `c23b979bcd60a0fb550c7be1ba3ef55988eb506b`, tree `c7014e2b8d8e13b4b8a391bd06fdadebaf4c880f`. Later commits are records only; the canonical handoff points to the pushed final records commit.

The runtime commits are `c37e29a43d9d77c9706fc2650395d7056823135a` (disclosure) and `ed5c5ad50585bf05c43b22134e196d49b8d98456` (outer-card wrapping). The only changed runtime paths are `client/src/research/assisted-order/AssistedOrderPage.tsx` and `client/src/research/assisted-order/assisted-order.css`. Tests change only `AssistedOrderPage.test.tsx` and `assisted-order-accessibility.test.ts` in that directory. The initial and final evidence, this packet, continuity state/session/task/lease files and canonical handoff are records. No authority, schema, endpoint, protected manifest, route or release-gate implementation changed in HL01.

Final canonical-LF SHA256: Page `287df7646acc7457ac3c29a5c9569a53c0cef5f6d075d13725eb6e5eada788ed`; CSS `507a2722991585637b0a8b17c0ddbaf271ec21e58e61b816a8ab43516ee2bb02`.

## Corrected-source checks

All four runs remain distinct from the initial five runs. Exact argv, revisions, dirty states, elapsed times, exits, log hashes and raw bytes are in `evidence/hl01-catalog-details-20261001/raw-checks-corrected.json`, with individual start/result/provenance receipts alongside it.

| Job | Actual result |
| --- | --- |
| `hl01-wrap-focused` | 79 pass / 3 files / zero skips, exit0,52.10s Vitest/55.233s wrapper. Page, accessibility and whole-catalog coverage with the real dataset reader. Stable corrected CSS/test bytes before their commits; starting records `ceee1b6` and dirty state are retained. |
| `hl01-build-wrap-final` | Clean `c23b979`, exit0,49.828s; 1,352 source/225 production files and zero forbidden em-dash forms. |
| `hl01-typecheck-wrap-final` | Clean `c23b979`, exit0,17.820s. |
| `hl01-protection-final` | Clean `c23b979`, exit1,0.943s;37 hard hashes pass, static hard hash fails, three permitted-seam warnings. No baseline amended. |

The earlier route check passed462 registrations/453 call sites. The only runtime delta after it is CSS wrapping, not routing. It is not relabelled as a new route execution.

Exact local reproduction commands (PowerShell, repository root; process-local environment only):

```powershell
$xeniosNode20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$xeniosPriorPath = $env:PATH
$xeniosPriorDataset = $env:XENIOS_MASTER_OFFERINGS_DATASET
try {
  $env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $xeniosPriorPath
  $env:XENIOS_MASTER_OFFERINGS_DATASET = (Resolve-Path 'server/research/master-offerings/data/member-safe-master-offerings.generated.json').Path
  & $xeniosNode20 node_modules/vitest/vitest.mjs run client/src/research/assisted-order/AssistedOrderPage.test.tsx client/src/research/assisted-order/assisted-order-accessibility.test.ts server/research/master-offerings/early-access-catalog-coverage.test.ts --maxWorkers=1 --no-file-parallelism
  & $xeniosNode20 node_modules/typescript/bin/tsc --noEmit
  & $xeniosNode20 C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js run build
  & $xeniosNode20 node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-route-uniqueness.ts
  & $xeniosNode20 scripts/acceptance/verify-core-site-protection.mjs
} finally {
  $env:PATH = $xeniosPriorPath
  $env:XENIOS_MASTER_OFFERINGS_DATASET = $xeniosPriorDataset
}
```

Record each exit separately; the last protection command is expected to fail on the preserved hold. These commands are not authority to deploy, apply SQL or clear a gate.

## Corrected production-client browser evidence

URL: `http://127.0.0.1:56969/research/early-access/order-request`. Chrome tab1096126702. Source/tree above, production build at clean `c23b979`; no development bundle. The isolated preview process31008 remains running, port56969, private snapshot `hl01-preview-dist-H3PkWQ/dist`. Inventory SHA256 `b76e5543af86b8cc40ea4f6f4ae390bcf86bbb6d30840986b594183f48e880cf`;346 files. `preview-final-receipt.json` pins provenance. The launcher is byte-identical to `preview-initial.mjs` (SHA256 `62746d663f87029798612c2a6e6cf250285b657151a3f5232b7c74886754806a`). Two stale comments in that harness do not describe behavior: there are four synthetic GET fixtures, not two, and five main source pins, not three.

The first final JSON accidentally saved an empty observation array despite console output during interaction. `chrome-final-observations.json` and its screenshot remain preserved as incomplete packaging, not measurement proof. Root repeated the interactions and saved `chrome-final-recapture.json` and `chrome-final-recapture.png`; the saved JSON was read back and its nine observations validated. This recapture, not the empty JSON, supports the final claims. JSON SHA256 `3bbbb087329bf50c03c7f6d749566ecc335d0bf57c369bd02c63c416def3cf6c`; PNG SHA256 `7a4319b882ae5824835f054a1facaa64de50c9f36a92b808af21c32f57737010`. Corrected-run archive SHA256 `91c14e4e40d4dea84562945d8361be03e43222312a2c614c592ec3718cb51d87`; final preview receipt SHA256 `8ff8cbd6bc2b19760760f96b4a60626d899d0adfa2964b0926a0d3665c23417f`.

All nine measurements: innerWidth319, innerHeight304 CSS pixels, document clientWidth311/scrollWidth311, horizontal overflow0, DPR3. Native browser zoom percentage was not observed, and no viewport override was applied. This is narrow actual-Chrome evidence, not a true200%/400% zoom claim.

Visual inspection found `chrome-final-recapture.png` captured a pre-scroll frame during focus settling. That image remains retained, not offered as the focused-control screenshot. A fresh AX/screenshot observation confirmed the expanded focused detail; the settled `chrome-final-stable.png` was saved and visually inspected (SHA256 `c1ea8605cafcadaf14d6187965483ca61e68efacab4cccec582bba3283c5036a`). Use that image for the final visible disclosure/focus evidence, together with the timestamped geometry JSON.

Native Enter opens the long-spec sibling, Space closes it, Enter reopens it, and Tab reaches Add without activation. All six summaries measure44px high and249.333px wide, with3px visible keyboard outline on focus. The focused Add control is fully within the visible page below the69px header (top166.042,bottom210.042 of304). Details clientWidth/scrollWidth are249/249 including the unbroken stress string. Care exposes separate provider-review guidance without Research request limits; held details remain inspectable without Add or a Care CTA. Filtering to Synthetic Care gives one fresh closed disclosure; refresh restores six closed disclosures, then first-detail Enter works. Every measurement keeps the request empty. No Add, Care CTA, submission, purchase or financial transition was activated. Captured warning/error console entries: zero.

Two prior read-only tool timeouts remain disclosed (measurement and a post-reload locator wait). The recapture also had one ambiguous read-only text locator; the observed unique result-count test id resolved it. No failed UI action was blindly repeated. These are browser-tool observations, not suite timeouts or test passes.

Harness limits: four GET fixtures (`/api/config`, `/api/research/me`, assisted-order config and catalog); GET/HEAD only; other API requests blocked; same-origin CSP and outbound server networking blocked; ephemeral private local credentials not recorded. Actual pageGate/static plus frozen production client are used, not the full application server, Auth, SQL, outbox or worker runtime. Synthetic prices, products, legal pair and signed-out viewer prove presentation only. Source/asset checks are bounded checks, not continuous filesystem attestation. The prior HL17 loopback preview on port53791 also remains running against its own unchanged pinned source.

## Independent reviewer handoff

Review ADP03 finance first, then the cumulative HL17 and HL01 UI successor. For HL01 inspect the exact variant read-only disclosure, withheld/missing facts, Care separation, all five workflows, stale-catalog behavior, no-selection side effects and the browser-reproduced wrapping fix. Do not infer protection approval from local tests. Preserve the separate ADP03 failed aggregate, new static hard-hash failure and three seam warnings. No new P0/P1/P2 census or Claude acceptance is claimed.

At the final records check the remote Claude branch remained `e7b74feb04567cac16d5b8bd089a7ae1218721d2`; its latest observed review addresses older `915a535`, not this exact successor. Imagery's remote tip was separately observed at `e13ca4b3e80c7a8032c3f279b1cd3efd95de36fa`. The image lane reports private source `c0373b73ae5258618d35773a451eca3333339584`, tree `3984cc9b7da15906114fc1adcfd02a485dc37d69`, records `d7a53ab327c96f0a80284f2124168c3699baf2dc`:25 retained Batch0 candidates,423 private provisional slots and40 browser views. Those image results are lane-reported, not independently repeated here, and are not public approval or integration. No shared image path was edited.

## Continuing holds

No full-suite pass is claimed for this successor. Prior ADP03 aggregate remains19,357 pass/1 fail/85 skip, exit1, on its own exact predecessor. Final resource-controlled aggregate remains required at the integration boundary, before integration or release. The unchanged protection manifest retains the static hard-hash failure and App plus two inherited server-seam mismatches. No owner approval or baseline amendment is inferred.

The latest observed independent reviewer branch is `e7b74feb04567cac16d5b8bd089a7ae1218721d2`, reviewing older source, not this successor. Financial review of frozen ADP03 has priority. F1 still requires a real independent evidence source and operational grant procedure; N2 void/refund/dispute/historical reconciliation remain governed engineering/operational work, not permission to fabricate historical verification. All hosted qualification is separate.

HL11 remains424 canonical/423 customer rows:173 numeric Research,242 intentionally Care-withheld,2 genuine quote-only,6 new-unbound. GRP-0364 shipping exclusion, approved display-cent decisions and source identities are unchanged. Superpower/Mito Health remain Coming soon only. Foreign image/media branches are not integrated: rendered assets are not public/approved commerce permission.

No deploy, merge, managed migration, hosted configuration, price release, account grant, real email, money, procurement or clinical action occurred.
