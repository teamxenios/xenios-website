{
  "observedAt": "2026-10-30T19:22:12.758117+00:00",
  "task": "KAN31-CLOSED-RECOVERY-ENTRY-20261030",
  "session": "codex-launch-coordination-20261005",
  "lease": "b845d44b-fe54-4f5c-bd61-e5ebc7923cc5",
  "pr": "https://github.com/teamxenios/xenios-website/pull/343",
  "head": "0e340d1ce5987c218a6d731161182331f248b964",
  "tree": "6097fc4b5e8a68bf934d8656cf8744967ba3d619",
  "soleParent": "72ad0c9776a8f74c2bef94612215f28bbed85470",
  "acceptedBase": "4f0a6b05566826de9c59e9e282d5bff6480abf66",
  "stackedBaseBranch": "codex/quick-order-closed-intake-recovery-20261030",
  "run": 41113536490,
  "attempt": 1,
  "conclusion": "success",
  "trustedRequiredChecks": {
    "typecheck": {
      "id": 124261763540,
      "appId": 15368,
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41113536490/job/124261763540"
    },
    "protection": {
      "id": 124261763860,
      "appId": 15368,
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41113536490/job/124261763860"
    },
    "test": {
      "id": 124261764101,
      "appId": 15368,
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41113536490/job/124261764101"
    },
    "build": {
      "id": 124261764119,
      "appId": 15368,
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41113536490/job/124261764119"
    },
    "Required CI completion": {
      "id": 124264919604,
      "appId": 15368,
      "conclusion": "success",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41113536490/job/124264919604"
    }
  },
  "providerCommit": "e37df249e590a675bfe51f83523c33467cb83942",
  "providerTreeExact": true,
  "paths": [
    "client/src/research/early-access/EarlyAccessRoute.tsx",
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx",
    "client/src/research/assisted-order/RequestIntentForm.tsx",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx",
    "server/research/assisted-order/request-intent/composition.integration.test.ts"
  ],
  "blobs": {
    "client/src/research/early-access/EarlyAccessRoute.tsx": "38b8b58f545de7b0811a464e6b920e8c73369b7e",
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": "7247e1bf8c07b2f5ac1303ddecce42e113a97c6e",
    "client/src/research/assisted-order/RequestIntentForm.tsx": "e476435aae57932a42fbf37cc786490163fda98c",
    "client/src/research/assisted-order/RequestIntentForm.test.tsx": "8c5f639b4778f8d01a05b0ca8b8e02b514682a7d",
    "server/research/assisted-order/request-intent/composition.integration.test.ts": "936a0a9f36016867fc51123b1482967227240b82"
  },
  "numstat": "46\t0\tclient/src/research/assisted-order/RequestIntentForm.test.tsx\n14\t5\tclient/src/research/assisted-order/RequestIntentForm.tsx\n119\t4\tclient/src/research/early-access/EarlyAccessRoute.storefront.test.tsx\n15\t6\tclient/src/research/early-access/EarlyAccessRoute.tsx\n5\t2\tserver/research/assisted-order/request-intent/composition.integration.test.ts",
  "full": {
    "passed": 18268,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 979,
    "filesSkipped": 6
  },
  "focused": {
    "passed": 126,
    "failed": 0,
    "filesPassed": 4,
    "overlapsFullNotAdditive": true
  },
  "component": {
    "cases": 33,
    "passed": 33,
    "milliseconds": 1112
  },
  "storefront": {
    "cases": 52,
    "passed": 52,
    "focusedMilliseconds": 5110,
    "fullMilliseconds": 5481
  },
  "rawLog": "QO_CLOSED_RECOVERY_ENTRY_GREEN_TEST_41113536490.log",
  "rawSHA256": "bd4827216046174ac0bb136c3260db79d78e300cad66a846efcc44fb7d222164",
  "preservedRed": {
    "run": 41113141199,
    "head": "72ad0c9776a8f74c2bef94612215f28bbed85470",
    "focusedPassed": 112,
    "focusedFailed": 8,
    "fullSuite": "NOT RUN; focused step failed",
    "rawSHA256": "6de15d27fa567b61d059f4ce7a3a7da6db2a6f9d2f2097f9ded26ccc4159a183",
    "allEight": "Missing customer recovery entry",
    "testsChangedAfterRed": "Added blocked-marker matrix, initial-focus regression and updated composition source binding; no claim of byte-identical test blobs"
  },
  "scope": [
    "Retained valid mixed recovery reaches actual route/form/canonical client API with off, unknown and pending readiness and unavailable catalog",
    "No marker/legacy/malformed/both markers do not open fresh or legacy checkout",
    "Explicit samekey recovery/genuine parsed reference/owned marker removal; null, malformed and503 preserve same marker for explicit retry",
    "Receipt survives parent/readiness rerender; canonical session reset remains privacy boundary",
    "Restored component skips config/catalog/hint reads and deduplicates pending recovery clicks",
    "Initial surrounding agreement focus preserved; later step changes focus heading"
  ],
  "limits": [
    "Synthetic HTTP/API/component/JSDOM fixtures, not native browser or live recovery/persistence",
    "Lazy marker disappearance branch source-verified, not behaviorally demonstrated",
    "Focus event before expiry source-verified; parent rerender is behavioral test; real expiry clears customer context intentionally",
    "No managed DB/schema/current prices/provider/inbox/production proof",
    "SupabasePreview skipped/non-required; no new production loads (both old allowance consumed)",
    "Not combined340/342 client repairs or339 durable harness"
  ],
  "authors": "Root implementation; finite selection_unit bounded read-only implementation support (ACK/allocationee3e2cf7/START), no new blocker; neither independently accepts",
  "sourceCleanAndRemoteExact": true,
  "localRuntimeExecuted": false,
  "rerunOrSoak": false,
  "newSkipsOrWaivers": false,
  "independentAcceptanceObserved": false,
  "productionGO": false
}
