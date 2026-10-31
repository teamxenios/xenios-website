{
  "state": "APPLIED_PUSHED_GREEN_QA_SOURCE_REVIEW_PENDING",
  "pr": 345,
  "head": "7f694427d292c33e6e701913bd41f140de5a6b97",
  "tree": "c53af1316c3f8e4cee8436ae70a2847db38bdcc6",
  "parent": "007aaed0e07e1e971725f61e2d1e5a9972c53719",
  "base": "e0f349c04c10a820c847e4ed59490a7a90ea9449",
  "providerMerge": "38efc22a3fe5e8ba3bc9ddeeede6aa734965f980",
  "providerTreeExact": true,
  "task": "KAN31-RECOVERY-AGREEMENT-REMOUNT-20261030",
  "owner": "codex-launch-coordination-20261005",
  "lease": "57821fa8-3f53-4530-8952-ee9905c8ebe9",
  "claimCanonical": "fbb6261fe7f063e5bd8f866def4ec4ca608448d5",
  "claimReadbackSHA256": "5b7a21f5153d331e70852165bc497f2fa2f6e66a0464801482baa3c112b9ab00",
  "paths": [
    {
      "path": "client/src/research/early-access/EarlyAccessRoute.tsx",
      "blob": "b5aa7f45166964d4c1818bd10aeccdc00e15a847",
      "baseBlob": "38b8b58f545de7b0811a464e6b920e8c73369b7e"
    },
    {
      "path": "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx",
      "blob": "152ee79b11982005c6bc2fd1cb8478c0833bd7ae",
      "baseBlob": "7247e1bf8c07b2f5ac1303ddecce42e113a97c6e"
    },
    {
      "path": "server/research/assisted-order/request-intent/composition.integration.test.ts",
      "blob": "1369c15ea155b145cd668725d810ea8500e37417",
      "baseBlob": "936a0a9f36016867fc51123b1482967227240b82"
    }
  ],
  "numstat": "100\t3\tclient/src/research/early-access/EarlyAccessRoute.storefront.test.tsx\n22\t7\tclient/src/research/early-access/EarlyAccessRoute.tsx\n10\t3\tserver/research/assisted-order/request-intent/composition.integration.test.ts",
  "runtimeNumstat": "+22/-7 Route.tsx only",
  "regressionTestBlobUnchangedRedToGreen": true,
  "allOldStorefrontTestBodiesRetained": true,
  "staticPinUpdate": "Only obsolete ref lifecycle pins replaced; canonical anonymous-session/legal-standing/continuation/legacy exclusion/registration guards retained",
  "change": "First authenticated recovery decision in nullable state before child mount; reset on canonical customer-context boundary; restore agreement for open-intake cleared recovery, preserve closed-intake receipt and fresh journey agreement",
  "red": {
    "run": 41147677573,
    "attempt": 1,
    "head": "007aaed0e07e1e971725f61e2d1e5a9972c53719",
    "testBlob": "152ee79b11982005c6bc2fd1cb8478c0833bd7ae",
    "state": "INTENDED_TWO_DEFECT_REPRODUCTIONS",
    "focused": {
      "passed": 127,
      "failed": 2,
      "filesPassed": 3,
      "filesFailed": 1
    },
    "storefront": {
      "passed": 53,
      "failed": 2,
      "cases": 55
    },
    "full": "NOT RUN; focused gate failed, full step skipped",
    "failures": [
      "test\tFocused guest-entry regression checks\t2026-10-31T00:00:57.1614999Z  FAIL  client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx > the login-free request-only entry > restores the required agreement after confirmed recovery and an inner remount while intake is open",
      "test\tFocused guest-entry regression checks\t2026-10-31T00:00:57.1742059Z  FAIL  client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx > the login-free request-only entry > does not reclassify a fresh mounted journey when a later marker appears before a parent rerender"
    ],
    "resetGuard": "PASS",
    "otherJobs": {
      "typecheck": "success",
      "test": "failure",
      "build": "success",
      "protection": "success",
      "Required CI completion": "failure"
    },
    "rawSHA256": "5c71476a9101b14f0a5ef3929f1277c93c8487376fa29f83143d25d312c56c4e",
    "sourceTestsWeakened": false,
    "runtimeChangedBeforeRed": false
  },
  "ci": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T00:02:31Z",
    "databaseId": 41147939623,
    "event": "pull_request",
    "headSha": "7f694427d292c33e6e701913bd41f140de5a6b97",
    "jobs": [
      {
        "completedAt": "2026-10-31T00:03:06Z",
        "conclusion": "success",
        "databaseId": 124377322389,
        "name": "protection",
        "startedAt": "2026-10-31T00:02:34Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T00:02:35Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T00:02:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:45Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:50Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T00:02:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:01Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T00:02:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:01Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T00:03:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:04Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T00:03:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:04Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T00:03:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:05Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T00:03:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:05Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T00:03:05Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322389"
      },
      {
        "completedAt": "2026-10-31T00:02:58Z",
        "conclusion": "success",
        "databaseId": 124377322689,
        "name": "build",
        "startedAt": "2026-10-31T00:02:34Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T00:02:35Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T00:02:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:39Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:45Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T00:02:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:51Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T00:02:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:56Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T00:02:51Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:56Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T00:02:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:57Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T00:02:56Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:57Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T00:02:57Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322689"
      },
      {
        "completedAt": "2026-10-31T00:03:29Z",
        "conclusion": "success",
        "databaseId": 124377322731,
        "name": "typecheck",
        "startedAt": "2026-10-31T00:02:34Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T00:02:35Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:40Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:46Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T00:02:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:55Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T00:02:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:25Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T00:02:55Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:26Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T00:03:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:26Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T00:03:26Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:26Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T00:03:26Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322731"
      },
      {
        "completedAt": "2026-10-31T00:09:03Z",
        "conclusion": "success",
        "databaseId": 124377322750,
        "name": "test",
        "startedAt": "2026-10-31T00:02:34Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T00:02:35Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:45Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T00:02:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:02:51Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T00:02:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:03Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T00:02:51Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:03:48Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T00:03:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:01Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T00:03:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:01Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T00:09:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:01Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T00:09:01Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:01Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T00:09:01Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322750"
      },
      {
        "completedAt": "2026-10-31T00:09:10Z",
        "conclusion": "success",
        "databaseId": 124379347078,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T00:09:07Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T00:09:08Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T00:09:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:08Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T00:09:08Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T00:09:08Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T00:09:08Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124379347078"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T00:09:11Z"
  },
  "requiredChecks": {
    "test": {
      "id": 124377322750,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322750",
      "appId": 15368
    },
    "build": {
      "id": 124377322689,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322689",
      "appId": 15368
    },
    "typecheck": {
      "id": 124377322731,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322731",
      "appId": 15368
    },
    "protection": {
      "id": 124377322389,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124377322389",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124379347078,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41147939623/job/124379347078",
      "appId": 15368
    }
  },
  "full": {
    "testsPassed": 18280,
    "testsFailed": 0,
    "testsSkipped": 83,
    "filesPassed": 981,
    "filesSkipped": 6
  },
  "focused": {
    "testsPassed": 129,
    "testsFailed": 0,
    "filesPassed": 4,
    "overlapNotAdditive": true
  },
  "rawSummaries": [
    "test\tFocused guest-entry regression checks\t2026-10-31T00:03:48.5358452Z  Test Files  4 passed (4)",
    "test\tFocused guest-entry regression checks\t2026-10-31T00:03:48.5359637Z       Tests  129 passed (129)",
    "test\tRun npx vitest run\t2026-10-31T00:09:00.8239825Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T00:09:00.8414906Z       Tests  18280 passed | 83 skipped (18363)"
  ],
  "selectedFullCases": [
    "test\tRun npx vitest run\t2026-10-31T00:04:04.5952807Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (55 tests) 5966ms",
    "test\tRun npx vitest run\t2026-10-31T00:04:08.1911670Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (38 tests) 1177ms",
    "test\tRun npx vitest run\t2026-10-31T00:04:57.1851535Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4076ms",
    "test\tRun npx vitest run\t2026-10-31T00:05:00.1399389Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 562ms",
    "test\tRun npx vitest run\t2026-10-31T00:06:04.7657056Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4355ms",
    "test\tRun npx vitest run\t2026-10-31T00:08:16.4740607Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 12ms"
  ],
  "limits": {
    "sourceAcceptance": "NOT YET OBSERVED; SAME existing Claude required",
    "nativeBrowserCSS": "NOT RUN",
    "serverAPI": "Synthetic fixtures in real mounted React/JSDOM route-entry-form; late marker timing fixture is not submission",
    "managedDBLiveAuthCurrentPricesProviderInboxFullJourney": "NOT PROVEN",
    "sqlAuthCoreConfigFlagsLimiterDependenciesWorkflow": "UNCHANGED",
    "localRuntime": "NOT RUN",
    "production": "Current live e0f is accepted344; successor345 not merged or deployed",
    "rerunSoakSkipWaiver": false
  },
  "artifactSHA256": {
    "RED_CI_LOG.txt": "5c71476a9101b14f0a5ef3929f1277c93c8487376fa29f83143d25d312c56c4e",
    "RRE_RED_FAILURE_007aaed_20261030.json": "0609d70103bf9ab76eb609db9c11fac6947ccb21f5e7d6fd3b471a5593d4f4be",
    "GREEN_CI_LOG.txt": "d9dd2035e06fd835c4cab9331ff63e70813bdc4e55079b8d8a39d21b9a60e062",
    "GREEN_CI.json": "ce00f36d05b2681df989c62c82b6f980eb3dc2425f1d04f883386318e85d5419",
    "GREEN_CHECK_RUNS.json": "222756abea9783cdaf7439d5f749485043a2d1e3bc77326f2746abb303b17ce5"
  }
}
