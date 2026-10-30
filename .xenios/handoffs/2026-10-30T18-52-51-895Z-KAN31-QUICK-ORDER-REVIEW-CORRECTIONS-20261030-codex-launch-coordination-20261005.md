{
  "observedAt": "2026-10-30T18:44:58.515390+00:00",
  "task": "KAN31-QUICK-ORDER-REVIEW-CORRECTIONS-20261030",
  "rootSession": "codex-launch-coordination-20261005",
  "lease": "d4735e93-82f4-4198-bf14-c8a11f60a50f",
  "pr": "https://github.com/teamxenios/xenios-website/pull/342",
  "head": "dfa20b2e4e29b9dd7f9e446f29c6dc06da65e985",
  "tree": "85808ebba81d01f829ef6a8193781e83e1455c9a",
  "parent": "9541143d58fb30a83bd64d0ce942262313d61876",
  "acceptedBase": "a6da0536d35b485083b59476afdafb63518febec",
  "stackedBaseBranch": "codex/quick-order-requirements-refresh-20261030",
  "run": 41108223620,
  "attempt": 1,
  "conclusion": "success",
  "trustedRequiredChecks": {
    "test": {
      "id": 124243541978,
      "appId": 15368,
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41108223620/job/124243541978"
    },
    "build": {
      "id": 124243541796,
      "appId": 15368,
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41108223620/job/124243541796"
    },
    "typecheck": {
      "id": 124243541432,
      "appId": 15368,
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41108223620/job/124243541432"
    },
    "protection": {
      "id": 124243541960,
      "appId": 15368,
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41108223620/job/124243541960"
    },
    "Required CI completion": {
      "id": 124245894516,
      "appId": 15368,
      "status": "completed",
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41108223620/job/124245894516"
    }
  },
  "providerCommit": "d8632ce3f87b177557ae86fe7ba7e4c9e3f82e10",
  "providerTree": "85808ebba81d01f829ef6a8193781e83e1455c9a",
  "providerTreeExact": true,
  "paths": [
    "client/src/research/assisted-order/RequestIntentForm.tsx",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx",
    "server/research/assisted-order/request-intent/service.test.ts"
  ],
  "blobs": {
    "client/src/research/assisted-order/RequestIntentForm.tsx": "16b6cef16a101279f39790fea19ccf8c0b20c9c0",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": "07c1cd33e56cac4efe7a807783b9b7781155b375",
    "server/research/assisted-order/request-intent/service.test.ts": "d94b71b3b467c757f7ca04aaea5d1b96a4993962"
  },
  "diffAgainstAcceptedBase": "152\t4\tclient/src/research/assisted-order/RequestIntentForm.test.tsx\n14\t11\tclient/src/research/assisted-order/RequestIntentForm.tsx\n19\t1\tserver/research/assisted-order/request-intent/service.test.ts",
  "full": {
    "passed": 18245,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 979,
    "filesSkipped": 6
  },
  "component": {
    "cases": 35,
    "passed": 35,
    "milliseconds": 823
  },
  "service": {
    "cases": 14,
    "passed": 14,
    "milliseconds": 38
  },
  "focused110": "Passed; overlaps the full suite and is NOT additive",
  "rawLog": "QO_REVIEW_CORRECTIONS_GREEN_TEST_41108223620.log",
  "rawSHA256": "895c50a3e6eec3eaf105f41d9ded6f665f8006b11854ed5d1d8c3fd897911401",
  "preservedFailures": {
    "receipt": "QO_REVIEW_CORRECTIONS_FIRST_TWO_FAILURES_20261030.json",
    "sha256": "a8a08a0b2054f00c4aa4828213190f9c96c5fbccb7ac0121e9a3de5df14f6fc9",
    "initial41100532875": "2 genuine contact regressions plus2 wrong raw-contact expectations;18241PASS4FAIL83SKIP",
    "firstRuntime41101360976": "35componentPASS;2 service expectation errors remain;18243PASS2FAIL83SKIP",
    "finalCorrection": "Canonical normalized expected contact + explicit billing=shipping, no runtime service change; component test/runtime byte-unchanged954-to-dfa. Service test changed07966991-to-d94b71b3; do not claim all tests unchanged red-to-finalgreen."
  },
  "scope": "Captured in-memory contact after edit, both billing modes, fresh requirements, stale-config removal, refresh cleanup, first400/429 refusal, full acknowledgment mock, canonical service stale400 and original-key uncertainty",
  "limits": [
    "Not unsubmitted partial-form preservation",
    "Not native browser/CSS/focus/cookies/liveAuth",
    "Not managedDB/persistence/currentprices/provider/inbox/production proof",
    "Not combined338/339/341 composition",
    "SupabasePreview app330661 skipped/non-required, not managed qualification"
  ],
  "authors": "Finite helper proposed adopted test logic after ACK/allocation8d706c0a; Root read all and authored runtime,400guidance and canonical normalization expectation. Authors cannot independently accept.",
  "localRuntimeExecuted": false,
  "rerunOrSoak": false,
  "waiverOrSkipAdded": false,
  "independentAcceptanceObserved": false,
  "productionGO": false,
  "sourceCleanAndRemoteExact": true
}
