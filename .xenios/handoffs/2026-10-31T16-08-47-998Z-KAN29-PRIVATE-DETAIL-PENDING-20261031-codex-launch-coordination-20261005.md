{
  "state": "SOURCE_GREEN_PENDING_SAME_INDEPENDENT_ACCEPTANCE",
  "pr": 351,
  "source": "a613440ad98e29cb466146952f4cf3e3ae225023",
  "tree": "b41975198306758f50e1f85140f2c7a63a965a1f",
  "base": "8a35dc708dcc1bb4007038e0dc35d90864cfcc94",
  "task": "KAN29-PRIVATE-DETAIL-PENDING-20261031",
  "lease": "b5df6cf2-9998-4017-9455-5e890521d07f",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41217345765,
    "event": "pull_request",
    "headSha": "a613440ad98e29cb466146952f4cf3e3ae225023",
    "jobs": [
      {
        "completedAt": "2026-10-31T15:58:43Z",
        "conclusion": "success",
        "databaseId": 124584545947,
        "name": "typecheck",
        "startedAt": "2026-10-31T15:58:01Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:58:02Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:58:02Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:06Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:58:02Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:12Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:58:06Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:18Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:58:12Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:40Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T15:58:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:41Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T15:58:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:41Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T15:58:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:41Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T15:58:41Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584545947"
      },
      {
        "completedAt": "2026-10-31T15:58:43Z",
        "conclusion": "success",
        "databaseId": 124584546203,
        "name": "protection",
        "startedAt": "2026-10-31T15:58:02Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:58:04Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:58:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:19Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:25Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:58:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:37Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:58:25Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:37Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T15:58:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:40Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T15:58:37Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:40Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T15:58:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:40Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T15:58:40Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:40Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T15:58:40Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546203"
      },
      {
        "completedAt": "2026-10-31T15:58:40Z",
        "conclusion": "success",
        "databaseId": 124584546210,
        "name": "build",
        "startedAt": "2026-10-31T15:58:02Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:58:04Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:58:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:09Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:16Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:58:09Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:28Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:58:16Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:36Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T15:58:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:36Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T15:58:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:37Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T15:58:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:37Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T15:58:37Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546210"
      },
      {
        "completedAt": "2026-10-31T16:04:55Z",
        "conclusion": "success",
        "databaseId": 124584546298,
        "name": "test",
        "startedAt": "2026-10-31T15:58:02Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T15:58:04Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T15:58:03Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:17Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T15:58:04Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:24Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T15:58:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:58:36Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T15:58:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T15:59:24Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T15:58:36Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:50Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T15:59:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:50Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T16:04:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:51Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T16:04:50Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:51Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T16:04:51Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546298"
      },
      {
        "completedAt": "2026-10-31T16:05:00Z",
        "conclusion": "success",
        "databaseId": 124586211052,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T16:04:58Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:04:59Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:04:58Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:59Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T16:04:59Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:04:59Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T16:04:59Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124586211052"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765"
  },
  "requiredChecks": {
    "test": {
      "id": 124584546298,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546298",
      "appId": 15368
    },
    "typecheck": {
      "id": 124584545947,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584545947",
      "appId": 15368
    },
    "build": {
      "id": 124584546210,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546210",
      "appId": 15368
    },
    "protection": {
      "id": 124584546203,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124584546203",
      "appId": 15368
    },
    "Required CI completion": {
      "id": 124586211052,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41217345765/job/124586211052",
      "appId": 15368
    }
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T16:04:50.3536683Z  Test Files  982 passed | 6 skipped (988)",
    "test\tRun npx vitest run\t2026-10-31T16:04:50.3717872Z       Tests  18308 passed | 83 skipped (18391)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T15:59:24.4701054Z       Tests  131 passed (131)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T15:59:40.2451535Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (57 tests) 6671ms",
    "test\tRun npx vitest run\t2026-10-31T15:59:44.0158296Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (43 tests) 1391ms",
    "test\tRun npx vitest run\t2026-10-31T16:00:36.0212504Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4102ms",
    "test\tRun npx vitest run\t2026-10-31T16:00:39.2787493Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 595ms",
    "test\tRun npx vitest run\t2026-10-31T16:01:47.5118193Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4530ms",
    "test\tRun npx vitest run\t2026-10-31T16:02:55.3443284Z  \u2713 client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx (8 tests) 245ms",
    "test\tRun npx vitest run\t2026-10-31T16:03:39.5610820Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (17 tests) 77ms",
    "test\tRun npx vitest run\t2026-10-31T16:04:05.5586819Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 8ms",
    "test\tRun npx vitest run\t2026-10-31T16:04:22.9118187Z  \u2713 client/src/care/CareRequestIntentPage.test.tsx (4 tests) 125ms",
    "test\tRun npx vitest run\t2026-10-31T16:04:44.9347997Z  \u2713 client/src/care/section.request-intents.test.tsx (1 test) 34ms"
  ],
  "provider": "81c42900f75df1972ffb7a82d2e6ae4bb2bf8a77",
  "providerTreeExact": true,
  "paths": {
    "client/src/research/assisted-order/RequestIntentStaffReadback.tsx": {
      "base": "a46960cada352ea6cba0305c2db7c6472dd501f3",
      "candidate": "1d848bc163996456163379845ea93443a728564a"
    },
    "client/src/research/assisted-order/RequestIntentStaffReadback.test.tsx": {
      "base": null,
      "candidate": "9901e0303378214284b8bd6d17908b46afc2155a"
    }
  },
  "testBlobRedAndGreen": "9901e0303378214284b8bd6d17908b46afc2155a",
  "testRawByteIdenticalRedToCorrected": true,
  "allExistingTestsUntouched": true,
  "delta": "2paths+135/-5; runtime+16/-5, NEWtest119lines8cases",
  "red": {
    "source": "a650fb1cab83fa8cd5a425febb3458515e331b00",
    "tree": "c0cb4f2bcb7c41180637d590549d078b1bee9a84",
    "run": {
      "attempt": 1,
      "conclusion": "failure",
      "databaseId": 41216777025,
      "event": "pull_request",
      "headSha": "a650fb1cab83fa8cd5a425febb3458515e331b00",
      "jobs": [
        {
          "completedAt": "2026-10-31T15:57:24Z",
          "conclusion": "failure",
          "databaseId": 124582836645,
          "name": "test",
          "startedAt": "2026-10-31T15:50:47Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:50:49Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:50:48Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:50:59Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:50:49Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:05Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:50:59Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:17Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:51:05Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:52:04Z",
              "conclusion": "success",
              "name": "Focused guest-entry regression checks",
              "number": 5,
              "startedAt": "2026-10-31T15:51:17Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:21Z",
              "conclusion": "failure",
              "name": "Run npx vitest run",
              "number": 6,
              "startedAt": "2026-10-31T15:52:04Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:21Z",
              "conclusion": "skipped",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T15:57:21Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:22Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T15:57:21Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:22Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T15:57:22Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025/job/124582836645"
        },
        {
          "completedAt": "2026-10-31T15:51:53Z",
          "conclusion": "success",
          "databaseId": 124582836764,
          "name": "typecheck",
          "startedAt": "2026-10-31T15:50:47Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:50:49Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:50:48Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:50:53Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:50:49Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:50:58Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:50:53Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:09Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:50:58Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:51Z",
              "conclusion": "success",
              "name": "Run npm run check",
              "number": 5,
              "startedAt": "2026-10-31T15:51:09Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:51Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T15:51:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:51Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T15:51:51Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:51Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T15:51:51Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025/job/124582836764"
        },
        {
          "completedAt": "2026-10-31T15:51:21Z",
          "conclusion": "success",
          "databaseId": 124582836837,
          "name": "build",
          "startedAt": "2026-10-31T15:50:48Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:50:50Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:50:49Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:50:55Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:50:50Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:02Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:50:55Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:11Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:51:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Run npm run build",
              "number": 5,
              "startedAt": "2026-10-31T15:51:11Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T15:51:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:19Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T15:51:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:19Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T15:51:19Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025/job/124582836837"
        },
        {
          "completedAt": "2026-10-31T15:51:21Z",
          "conclusion": "success",
          "databaseId": 124582836890,
          "name": "protection",
          "startedAt": "2026-10-31T15:50:48Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:50:49Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:50:49Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:00Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T15:50:49Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:06Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T15:51:00Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:16Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T15:51:06Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:16Z",
              "conclusion": "success",
              "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
              "number": 5,
              "startedAt": "2026-10-31T15:51:16Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Run npm run verify:route-uniqueness",
              "number": 6,
              "startedAt": "2026-10-31T15:51:16Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T15:51:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T15:51:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:51:18Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T15:51:18Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025/job/124582836890"
        },
        {
          "completedAt": "2026-10-31T15:57:29Z",
          "conclusion": "failure",
          "databaseId": 124584414882,
          "name": "Required CI completion",
          "startedAt": "2026-10-31T15:57:27Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T15:57:27Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T15:57:27Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:27Z",
              "conclusion": "failure",
              "name": "Refuse unsuccessful or missing required jobs",
              "number": 2,
              "startedAt": "2026-10-31T15:57:27Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T15:57:28Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 3,
              "startedAt": "2026-10-31T15:57:28Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025/job/124584414882"
        }
      ],
      "status": "completed",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41216777025"
    },
    "provider": "6a1847fbc256816ab76df513f7affa60c349fbdd",
    "actualFull": "18302PASS6intendedFAIL83SKIP/981PASS1FAIL6SKIPfiles",
    "dedicated": "2PASS6intendedFAILof8",
    "twoControls": "Invalid reference and replacement-view isolation; latter alone does not prove cleanup sequence, also source-traced",
    "focused": "131PASS overlapsfull",
    "buildTypecheckProtection": "PASS",
    "harnessFailure": false,
    "qualificationSHA256": "3a106bfe36f7cf244fb991c02e6eba6f5ccc268d5b428e22952040153674a67f"
  },
  "outcome": "Explicit valid private detail retrieval announces pending with role=status and aria-busy/disabledRetrieve; synchronous ref suppresses same-turn duplicate submits before sequence advance. Input edits or queue selection invalidate old response and release old pending without automatic read; only current sequence finally releases active pending. Existing sequence/unmount cleanup and epoch-keyed Care wrapper remain. Failure releases pending for explicit retry; no automatic retry. Queue loading/errors/navigation and customer endpoints unchanged.",
  "authorship": "Root source/tests; finite quick_order_selection_unit ROtrace/testcontract/harness/finalsource assistance, NOT independent acceptance. SAMEexistingc16 exact-source review required.",
  "preserved": "PR349367sixpaths/qualification/SAME10405 and PR3502a2paths/qualification/SAME10406 stable; allthree candidates independently basedLIVE8a; counts NOT combined qualification. PR348release-staticCLOSED.",
  "limits": {
    "mountedReactJSDOMSyntheticAPIOnly": true,
    "applicationNetwork": "NOT RUN",
    "privateStaffCustomerContents": "NOT RUN",
    "liveAuthOrCareSession": "NOT RUN; replacement component fixture only",
    "nativeBrowser": "NOT RUN; old allowance consumed",
    "managedSQL": "NOT RUN; no read",
    "nativePG17": "NOT RUN/nohost/nojob; hosted baselinePGguards not native qualification",
    "fullKAN29OrKAN42": "INCOMPLETE; security/principal/purposecapability/flag/incident/audit/activation10003+10241HELD",
    "newAPIAuthCareCoreServerSQLConfigRoleCapabilityFlagNotificationProviderPaymentChange": false,
    "productionThisSource": false,
    "newSkipWaiverRerunSoakLocalNodeHeavyJob": false,
    "hostedJobsSerialized": true
  },
  "artifactSHA256": {
    "ACTIVE_CHECKPOINT_PREFIX.md": "d86d2d5e00e4ce2f81376717240cbfeb6ce1e537c865f5a8ec7f6b24e36918fb",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "c81cfa6b32d470238a2e306ff94e6e44b76cded5e0d435d956cabd06c1e3eec8",
    "capture_red.py": "8389e331cc6cb9326327ba8181cad3f494ea4b320484d349a0e3001570677ca1",
    "checkpoint_active.py": "e10b5496094547e270f542edb666bc6322fa548670b6da1ee731bd0a289e3e83",
    "CLAIM_READBACK.json": "701b02f71707285bce4099fb2dd1a09d871521d305697bf616a8e8bb07f8e7ea",
    "diagnose_claim.py": "a219fc158037a7000ba598a94712caa30f6429b510831644c79913b23e2ee346",
    "GREEN_CHECK_RUNS.json": "53f2391c8725a4a74cbab8c447c1a239b0ab802ee291f865ce4f0903e7a44894",
    "GREEN_CI.json": "f73f1aa52ea39e28ed4bc75af987ad5ca575ae8127d8b69e8ee09de609da7af7",
    "GREEN_CI_LOG.txt": "6297396cc3e432d7003743ee7dee5c3da23f20235f870b77a4743028fe593bc2",
    "HELPER_SOURCE_ASSISTANCE.json": "2906b868f2be8c9bc25d0b9cefb5165c503fcfb223c1631611d21c07b83d1171",
    "PREPARED_RUNTIME_CORRECTION.patch": "48d833afb0b84ca55fcb31b04a66a97f8385aeaf1ce33d9eb87e18885eca3e62",
    "prepare_claim_verifier.py": "2108fc5bee32d26d69ad293f69738633ba8131b0cd2159a08cb2684e1694fd2a",
    "prepare_qa_verifier.py": "8beb58dcf3681652ff78c7b207923e80f6689820711c07b560f1cdd8fd8088f3",
    "PR_BODY_RED.md": "aa336a9aff5de96755d146738466bb6351465126cc8cea626770846de3bd9056",
    "QUALIFIED_PR.json": "8d892b31d7486cff2c0fa9c5804152d4e615bbc7848a0f55954c8521cd359552",
    "qualify_green.py": "18b3878b45b5b5944868c6710508161121af35e72897bbf0b751b0a8c9f91fce",
    "RED_CHECK_RUNS.json": "77e5a8245e8875b9d7f9b87d9e6c7e59eaab921bc338b7ac63b9ff7b50bfcf4a",
    "RED_CI.json": "a7e0a42aa5617a4100ee66ff45f20b957af69cd1038ecf077ecf527988f46295",
    "RED_CI_LOG.txt": "b8e3b3846ad5651012f52ebaa81fee7fe9787502bc4472d807b319be816aeebd",
    "RED_DETAIL_PENDING_FAILURE_a650fb1.json": "3a106bfe36f7cf244fb991c02e6eba6f5ccc268d5b428e22952040153674a67f",
    "SOURCE_DIFF.patch": "fb22fc2cd2b1f0e8b77ae9ab9b94b31b939273ecc3167673bca7483a181f697e",
    "SOURCE_RequestIntentStaffReadback.test.tsx": "80bc3f7fb4daefc364bacf36d922b067f65217551c59f52e398eb25fdf137522",
    "SOURCE_RequestIntentStaffReadback.tsx": "2ff7e58c50232423da140812a02d07ae9b14f3dc919f600294bbdcf27ea57bee",
    "verify_claim.py": "5b660f51a7f0e4ae4579f9e4f1f9b947e1f00d91493fabe2d1409b6d59c541b0",
    "verify_qa_custody.py": "8c63f3b1bcb210124e10a2f9022e6f9dfabc3df37af31d25d7e3f8339c68b14e"
  }
}
