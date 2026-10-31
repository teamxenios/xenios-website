{
  "state": "APPLIED_PUSHED_GREEN_INDEPENDENT_SOURCE_REVIEW_PENDING",
  "pr": 345,
  "head": "12998196cce32a181073351a99deb130e799069b",
  "tree": "2b3d6fa429dd1f185aaff21518af6f165629e432",
  "parent": "d0d6375ec0cf5b649f56ec7f186978ec9fe88c93",
  "priorReviewedHead": "7f694427d292c33e6e701913bd41f140de5a6b97",
  "base": "e0f349c04c10a820c847e4ed59490a7a90ea9449",
  "providerMerge": "1bbd47cc16fd9920ea4fd319ba78d9a7d6accff2",
  "providerTreeExact": true,
  "task": "KAN31-RECOVERY-AGREEMENT-REMOUNT-20261030",
  "owner": "codex-launch-coordination-20261005",
  "lease": "4ca3ba86-e720-42e2-81c5-0d604a50942c",
  "claimCanonical": "2d1a557e142c947999746eb1fe12762dd4a233cd",
  "claimReadbackSHA256": "5826e11ccb66984f25e6c94239aaa6f4d475395ad0656187e36370da467714be",
  "paths": [
    {
      "path": "client/src/research/early-access/EarlyAccessRoute.tsx",
      "blob": "22d24c24ccc412c6426cfc6500dad13b39ff3e4a",
      "baseBlob": "38b8b58f545de7b0811a464e6b920e8c73369b7e"
    },
    {
      "path": "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx",
      "blob": "6cadf32c94ea79b5017d1794a0fd1baa02f0ad71",
      "baseBlob": "7247e1bf8c07b2f5ac1303ddecce42e113a97c6e"
    },
    {
      "path": "server/research/assisted-order/request-intent/composition.integration.test.ts",
      "blob": "02973d4391af996bf113db8f50cd77243f4046a5",
      "baseBlob": "936a0a9f36016867fc51123b1482967227240b82"
    }
  ],
  "numstatVsBase": "187\t7\tclient/src/research/early-access/EarlyAccessRoute.storefront.test.tsx\n23\t7\tclient/src/research/early-access/EarlyAccessRoute.tsx\n10\t3\tserver/research/assisted-order/request-intent/composition.integration.test.ts",
  "numstatVsPrior": "97\t14\tclient/src/research/early-access/EarlyAccessRoute.storefront.test.tsx\n5\t4\tclient/src/research/early-access/EarlyAccessRoute.tsx\n1\t1\tserver/research/assisted-order/request-intent/composition.integration.test.ts",
  "runtimeDeltaVsPrior": "+5/-4 Route.tsx, including comments and predicate",
  "regressionTestBlobUnchangedNewRedToGreen": true,
  "decision": "Reviewer6537085743/KAN31/10397 explicitly offered option(b) to Root-or-Samuel; Root chooses canonical agreement visible whenever intake is open, including restored view/receipt. Closed intake recovery has no fresh agreement.",
  "change": "Remove current-marker dependency from hideFreshAgreement. Existing nullable recovery latch and customer-context reset retained. No Auth/Core/globalgate/SQL/config/flags/limiter/dependency/workflow change.",
  "harness": "Real React useSyncExternalStore with cached immutable snapshot; stable Route element rendered once. Separate same-member checking/authenticated and owner-key changes update only actual consumers; no root.render between flips. Verify recovery key/receipt/marker clearance, canonical explicit acceptance/contact continuation, exact POST counts/no replacement request.",
  "priorTestCorrection": "Parent-driven RRE1 case retained and renamed, initial policy assertion updated to option(b), checking state made valid. Previous test was insufficient and prior 7f RRE1 acceptance is not claimed.",
  "red": {
    "run": 41174115043,
    "head": "d0d6375ec0cf5b649f56ec7f186978ec9fe88c93",
    "attempt": 1,
    "state": "THREE_INTENDED_AGREEMENT_ABSENCE_FAILURES",
    "policy": "Root chooses10397optionb: canonicalagreementvisiblewheneverintakeopen; closedintakeunmodified",
    "focused": {
      "passed": 128,
      "failed": 3
    },
    "storefront": {
      "cases": 57,
      "passed": 54,
      "failed": 3
    },
    "full": "NOT RUN; focused gate failed",
    "failures": [
      "test\tFocused guest-entry regression checks\t2026-10-31T05:50:54.9808012Z  FAIL  client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx > the login-free request-only entry > keeps the required agreement reachable after a parent-driven inner remount while intake is open",
      "test\tFocused guest-entry regression checks\t2026-10-31T05:50:55.0137278Z  FAIL  client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx > the login-free request-only entry > reaches the required agreement after recovery and same-member verification without rendering the outer route again",
      "test\tFocused guest-entry regression checks\t2026-10-31T05:50:55.0141499Z  FAIL  client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx > the login-free request-only entry > reaches the required agreement after recovery and owner-key change without rendering the outer route again"
    ],
    "newContextCases": "useSyncExternalStore, stableRouteelement, no root.render between checking/authenticated or owner-key changes; both reached missing checkbox assertion",
    "priorParentCase": "Updated policy assertion intentionally fails before recovery; no claim it is the production-context reproduction",
    "testBlob": "6cadf32c94ea79b5017d1794a0fd1baa02f0ad71",
    "rawSHA256": "0c50e789103d51be49057f2334714345f64a1c0d76dd8278bc57ef0d56360d3e",
    "jobs": {
      "typecheck": "success",
      "test": "failure",
      "build": "success",
      "protection": "success",
      "Required CI completion": "failure"
    }
  },
  "ci": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T05:52:21Z",
    "databaseId": 41174292780,
    "event": "pull_request",
    "headSha": "12998196cce32a181073351a99deb130e799069b",
    "jobs": [
      {
        "completedAt": "2026-10-31T05:52:47Z",
        "conclusion": "success",
        "databaseId": 124458519759,
        "name": "build",
        "startedAt": "2026-10-31T05:52:24Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T05:52:25Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T05:52:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:29Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:34Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T05:52:29Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:41Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T05:52:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:46Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T05:52:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:46Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T05:52:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:46Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T05:52:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:46Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T05:52:46Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458519759"
      },
      {
        "completedAt": "2026-10-31T05:52:54Z",
        "conclusion": "success",
        "databaseId": 124458519907,
        "name": "protection",
        "startedAt": "2026-10-31T05:52:24Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T05:52:25Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:36Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:40Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T05:52:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:50Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T05:52:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:50Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T05:52:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:53Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T05:52:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:53Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T05:52:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:53Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T05:52:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:53Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T05:52:53Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458519907"
      },
      {
        "completedAt": "2026-10-31T05:58:19Z",
        "conclusion": "success",
        "databaseId": 124458520010,
        "name": "test",
        "startedAt": "2026-10-31T05:52:24Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T05:52:25Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:35Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:40Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T05:52:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:50Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T05:52:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:53:34Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T05:52:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:17Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T05:53:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:17Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T05:58:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:17Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T05:58:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:17Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T05:58:17Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458520010"
      },
      {
        "completedAt": "2026-10-31T05:53:07Z",
        "conclusion": "success",
        "databaseId": 124458520011,
        "name": "typecheck",
        "startedAt": "2026-10-31T05:52:24Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T05:52:25Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:29Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T05:52:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:34Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T05:52:29Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:52:41Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T05:52:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:53:05Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T05:52:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:53:05Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T05:53:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:53:05Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T05:53:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:53:05Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T05:53:05Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458520011"
      },
      {
        "completedAt": "2026-10-31T05:58:25Z",
        "conclusion": "success",
        "databaseId": 124459633292,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T05:58:22Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T05:58:23Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T05:58:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:23Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T05:58:23Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T05:58:23Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T05:58:23Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124459633292"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T05:58:26Z"
  },
  "requiredChecks": {
    "test": {
      "id": 124458520010,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458520010",
      "appId": 15368
    },
    "build": {
      "id": 124458519759,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458519759",
      "appId": 15368
    },
    "typecheck": {
      "id": 124458520011,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458520011",
      "appId": 15368
    },
    "protection": {
      "id": 124458519907,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124458519907",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124459633292,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41174292780/job/124459633292",
      "appId": 15368
    }
  },
  "full": {
    "testsPassed": 18282,
    "testsFailed": 0,
    "testsSkipped": 83,
    "filesPassed": 981,
    "filesSkipped": 6
  },
  "focused": {
    "testsPassed": 131,
    "testsFailed": 0,
    "filesPassed": 4,
    "overlapNotAdditive": true
  },
  "rawSummaries": [
    "test\tFocused guest-entry regression checks\t2026-10-31T05:53:34.2954366Z  Test Files  4 passed (4)",
    "test\tFocused guest-entry regression checks\t2026-10-31T05:53:34.2955372Z       Tests  131 passed (131)",
    "test\tRun npx vitest run\t2026-10-31T05:58:16.9277533Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T05:58:16.9413002Z       Tests  18282 passed | 83 skipped (18365)"
  ],
  "selectedFullCases": [
    "test\tRun npx vitest run\t2026-10-31T05:53:48.3351000Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (57 tests) 6233ms",
    "test\tRun npx vitest run\t2026-10-31T05:53:52.6020893Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (38 tests) 1107ms",
    "test\tRun npx vitest run\t2026-10-31T05:54:36.5253372Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 2900ms",
    "test\tRun npx vitest run\t2026-10-31T05:54:40.3971867Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 505ms",
    "test\tRun npx vitest run\t2026-10-31T05:55:38.3758096Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 3022ms",
    "test\tRun npx vitest run\t2026-10-31T05:57:38.2892429Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 11ms"
  ],
  "limits": {
    "sourceAcceptance": "NOT YET OBSERVED; SAME existing Claude required for new129/2b3 delta",
    "nativeBrowserCSS": "NOT RUN",
    "serverAPI": "Synthetic API and member projection with real mounted React/JSDOM components",
    "realSupabaseAuthEvent": "NOT RUN; subscriber semantics modeled with useSyncExternalStore",
    "volatileFormReceiptStateLoss": "NOT FIXED or claimed",
    "managedDBCurrentPricesProviderInboxFullJourney": "NOT PROVEN",
    "localRuntime": "NOT RUN",
    "production": "PR344 remains LIVE e0f; PR345 draft/unmerged/not deployed",
    "rerunSoakSkipWaiver": false
  },
  "artifactSHA256": {
    "RED_CI_LOG.txt": "0c50e789103d51be49057f2334714345f64a1c0d76dd8278bc57ef0d56360d3e",
    "RED_CONTEXT_FAILURE_d0d6375.json": "7c73f7648456b48faf1bc16866da60a2b1646e1e2da7e162a84c7dc0bfac9ecd",
    "GREEN_CI_LOG.txt": "49eb0427cd3527feaa998014a6ab689d17a9dc623e8a7c4c4c8952730c518518",
    "GREEN_CI.json": "c83cd2e213cc426c5f91ce6aff5ab68922f48192d6f8f5c10cebaf8be46f5d2a",
    "GREEN_CHECK_RUNS.json": "6453f554d5f9cda524b27e3d60befcf3ce0d15ca7813ae28088f9d0e5b24aaef"
  }
}
