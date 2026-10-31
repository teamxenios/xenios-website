{
  "state": "SOURCE_GREEN_PENDING_SAME_INDEPENDENT_ACCEPTANCE",
  "pr": 353,
  "source": "59b828b32a7ee5d71d5e58f64cd887b2c1a94e2c",
  "tree": "05ac2cf24fb5b717f32cfb9140260254ac99adbb",
  "base": "a704fb939da02171cf5d64f6b8946f378368b121",
  "task": "KAN31-CONFIRMED-RECEIPT-FOCUS-20261031",
  "lease": "4056057a-cd9d-443c-af2c-3dcda495d356",
  "run": {
    "attempt": 1,
    "conclusion": "success",
    "databaseId": 41221667841,
    "event": "pull_request",
    "headSha": "59b828b32a7ee5d71d5e58f64cd887b2c1a94e2c",
    "jobs": [
      {
        "completedAt": "2026-10-31T16:51:50Z",
        "conclusion": "success",
        "databaseId": 124597322225,
        "name": "protection",
        "startedAt": "2026-10-31T16:51:16Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:51:18Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:51:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:30Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:51:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:35Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:51:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:46Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:51:35Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:46Z",
            "conclusion": "success",
            "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
            "number": 5,
            "startedAt": "2026-10-31T16:51:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:48Z",
            "conclusion": "success",
            "name": "Run npm run verify:route-uniqueness",
            "number": 6,
            "startedAt": "2026-10-31T16:51:46Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:49Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T16:51:48Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:49Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T16:51:49Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:49Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T16:51:49Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322225"
      },
      {
        "completedAt": "2026-10-31T16:51:49Z",
        "conclusion": "success",
        "databaseId": 124597322373,
        "name": "build",
        "startedAt": "2026-10-31T16:51:16Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:51:18Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:51:17Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:22Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:51:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:28Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:51:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:39Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:51:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:47Z",
            "conclusion": "success",
            "name": "Run npm run build",
            "number": 5,
            "startedAt": "2026-10-31T16:51:39Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:47Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T16:51:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:47Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T16:51:47Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:47Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T16:51:47Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322373"
      },
      {
        "completedAt": "2026-10-31T16:52:24Z",
        "conclusion": "success",
        "databaseId": 124597322402,
        "name": "typecheck",
        "startedAt": "2026-10-31T16:51:17Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:51:19Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:51:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:24Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:51:19Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:30Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:51:24Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:41Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:51:30Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:52:22Z",
            "conclusion": "success",
            "name": "Run npm run check",
            "number": 5,
            "startedAt": "2026-10-31T16:51:41Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:52:22Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 9,
            "startedAt": "2026-10-31T16:52:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:52:22Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 10,
            "startedAt": "2026-10-31T16:52:22Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:52:22Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 11,
            "startedAt": "2026-10-31T16:52:22Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322402"
      },
      {
        "completedAt": "2026-10-31T16:57:56Z",
        "conclusion": "success",
        "databaseId": 124597322437,
        "name": "test",
        "startedAt": "2026-10-31T16:51:17Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:51:18Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:51:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:28Z",
            "conclusion": "success",
            "name": "Run actions/checkout@v4",
            "number": 2,
            "startedAt": "2026-10-31T16:51:18Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:34Z",
            "conclusion": "success",
            "name": "Run actions/setup-node@v4",
            "number": 3,
            "startedAt": "2026-10-31T16:51:28Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:51:45Z",
            "conclusion": "success",
            "name": "Run npm ci",
            "number": 4,
            "startedAt": "2026-10-31T16:51:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:52:34Z",
            "conclusion": "success",
            "name": "Focused guest-entry regression checks",
            "number": 5,
            "startedAt": "2026-10-31T16:51:45Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:57:53Z",
            "conclusion": "success",
            "name": "Run npx vitest run",
            "number": 6,
            "startedAt": "2026-10-31T16:52:34Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:57:53Z",
            "conclusion": "success",
            "name": "Post Run actions/setup-node@v4",
            "number": 11,
            "startedAt": "2026-10-31T16:57:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:57:53Z",
            "conclusion": "success",
            "name": "Post Run actions/checkout@v4",
            "number": 12,
            "startedAt": "2026-10-31T16:57:53Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:57:53Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 13,
            "startedAt": "2026-10-31T16:57:53Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322437"
      },
      {
        "completedAt": "2026-10-31T16:58:03Z",
        "conclusion": "success",
        "databaseId": 124598880256,
        "name": "Required CI completion",
        "startedAt": "2026-10-31T16:57:59Z",
        "status": "completed",
        "steps": [
          {
            "completedAt": "2026-10-31T16:58:00Z",
            "conclusion": "success",
            "name": "Set up job",
            "number": 1,
            "startedAt": "2026-10-31T16:58:00Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:58:00Z",
            "conclusion": "success",
            "name": "Refuse unsuccessful or missing required jobs",
            "number": 2,
            "startedAt": "2026-10-31T16:58:00Z",
            "status": "completed"
          },
          {
            "completedAt": "2026-10-31T16:58:00Z",
            "conclusion": "success",
            "name": "Complete job",
            "number": 3,
            "startedAt": "2026-10-31T16:58:00Z",
            "status": "completed"
          }
        ],
        "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124598880256"
      }
    ],
    "status": "completed",
    "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841"
  },
  "requiredChecks": {
    "test": {
      "id": 124597322437,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322437",
      "app": 15368
    },
    "typecheck": {
      "id": 124597322402,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322402",
      "app": 15368
    },
    "build": {
      "id": 124597322373,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322373",
      "app": 15368
    },
    "protection": {
      "id": 124597322225,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124597322225",
      "app": 15368
    },
    "Required CI completion": {
      "id": 124598880256,
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221667841/job/124598880256",
      "app": 15368
    }
  },
  "full": {
    "passed": 18342,
    "failed": 0,
    "skipped": 83,
    "filesPassed": 982,
    "filesSkipped": 6
  },
  "fullRaw": [
    "test\tRun npx vitest run\t2026-10-31T16:57:52.8556802Z  Test Files  982 passed | 6 skipped (988)",
    "test\tRun npx vitest run\t2026-10-31T16:57:52.8737277Z       Tests  18342 passed | 83 skipped (18425)"
  ],
  "focusedRaw": [
    "test\tFocused guest-entry regression checks\t2026-10-31T16:52:34.2375629Z       Tests  145 passed (145)"
  ],
  "focusedOverlapNotAdditive": true,
  "perFileRaw": [
    "test\tRun npx vitest run\t2026-10-31T16:52:50.2682099Z  \u2713 client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx (71 tests) 7848ms",
    "test\tRun npx vitest run\t2026-10-31T16:52:54.2759813Z  \u2713 client/src/research/assisted-order/RequestIntentForm.test.tsx (46 tests) 1311ms",
    "test\tRun npx vitest run\t2026-10-31T16:53:44.3144834Z  \u2713 client/src/research/assisted-order/RequestIntentForm.durable-journey.pg.test.tsx (1 test) 4271ms",
    "test\tRun npx vitest run\t2026-10-31T16:53:47.2429633Z  \u2713 client/src/research/early-access/EarlyAccessRoute.logout.test.tsx (15 tests) 633ms",
    "test\tRun npx vitest run\t2026-10-31T16:54:52.7626883Z  \u2713 server/research/assisted-order/request-intent/durable-journey.pg.test.ts (1 test) 4350ms",
    "test\tRun npx vitest run\t2026-10-31T16:55:29.2200202Z  \u2713 client/src/research/assisted-order/request-intent-api.test.ts (39 tests) 123ms",
    "test\tRun npx vitest run\t2026-10-31T16:57:07.1385965Z  \u2713 server/research/assisted-order/request-intent/composition.integration.test.ts (4 tests) 7ms",
    "test\tRun npx vitest run\t2026-10-31T16:57:44.7910122Z  \u2713 client/src/research/assisted-order/RequestIntentReceipt.test.tsx (3 tests) 65ms"
  ],
  "provider": "0f825cbbb4e9621482e996d7a57712aaa2654698",
  "providerTreeExact": true,
  "jobCheckoutSHAs": {
    "protection": "59b828b32a7ee5d71d5e58f64cd887b2c1a94e2c",
    "build": "0f825cbbb4e9621482e996d7a57712aaa2654698",
    "typecheck": "0f825cbbb4e9621482e996d7a57712aaa2654698",
    "test": "0f825cbbb4e9621482e996d7a57712aaa2654698"
  },
  "allJobCheckoutTreesExact": true,
  "paths": {
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": {
      "base": "6c17d083808e8470349a4f5e90a7510e6cb739cd",
      "candidate": "71cc61a380f9263148b1c39d7f231ba05ccfcf39"
    },
    "client/src/research/assisted-order/RequestIntentReceipt.test.tsx": {
      "base": null,
      "candidate": "e304e112822f7da2089b2cf85fce28c5ace14405"
    },
    "client/src/research/assisted-order/RequestIntentReceipt.tsx": {
      "base": "66ad54df9159df1ca918455d6cd683f4a4acdcfc",
      "candidate": "88903e2279672279cc51e5d350f32571419f5b09"
    }
  },
  "testBlobsRawByteIdenticalRedToCorrected": {
    "client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx": "71cc61a380f9263148b1c39d7f231ba05ccfcf39",
    "client/src/research/assisted-order/RequestIntentReceipt.test.tsx": "e304e112822f7da2089b2cf85fce28c5ace14405"
  },
  "allOldCasesRetained": true,
  "oneExistingSubmitCaseStrengthened": true,
  "red": {
    "qualificationSHA256": "bee7109121564da4d9f25631c13d95653a8416bed2738768aad98827c2560041",
    "run": {
      "attempt": 1,
      "conclusion": "failure",
      "databaseId": 41221406203,
      "event": "pull_request",
      "headSha": "7963e5f83419e769cb22ac5cc1dfd762876daa53",
      "jobs": [
        {
          "completedAt": "2026-10-31T16:48:57Z",
          "conclusion": "success",
          "databaseId": 124596549744,
          "name": "typecheck",
          "startedAt": "2026-10-31T16:48:01Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T16:48:02Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T16:48:01Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:06Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T16:48:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:12Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T16:48:06Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:21Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T16:48:12Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:55Z",
              "conclusion": "success",
              "name": "Run npm run check",
              "number": 5,
              "startedAt": "2026-10-31T16:48:21Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:55Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T16:48:55Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:55Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T16:48:55Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:55Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T16:48:55Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203/job/124596549744"
        },
        {
          "completedAt": "2026-10-31T16:49:22Z",
          "conclusion": "failure",
          "databaseId": 124596549907,
          "name": "test",
          "startedAt": "2026-10-31T16:48:01Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T16:48:02Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T16:48:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:13Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T16:48:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:19Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T16:48:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:31Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T16:48:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:19Z",
              "conclusion": "failure",
              "name": "Focused guest-entry regression checks",
              "number": 5,
              "startedAt": "2026-10-31T16:48:31Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:19Z",
              "conclusion": "skipped",
              "name": "Run npx vitest run",
              "number": 6,
              "startedAt": "2026-10-31T16:49:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:19Z",
              "conclusion": "skipped",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T16:49:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:20Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T16:49:19Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:20Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T16:49:20Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203/job/124596549907"
        },
        {
          "completedAt": "2026-10-31T16:48:31Z",
          "conclusion": "success",
          "databaseId": 124596549951,
          "name": "protection",
          "startedAt": "2026-10-31T16:48:01Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T16:48:02Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T16:48:01Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:13Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T16:48:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:18Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T16:48:13Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:27Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T16:48:18Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:27Z",
              "conclusion": "success",
              "name": "Run node scripts/acceptance/verify-core-site-protection.mjs \"$BASE_REF\" HEAD",
              "number": 5,
              "startedAt": "2026-10-31T16:48:27Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:29Z",
              "conclusion": "success",
              "name": "Run npm run verify:route-uniqueness",
              "number": 6,
              "startedAt": "2026-10-31T16:48:27Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:29Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 11,
              "startedAt": "2026-10-31T16:48:29Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:29Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 12,
              "startedAt": "2026-10-31T16:48:29Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:29Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 13,
              "startedAt": "2026-10-31T16:48:29Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203/job/124596549951"
        },
        {
          "completedAt": "2026-10-31T16:48:38Z",
          "conclusion": "success",
          "databaseId": 124596550154,
          "name": "build",
          "startedAt": "2026-10-31T16:48:01Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T16:48:03Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T16:48:02Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:08Z",
              "conclusion": "success",
              "name": "Run actions/checkout@v4",
              "number": 2,
              "startedAt": "2026-10-31T16:48:03Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:15Z",
              "conclusion": "success",
              "name": "Run actions/setup-node@v4",
              "number": 3,
              "startedAt": "2026-10-31T16:48:08Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:27Z",
              "conclusion": "success",
              "name": "Run npm ci",
              "number": 4,
              "startedAt": "2026-10-31T16:48:15Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:35Z",
              "conclusion": "success",
              "name": "Run npm run build",
              "number": 5,
              "startedAt": "2026-10-31T16:48:27Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:35Z",
              "conclusion": "success",
              "name": "Post Run actions/setup-node@v4",
              "number": 9,
              "startedAt": "2026-10-31T16:48:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:35Z",
              "conclusion": "success",
              "name": "Post Run actions/checkout@v4",
              "number": 10,
              "startedAt": "2026-10-31T16:48:35Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:48:35Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 11,
              "startedAt": "2026-10-31T16:48:35Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203/job/124596550154"
        },
        {
          "completedAt": "2026-10-31T16:49:28Z",
          "conclusion": "failure",
          "databaseId": 124596879906,
          "name": "Required CI completion",
          "startedAt": "2026-10-31T16:49:25Z",
          "status": "completed",
          "steps": [
            {
              "completedAt": "2026-10-31T16:49:25Z",
              "conclusion": "success",
              "name": "Set up job",
              "number": 1,
              "startedAt": "2026-10-31T16:49:25Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:26Z",
              "conclusion": "failure",
              "name": "Refuse unsuccessful or missing required jobs",
              "number": 2,
              "startedAt": "2026-10-31T16:49:26Z",
              "status": "completed"
            },
            {
              "completedAt": "2026-10-31T16:49:26Z",
              "conclusion": "success",
              "name": "Complete job",
              "number": 3,
              "startedAt": "2026-10-31T16:49:26Z",
              "status": "completed"
            }
          ],
          "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203/job/124596879906"
        }
      ],
      "status": "completed",
      "url": "https://github.com/teamxenios/xenios-website/actions/runs/41221406203"
    },
    "source": "7963e5f83419e769cb22ac5cc1dfd762876daa53",
    "tree": "f0d2b9cd8e55b7d567881c1c1e304cf042f3fd33",
    "provider": "2af3cb3c8cb3064a6ec8773598d1853764b1b9aa",
    "fullSuite": "NOT RUN; focused-stage failure",
    "threeSharedComponentCases": "NOT RUN on red; executed in actual green full suite",
    "assertionClassification": {
      "run": 41221406203,
      "source": "7963e5f83419e769cb22ac5cc1dfd762876daa53",
      "tree": "f0d2b9cd8e55b7d567881c1c1e304cf042f3fd33",
      "qualificationSHA256": "bee7109121564da4d9f25631c13d95653a8416bed2738768aad98827c2560041",
      "classification": "INTENDED FOCUS REGRESSION; no harness failure in this qualifying run",
      "actualFocused": {
        "passed": 144,
        "failed": 1,
        "filesPassed": 3,
        "filesFailed": 1
      },
      "failure": "storefront.test.tsx:903 document.activeElement is the remounted receipt H1, expected the deliberately focused surviving surrounding-navigation anchor",
      "reachedBeforeFailure": [
        "recovery confirmed",
        "navigation focused",
        "navigation connected and still focused during checking",
        "receipt hidden during checking",
        "receipt restored after same verified member"
      ],
      "assertionsAfterFailure": "NOT reached on red; no-extra-POST, fresh-form absence and root.render count require green execution",
      "openIntakeExpiryAndStrengthenedSubmitControls": "PASS in the 144 focused passes",
      "fullSuiteAndThreeSharedComponentCases": "NOT RUN on red; full stage skipped after focused failure",
      "buildTypecheckProtection": "PASS",
      "testAndCompletion": "FAIL as expected",
      "initialFixtureFailure": "Separate preserved run41221073994/sourcecdb8ef8; NOT treated as focus-regression evidence",
      "runtimeBeforeCorrection": "UNCHANGED accepted blob66ad54df9159df1ca918455d6cd683f4a4acdcfc",
      "oldRunRerunOrWaiver": false
    }
  },
  "outcome": "A confirmed receipt remount preserves deliberately focused surviving controls. When body/null has focus, confirmation heading focus requests preventScroll:true. Existing default no-focus/ref behavior and all receipt ownership/reset/submission contracts preserved. Added open-intake expiry remount and fresh-products-form absence assertions.",
  "authorship": "Root runtime/tests; finite quick_order_selection_unit source trace/proposal assistance NOT independent acceptance. SAMEexistingc16 exact-source review required.",
  "preserved": "Accepted349350 exact source integrated/released through352a704; pending351a613 stays separate. Original source branches/qualifications preserved.",
  "limits": {
    "mountedReactJSDOMSyntheticFixturesOnly": true,
    "nativeScrollBehavior": "NOT PROVEN; only focus options and activeElement checked",
    "applicationNetwork": "NOT RUN",
    "liveAuthCustomerOrStaffContents": "NOT RUN",
    "nativeBrowser": "NOT RUN; old scopes consumed",
    "managedSQL": "NOT RUN/no read",
    "nativePG17": "NOT RUN/nohost/nojob; hosted baseline PG guards not native qualification",
    "newOwnershipAttemptSubmissionStorageContactPayloadTokenAuthCareCoreAPIServerSQLConfigFlagRoleProviderPaymentActivationChange": false,
    "productionThisSource": false,
    "newSkipWaiverRerunSoakLocalNodeHeavyJob": false,
    "hostedJobsSerialized": true
  },
  "artifactSHA256": {
    "ACTIVE_CHECKPOINT_PREFIX.md": "d02c9f701f4aa77042b2edd86b5bc163a119872fd7dd4ca0637cc1662721adee",
    "ACTIVE_CHECKPOINT_RECEIPT.json": "e5d89d6dd67c2c55214d11433b681fdc73e8da5f18d343a38d1c1a31ecdd5034",
    "capture_qualifying_red.py": "884f765413d8ac0773bc4c935bce2917fe13818f3e14f0f05b249fd72d24ee76",
    "capture_red.py": "520ffcb5866e3e67008ae0d39f248f3695d1bfc6902d94d7ac9c135378e9a2f6",
    "checkpoint_active.py": "914df81a4fd88f99a76d6dba4f82a5326afa35e3be17f3a7446768cbe761c53e",
    "CLAIM_READBACK.json": "2a474fc33fe8371e85c3448cb5f92f537d97056940d8272eaf48fa9b50fd9af6",
    "GREEN_CHECK_RUNS.json": "6964f5c031628fdf03ea0ba64465582f2995ca33fc471abd89a5a265000cb676",
    "GREEN_CI.json": "65956f9317c7b7b6664ed5c6294f8c8fb3b9149be3f5be82b68a08309cedba9a",
    "GREEN_CI_LOG.txt": "5a0d76b403527bd1e56e42af0ad397de5817191054ce80a79b717bf33c000a8b",
    "INITIAL_FIXTURE_FAILURE_DISCLOSED.json": "18b5d1fa01dc2a445a1eef85e2abcc359b5f7ed216eeecfc9965cd714e8fa96b",
    "INITIAL_RED_ARCHIVE_RECEIPT.json": "05f2a9c56e87e0f2bbab9f452ae2da9647359f9c7a45435a29b5991cd2ed9e3c",
    "INITIAL_RED_CHECK_RUNS_cdb8ef8.json": "87cf6c66aa0f7b39cc9e6273288b8b189c84e89f0c526af8ec9f8b7230098f19",
    "INITIAL_RED_CI_cdb8ef8.json": "5131f3a575b65488b1c43ca4416d23e2cc5aa5266183bae77e9f8a454579ea46",
    "INITIAL_RED_CI_LOG_cdb8ef8.txt": "4f17e33cdf76bbd71d0034fa8158655abad43bf56b761c4fe12a8f1d788cc427",
    "INITIAL_RED_FIXTURE_CLASSIFICATION.json": "a39b886cb3489dc6f1e40793c33fd22ffdb8c6613a33053bf5f818f880f3f53a",
    "PR353_RELEASE_INPUTS_PENDING_ACCEPTANCE.json": "923c1aa6966153841bed963ec36d01bbfc9fc29dbfddc60948653fa5f018a8d6",
    "PR_BODY_IMPLEMENTED.md": "641b6ed9de67f5ea12d3fa6077a873366030a83b56af2a6d04d6e83c778c79dd",
    "PR_BODY_RED.md": "21eb7f0b568138bf8bdc30e9f11fd28a21f5df7288233c3487e44a610114d799",
    "PR_BODY_RED_7963e5f.md": "18ff4f8db7b45f7eefa92f08892785a61e763c6eeff2eabfce581f084802767b",
    "QUALIFIED_PR.json": "eb1ab5c4ee8c8574e43fc6f77fb463b3a1112769afbb19179f2bd56ba699e38f",
    "qualify_green.py": "ce584fd6601c32183b8e61ca9f42126ece9ebb451b7c7486ff096510597b88e9",
    "RED_ASSERTION_CLASSIFICATION.json": "0ea740f9e1ce999eeef01037ae5d108ba4b642562cc775d836cc719b2d6ac06b",
    "RED_CHECK_RUNS.json": "88e5bf2bccfb466b81292fc81e37473e393203a39a2f60d15cd23b9290dc1d5d",
    "RED_CI.json": "c13804f72446e3782aa8bc9d563569d08209eade09d1850a9946998e921b5eae",
    "RED_CI_LOG.txt": "125462931229adfc686d4eaad7bef370c5094654f0b943e197a68842f183cb75",
    "RED_FOCUS_FAILURE_7963e5f.json": "bee7109121564da4d9f25631c13d95653a8416bed2738768aad98827c2560041",
    "RED_FOCUS_FAILURE_cdb8ef8.json": "c99a12c6710363d7fda7bcd6d20f14eaed004a10c25d246df76ab21085659006",
    "SOURCE_DIFF.patch": "4746143009b1477c80bf3bbdd579ab0e264912e5229a55e0dd7eaa62888fe92d",
    "SOURCE_EarlyAccessRoute.storefront.test.tsx": "e833b70be70c618dbaa24fbf39d14f6ff09804403778fdece53c46e1c8e39d47",
    "SOURCE_RequestIntentReceipt.test.tsx": "ab1f13d25791904b87c1cad15e55d3e6cd5b9fd4146eb95e0a78bf9b148a1be5",
    "SOURCE_RequestIntentReceipt.tsx": "7bc39120164bf2769332daa3da8e8814d241fa5294366b7fa7c12513d6ea04bc",
    "TEST_ONLY_SOURCE_7963e5f.json": "f7165a7cd94425917345385b2a2033d3b4e4cd7903a4ceebf1290a2100234b46",
    "TEST_ONLY_SOURCE_cdb8ef8.json": "0487a19d663cc225f4a6952abfc4a67cf6777e17e10ff3c31f412756582a5eb4",
    "verify_claim.py": "3e4c64ba863f3c47f3f1d00ea133cddef2a43c9c457d85bc4d9613ae31615284",
    "verify_qa_custody.py": "4d4f766acba2df6dac09fa25f13af6786188219aacea744bcb847b467a4e46c2"
  }
}
