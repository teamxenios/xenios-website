{
  "state": "APPLIED_PUSHED_GREEN_INDEPENDENT_SOURCE_ACCEPTANCE_PENDING",
  "pr": 346,
  "head": "ac3d19253cfcba4c15877caf1c22893a4b5c31f0",
  "tree": "5f1e542fc24de27219a788bffe5310a43dc55d56",
  "parent": "34bfd9cc6321181f97e13898f3076235090f8a00",
  "base": "e0f349c04c10a820c847e4ed59490a7a90ea9449",
  "provider": "fa38b1d12beb002adc7d4ddf1b16ad746477801e",
  "providerTreeExact": true,
  "branch": "codex/quick-order-staff-queue-pages-20261031",
  "task": "KAN29-PRIVATE-QUEUE-PAGINATION-20261031",
  "lease": "f52c250a-d003-400a-87e1-f37c944b4bb1",
  "owner": "codex-launch-coordination-20261005",
  "claimCanonical": "3f39c0a3c70f7778d94ee828dd072ce52f36b596",
  "claimReadbackSHA256": "073a7abd2156b1b34cfb86d1545cda796e84668b6bd27dd63519ef79388325b9",
  "paths": [
    {
      "path": "client/src/research/assisted-order/RequestIntentStaffReadback.tsx",
      "blob": "a46960cada352ea6cba0305c2db7c6472dd501f3",
      "baseBlob": "962b3e1abfe86161562b4d06afbe04f0959704bd"
    },
    {
      "path": "client/src/research/assisted-order/RequestIntentForm.test.tsx",
      "blob": "205f84d6fbff5e4c3c03f66e78cf438f71c005fb",
      "baseBlob": "92493c0c909cfd4ccb67b6af72448c7b2e61769f"
    }
  ],
  "numstat": "122\t2\tclient/src/research/assisted-order/RequestIntentForm.test.tsx\n34\t10\tclient/src/research/assisted-order/RequestIntentStaffReadback.tsx",
  "regressionTestBlobUnchangedRedToGreen": true,
  "all38PriorCaseBodiesRetained": true,
  "change": "Independent queue state scoped to current api/page/attempt; old rows hidden during load/failure; pending navigation disabled; deliberate failed-page retry; explicit empty state. Saved-reference detail messages and sequence guards remain separate; existing cancellation retained.",
  "readScope": "Existing /care/request-intents mount/canonical Care transport/session.epoch key unchanged. No Care/Auth/Core/server/SQL/config/flag/role/notification/payment/provider changes.",
  "red": {
    "state": "FOUR_INTENDED_PRIVATE_QUEUE_FAILURES",
    "run": 41176289218,
    "head": "34bfd9cc6321181f97e13898f3076235090f8a00",
    "tree": "a050d7b735bd514fdd48ba7b3e887a47269308a5",
    "attempt": 1,
    "focused": {
      "passed": 126,
      "failed": 0,
      "overlapNotAdditive": true
    },
    "full": {
      "passed": 18278,
      "failed": 4,
      "skipped": 83,
      "filesPassed": 980,
      "filesFailed": 1,
      "filesSkipped": 6
    },
    "storefrontFormFile": {
      "passed": 39,
      "failed": 4,
      "total": 43
    },
    "failures": [
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7027583Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > private request queue pagination > distinguishes a pending first page from a confirmed empty private queue",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7143160Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > private request queue pagination > removes old rows and prevents skipped pages while the next private page is pending",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7170128Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > private request queue pagination > retries only the failed page without retaining old rows or advancing it",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7195213Z  FAIL  client/src/research/assisted-order/RequestIntentForm.test.tsx > private request queue pagination > keeps queue failure separate from saved-reference validation and detail retrieval"
    ],
    "existingUnmountCancellationControl": "PASS; fifth new test preserves old cancellation behavior",
    "provider": "418246143723dd2cf19b5428d3b55b45db98debc",
    "rawLogSHA256": "05e6241286848700f5e78d454981f642a0ec8c5298bd8f476aff98f6f8c851e7",
    "rawSummaries": [
      "test\tFocused guest-entry regression checks\t2026-10-31T06:23:50.7998447Z  Test Files  4 passed (4)",
      "test\tFocused guest-entry regression checks\t2026-10-31T06:23:50.7999091Z       Tests  126 passed (126)",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7018989Z \u23af\u23af\u23af\u23af\u23af\u23af\u23af Failed Tests 4 \u23af\u23af\u23af\u23af\u23af\u23af\u23af",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7220455Z  Test Files  1 failed | 980 passed | 6 skipped (987)",
      "test\tRun npx vitest run\t2026-10-31T06:27:12.7366277Z       Tests  4 failed | 18278 passed | 83 skipped (18365)"
    ],
    "jobs": {
      "build": "success",
      "protection": "success",
      "test": "failure",
      "typecheck": "success",
      "Required CI completion": "failure"
    },
    "workflowScope": "The existing four-file focused gate excludes RequestIntentForm.test.tsx; new operator cases execute in full suite. No workflow change."
  },
  "ci": {
    "attempt": 1,
    "conclusion": "success",
    "createdAt": "2026-10-31T06:28:43Z",
    "databaseId": 41176764126,
    "event": "pull_request",
    "headSha": "ac3d19253cfcba4c15877caf1c22893a4b5c31f0",
    "jobs": [
      {
        "completedAt": "2026-10-31T06:29:15Z",
        "conclusion": "success",
        "databaseId": 124465824043,
        "name": "build",
        "startedAt": "2026-10-31T06:28:46Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T06:28:47Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:52Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:57Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T06:28:52Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:06Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T06:28:57Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T06:29:06Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T06:29:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T06:29:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T06:29:13Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824043"
      },
      {
        "completedAt": "2026-10-31T06:29:41Z",
        "conclusion": "success",
        "databaseId": 124465824169,
        "name": "typecheck",
        "startedAt": "2026-10-31T06:28:46Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T06:28:47Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:53Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:58Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T06:28:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:07Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T06:28:58Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:39Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T06:29:07Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:39Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T06:29:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:39Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T06:29:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:39Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T06:29:39Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824169"
      },
      {
        "completedAt": "2026-10-31T06:34:02Z",
        "conclusion": "success",
        "databaseId": 124465824188,
        "name": "test",
        "startedAt": "2026-10-31T06:28:46Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T06:28:48Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:58Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T06:28:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:03Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T06:28:58Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:12Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T06:29:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:54Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T06:29:12Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:33:59Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T06:29:54Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:33:59Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T06:33:59Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:34:00Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T06:33:59Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:34:00Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T06:34:00Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824188"
      },
      {
        "completedAt": "2026-10-31T06:29:18Z",
        "conclusion": "success",
        "databaseId": 124465824288,
        "name": "protection",
        "startedAt": "2026-10-31T06:28:46Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T06:28:48Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T06:28:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:28:58Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T06:28:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:02Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T06:28:58Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T06:29:02Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:13Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T06:29:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:16Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T06:29:13Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:16Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T06:29:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:16Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T06:29:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:29:17Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T06:29:16Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824288"
      },
      {
        "completedAt": "2026-10-31T06:34:07Z",
        "conclusion": "success",
        "databaseId": 124466930565,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T06:34:05Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T06:34:05Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T06:34:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:34:06Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T06:34:05Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T06:34:06Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T06:34:06Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124466930565"
      }
    ],
    "status": "completed",
    "updatedAt": "2026-10-31T06:34:08Z"
  },
  "requiredChecks": {
    "test": {
      "id": 124465824188,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824188",
      "appId": 15368
    },
    "build": {
      "id": 124465824043,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824043",
      "appId": 15368
    },
    "typecheck": {
      "id": 124465824169,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824169",
      "appId": 15368
    },
    "protection": {
      "id": 124465824288,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124465824288",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124466930565,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41176764126/job/124466930565",
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
    "passed": 126,
    "failed": 0,
    "files": 4,
    "overlapNotAdditive": true
  },
  "rawSummaries": [
    "test\tFocused guest-entry regression checks\t2026-10-31T06:29:54.1523120Z  Test Files  4 passed (4)",
    "test\tFocused guest-entry regression checks\t2026-10-31T06:29:54.1524130Z       Tests  126 passed (126)",
    "test\tRun npx vitest run\t2026-10-31T06:33:59.5342599Z  Test Files  981 passed | 6 skipped (987)",
    "test\tRun npx vitest run\t2026-10-31T06:33:59.5447210Z       Tests  18282 passed | 83 skipped (18365)"
  ],
  "selectedFullCases": [
    "test\tRun npx vitest run\t2026-10-31T06:30:02.3204531Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (43 tests) 804ms",
    "test\tRun npx vitest run\t2026-10-31T06:30:09.3156121Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (52 tests) 5023ms",
    "test\tRun npx vitest run\t2026-10-31T06:30:50.8975541Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 3938ms",
    "test\tRun npx vitest run\t2026-10-31T06:30:52.5610759Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 458ms",
    "test\tRun npx vitest run\t2026-10-31T06:31:44.4038849Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4311ms",
    "test\tRun npx vitest run\t2026-10-31T06:33:33.3522042Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 7ms"
  ],
  "limits": {
    "independentAcceptance": "NOT OBSERVED; SAME c16 required",
    "nativeBrowserLiveAuthManagedDBStaffActivation": "NOT RUN",
    "serverAPI": "Synthetic queued pages and detail fixtures with real mounted React/JSDOM",
    "actualAccessOrCustomerRecords": "NONE",
    "KAN29OrKAN42Complete": false,
    "staffActivation10003And10241": "HELD; no grants/capability/flag/credentialincident/SQL changes",
    "PR345": "Separate pending129/2b3 excluded; no review poll or qualification rerun",
    "nativePG17": "NOT RUN/no host answer/no job",
    "production": "Draft/unmerged/not deployed; live e0f unchanged",
    "localHeavyRuntime": false,
    "rerunSoakWaiver": false
  },
  "artifactSHA256": {
    "RED_CI.json": "324ad49748e82dadcc649fd24b4b9cdcc43ecf4d3cbeaabf73ed138ebd1b3b2a",
    "RED_CI_LOG.txt": "05e6241286848700f5e78d454981f642a0ec8c5298bd8f476aff98f6f8c851e7",
    "RED_QUEUE_FAILURE_34bfd9c.json": "9bbb8f7b0041d85e0db409baff3270e363375da1d6edb1abaa887675e6622c4a",
    "GREEN_CI.json": "4ae6dc3e13158adfa2a5c626ce7be5713fa9edcc5c6e3ece74d77083ca6cad01",
    "GREEN_CI_LOG.txt": "d6086aeb2125b1a17d85b10a20a2143e967a1e4bd5cc684b0d6e0355af1c58fe",
    "GREEN_CHECK_RUNS.json": "a6320fa9ec409dd5645529798f7a4ebd9cbddd32a91c4e39f1c99181893d585d"
  }
}
